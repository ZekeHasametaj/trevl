import test from 'node:test';
import assert from 'node:assert/strict';

test('custom search understands written passenger counts and never truncates 12 to 2', () => {
  const draft = compileLocal('Paris vom 16. bis 18. Oktober, zwei Personen, Budget 900 CHF, Hotel kostenlos stornierbar, keine Extras.', {}, new Date('2026-09-25T10:00:00Z'));
  assert.equal(draft.trip.travelers, 2);
  assert.equal(draft.trip.destination.name, 'Paris');
  assert.ok(draft.hard_rules.some(r => r.kind === 'budget_total' && r.value === 900));
  assert.ok(draft.hard_rules.some(r => r.kind === 'travelers' && r.source.quote === 'zwei Personen'));
  const group = compileLocal('Paris vom 16. bis 18. Oktober, 12 Personen, Budget 900 CHF.', {}, new Date('2026-09-25T10:00:00Z'));
  assert.equal(group.trip.travelers, 12);
});
import { compileLocal } from '../server/app/compile.js';
import { sanitize } from '../server/app/llm.js';

const today = new Date('2026-09-25T08:00:00Z');
const rule = (d, id) => d.hard_rules.find(r => r.id === id);

test('full German sentence → rules with quotes from the text', () => {
  const d = compileLocal("Lissabon vom 9. bis 12. Oktober zu zweit, alles zusammen max. CHF 1'500, Hotel kostenlos stornierbar, keine Extras, frag mich, wenn du unsicher bist.", {}, today);
  assert.equal(d.ready, true);
  assert.equal(rule(d, 'budget_total').value, 1500);
  assert.equal(rule(d, 'budget_total').source.quote, "max. CHF 1'500");
  assert.equal(d.trip.destination.iata, 'LIS');
  assert.equal(d.trip.start_date, '2026-10-09');
  assert.equal(d.trip.end_date, '2026-10-12');
  assert.equal(d.trip.travelers, 2);
  assert.equal(rule(d, 'cancellable').applies_to[0], 'hotel');
  assert.ok(rule(d, 'no_extras'));
  assert.equal(d.uncertainty_policy, 'ask');
});

test('a date range is never read as a budget', () => {
  const d = compileLocal('Barcelona 9. bis 12. Oktober', {}, today);
  assert.equal(rule(d, 'budget_total'), undefined);
  assert.ok(d.missing.includes('budget'));
});

test('only a month → required date question with weekend options', () => {
  const d = compileLocal('Lissabon im Oktober, max CHF 1200', {}, today);
  assert.equal(d.ready, false);
  const q = d.open_questions.find(x => x.id === 'dates');
  assert.ok(q.required && q.options.length >= 2);
  const answered = compileLocal('Lissabon im Oktober, max CHF 1200', { dates: q.options[1].value, travelers: 2 }, today);
  assert.equal(answered.ready, true);
  assert.equal(answered.trip.travelers, 2);
});

test('per night, stars, direct flight, decline on uncertainty, per person budget', () => {
  const d = compileLocal('Rom 16.10.-19.10. mit meiner Freundin ab Genf, 700 EUR pro Person, Hotel max 120 pro Nacht, mind. 4 Sterne, nur Direktflug, im Zweifel ablehnen', {}, today);
  assert.equal(d.trip.origin.iata, 'GVA');
  assert.equal(d.trip.destination.iata, 'FCO');
  assert.equal(rule(d, 'budget_total').value, 1400);
  assert.equal(rule(d, 'budget_total').currency, 'EUR');
  assert.equal(rule(d, 'per_night').value, 120);
  assert.equal(rule(d, 'stars').value, 4);
  assert.equal(rule(d, 'direct').value, 0);
  assert.equal(d.uncertainty_policy, 'decline');
});

test('English works too', () => {
  const d = compileLocal('London October 23-26, 2 people, up to 2000 CHF, no extras, checked bags, ask me when uncertain', {}, today);
  assert.equal(d.trip.destination.iata, 'LHR');
  assert.equal(rule(d, 'budget_total').value, 2000);
  assert.ok(rule(d, 'bags'));
  assert.ok(!rule(d, 'no_extras').value.includes('baggage'));
});

test('model output is checked against the text: invented numbers and quotes are dropped', () => {
  const text = 'Paris im November, max CHF 900, frag mich';
  const clean = sanitize({ destination: 'Paris', destination_quote: 'Paris', budget_total: { amount: 9000, currency: 'CHF', quote: 'max CHF 9000' },
    uncertainty: { value: 'approve', quote: 'mach einfach' }, month: 11, other_requests: [] }, text);
  assert.equal(clean.destination, 'paris');
  assert.equal(clean.budget_total, undefined);
  assert.equal(clean.uncertainty, undefined);
  assert.equal(clean.month, 11);
});

test('Pristina (user report): destination, dates without dots, budget, cancellable hotel', () => {
  const d = compileLocal('Pristina vom 2 bis 18 Oktober, alles zusammen max. 2000 CHF Hotel stornierbar', {}, today);
  assert.equal(d.trip.destination.iata, 'PRN');
  assert.equal(d.trip.start_date, '2026-10-02');
  assert.equal(d.trip.end_date, '2026-10-18');
  assert.equal(rule(d, 'budget_total').value, 2000);
  assert.ok(rule(d, 'destination').value.includes('PRN'));
  assert.match(rule(d, 'destination').label, /Pristina \(Kosovo\)/);
  assert.equal(d.missing.includes('destination'), false);
});

test('a Swiss city without "ab" is the origin, not the destination', () => {
  const d = compileLocal('Zürich nach Skopje 9.-12.10., max CHF 900', {}, today);
  assert.equal(d.trip.origin.iata, 'ZRH');
  assert.equal(d.trip.destination.iata, 'SKP');
});

test('Banja Luka airport is recognised in free text without worldwide lookup', () => {
  for (const name of ['banja luka', 'Banja Luka', 'Banja  Luka', 'Banja-Luka', 'Banjaluka', 'Flughafen Banja Luka', 'Banja Luka Flughafen', 'BNX', 'bnx']) {
    const text = `Ab Zürich nach ${name} 5.-8. Oktober, zwei Personen, Budget 900 CHF`;
    const d = compileLocal(text, {}, today);
    assert.equal(d.ready, true, name);
    assert.equal(d.trip.origin.iata, 'ZRH', name);
    assert.equal(d.trip.destination.iata, 'BNX', name);
    assert.equal(d.trip.destination.country, 'BA', name);
    assert.ok(rule(d, 'destination').value.includes('BNX'), name);
    assert.ok(text.includes(rule(d, 'destination').source.quote), name);
  }
});

test('Banja Luka can also be the origin; partial city names are not accepted', () => {
  const d = compileLocal('Ab Banja Luka nach Paris 5.-8. Oktober, Budget 900 CHF', {}, today);
  assert.equal(d.trip.origin.iata, 'BNX');
  assert.equal(d.trip.destination.iata, 'CDG');
  const unknown = compileLocal('Banja Lukaville 5.-8. Oktober, Budget 900 CHF', {}, today);
  assert.ok(unknown.missing.includes('destination'));
});

test('typed Banja Luka airport answers resolve locally without a provider', async () => {
  const { findPlace } = await import('../server/app/geo.js');
  let providerCalls = 0;
  const duffel = { placeSuggestions: async () => { providerCalls++; return []; } };
  for (const name of ['banja luka', 'Flughafen Banja Luka', 'Banja Luka Flughafen', 'Banja Luka Airport', 'Airport Banja Luka', 'Banja-Luka', 'Banja  Luka', 'BNX', 'bnx']) {
    const result = await findPlace(name, duffel);
    assert.equal(result?.place.iata, 'BNX', name);
    assert.equal(result.place.source, 'ourairports', name);
    assert.equal(result.place.name, 'Banja Luka', name);
  }
  assert.equal(providerCalls, 0);
});

test('unknown towns are found through the airport search (stubbed), never words like Hotel or Oktober', async () => {
  const { findPlace, placeCandidates } = await import('../server/app/geo.js');
  const asked = [];
  const duffel = { placeSuggestions: async (q) => { asked.push(q); return q === 'Ohrid' ? [{ type: 'airport', name: 'Ohrid St. Paul the Apostle Airport', iata_code: 'OHD', city_name: 'Ohrid', country: 'MK', airports: [] }] : []; } };
  assert.deepEqual(placeCandidates('Ohrid vom 2 bis 18 Oktober, Hotel stornierbar, max 900 CHF'), ['Ohrid']);
  const r = await findPlace('Ohrid vom 2 bis 18 Oktober, Hotel stornierbar', duffel, { catalogLookup: () => [] });
  assert.equal(r.place.iata, 'OHD');
  assert.equal(r.place.name, 'Ohrid');
  assert.ok(!asked.includes('Hotel') && !asked.includes('Oktober'));
  const none = await findPlace('Irgendwohin warm', { placeSuggestions: async () => [{ type: 'airport', name: 'Warm Springs', iata_code: 'XXX', city_name: 'Warmington', country: 'US' }] });
  assert.equal(none, null);
});

test('same name in two countries → ask; a country in the text decides', async () => {
  const { findPlace } = await import('../server/app/geo.js');
  const duffel = { placeSuggestions: async (q) => (q === 'Kochi' ? [
    { type: 'airport', name: 'Kōchi Airport', iata_code: 'KCZ', city_name: 'Kochi', country: 'JP', lat: 33.5, lng: 133.7 },
    { type: 'airport', name: 'Cochin International Airport', iata_code: 'COK', city_name: 'Kochi', country: 'IN', lat: 10.15, lng: 76.4 },
    { type: 'airport', name: 'Kuching International Airport', iata_code: 'KCH', city_name: 'Kuching', country: 'MY', lat: 1.5, lng: 110.3 }] : []) };
  const ask = await findPlace('Kochi vom 2. bis 20. Oktober', duffel, { catalogLookup: () => [] });
  assert.deepEqual(ask.choices.map(p => p.iata), ['KCZ', 'COK']);
  const india = await findPlace('Kochi in Indien vom 2. bis 20. Oktober', duffel, { catalogLookup: () => [] });
  assert.equal(india.place.iata, 'COK');
});

test('a town without airport → nearest airport (geocoding stubbed)', async () => {
  const { findPlace } = await import('../server/app/geo.js');
  const original = globalThis.fetch;
  globalThis.fetch = async (url) => new Response(JSON.stringify({ results: String(url).includes('Wengen')
    ? [{ name: 'Wengen', latitude: 46.6, longitude: 7.92, country_code: 'CH', country: 'Schweiz', feature_code: 'PPL', population: 1300 }] : [] }), { status: 200 });
  try {
    const duffel = { placeSuggestions: async (q, near) => (near ? [
      { type: 'airport', name: 'Bern Airport', iata_code: 'BRN', city_name: 'Bern', country: 'CH', lat: 46.91, lng: 7.5 },
      { type: 'airport', name: 'Sion Airport', iata_code: 'SIR', city_name: 'Sion', country: 'CH', lat: 46.22, lng: 7.33 }] : []) };
    const r = await findPlace('Wengen vom 9. bis 12. Oktober', duffel);
    assert.equal(r.place.name, 'Wengen');
    assert.equal(r.place.airport.iata, 'BRN');
    assert.ok(r.place.airport.distance_km > 30 && r.place.airport.distance_km < 60);
    assert.equal(r.place.airport_alternatives[0].iata, 'SIR');
    assert.ok(r.place.aliases.includes('BRN'));
  } finally { globalThis.fetch = original; }
});

test('date ranges across months and with "bis zum" (user report: Izmir)', () => {
  const cases = [
    ['izmir türkei vom 25 oktober bis zum 4 november, alles zusammen maximal 2000 CHF, hotel Stornierbar', '2026-10-25', '2026-11-04'],
    ['Rom vom 28. Dezember bis 3. Januar, max CHF 1500', '2026-12-28', '2027-01-03'],
    ['Paris 30. Oktober - 2. November 2026, max 900 CHF', '2026-10-30', '2026-11-02'],
    ['Lissabon vom 9. bis zum 12. Oktober, max CHF 1500', '2026-10-09', '2026-10-12'],
    ['Berlin 25.10. bis zum 4.11., max CHF 800', '2026-10-25', '2026-11-04'],
    ['London October 30 to November 2, up to 2000 CHF', '2026-10-30', '2026-11-02'],
  ];
  for (const [text, s, e] of cases) {
    const d = compileLocal(text, {}, today);
    assert.equal(d.trip.start_date, s, text);
    assert.equal(d.trip.end_date, e, text);
    assert.ok(!d.missing.includes('dates'), text);
  }
  assert.equal(rule(compileLocal(cases[0][0], {}, today), 'budget_total').value, 2000);
});

test('Bali is Bali (Denpasar), never Balikpapan; a country that does not fit gets a hint (user report)', () => {
  const d = compileLocal('Bali Thailand 28 September bis 4 Oktober, alle ausgaben zusammen maximal 1500 CHF', {}, today);
  assert.equal(d.trip.destination.name, 'Bali');
  assert.equal(d.trip.destination.iata, 'DPS');
  assert.equal(d.trip.destination.country, 'ID');
  assert.equal(d.trip.destination.is_region, true);
  assert.equal(d.trip.start_date, '2026-09-28');
  assert.equal(d.trip.end_date, '2026-10-04');
  assert.equal(rule(d, 'budget_total').value, 1500);
  assert.ok(d.notes.some(n => n.includes('«Thailand»') && n.includes('Indonesien')), d.notes.join(' | '));
  const fine = compileLocal('Bali Indonesien 28 September bis 4 Oktober, max. 1500 CHF', {}, today);
  assert.ok(!fine.notes.some(n => n.startsWith('Du schreibst')));
});

test('airport search matches whole words only, never a prefix (Bali ≠ Balikpapan)', async () => {
  const { matchClass, findPlace } = await import('../server/app/geo.js');
  assert.equal(matchClass('Bali', { type: 'airport', name: 'Sultan Aji Muhammad Sulaiman Sepinggan International Airport', city_name: 'Balikpapan', country: 'ID' }), 0);
  assert.equal(matchClass('Bali', { type: 'airport', name: 'Ngurah Rai (Bali) International Airport', city_name: 'Denpasar', country: 'ID' }), 2);
  assert.equal(matchClass('Rio', { type: 'city', name: 'Rio de Janeiro', country: 'BR' }), 2);
  assert.equal(matchClass('Kochi', { type: 'airport', name: 'Cochin International Airport', city_name: 'Kochi', country: 'IN' }), 3);
  assert.equal(matchClass('Malediven', { type: 'airport', name: 'Velana International Airport', city_name: 'Malé', country: 'MV' }), 0.5);
  // Through the whole search (Duffel stubbed): the prefix hit comes first and is still ignored;
  // the island is found through its airport's name and keeps the customer's word.
  const duffel = { placeSuggestions: async () => [
    { type: 'airport', name: 'Lombokstadt Regional', iata_code: 'XLB', city_name: 'Lombokstadt', country: 'ID' },
    { type: 'airport', name: 'Lombok International Airport', iata_code: 'LOP', city_name: 'Praya', country: 'ID' },
  ] };
  const r = await findPlace('Lombok vom 3. bis 10. Oktober', duffel, { catalogLookup: () => [] });
  assert.equal(r.place.name, 'Lombok');
  assert.equal(r.place.iata, 'LOP');
  assert.equal(r.place.is_region, true);
});

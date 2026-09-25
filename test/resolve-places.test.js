import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { parseIntent, buildDraft } from '../server/app/compile.js';
import { resolvePlaces } from '../server/app/resolve-places.js';

const today = new Date('2026-09-25T08:00:00Z');
const airport = (iata_code, city_name, name, country) => ({ type: 'airport', iata_code, city_name, name, country, airports: [] });
const records = [
  airport('ZRH', 'Zurich', 'Zurich Airport', 'CH'),
  airport('LGW', 'London', 'London Gatwick Airport', 'GB'),
  airport('LHR', 'London', 'London Heathrow Airport', 'GB'),
  airport('SJO', 'San Jose', 'Juan Santamaria International Airport', 'CR'),
  airport('SJC', 'San Jose', 'San Jose International Airport', 'US'),
  airport('GIG', 'Rio de Janeiro', 'Rio de Janeiro Galeao International Airport', 'BR'),
];
const normalize = text => String(text).normalize('NFD').replace(/\p{M}/gu, '').toLowerCase().trim();
const catalogLookup = query => {
  const q = normalize(query).replace(/^(?:flughafen|airport)\s+|\s+(?:flughafen|airport)$/g, '');
  return records.filter(p => normalize(p.iata_code) === q || normalize(p.city_name) === q || normalize(p.name).replace(/ airport$/, '') === q);
};
const duffel = { placeSuggestions: async () => [] };
const originalFetch = globalThis.fetch;
before(() => { globalThis.fetch = async () => new Response(JSON.stringify({ results: [] }), { status: 200 }); });
after(() => { globalThis.fetch = originalFetch; });

async function draft(text, suppliedAnswers = {}) {
  const answers = { ...suppliedAnswers };
  const intent = await resolvePlaces(text, parseIntent(text, today), answers, duffel, { catalogLookup });
  return buildDraft(text, intent, answers, today);
}

test('explicit Gatwick and LGW override the known London city default', async () => {
  for (const destination of ['LGW', 'London Gatwick', 'London Gatwick Airport']) {
    const d = await draft(`Ab Zürich nach ${destination} 5.-8. Oktober, Budget 900 CHF`);
    assert.equal(d.trip.destination?.iata, 'LGW', destination);
    assert.equal(d.trip.destination?.airport_name, 'London Gatwick Airport');
    assert.equal(d.trip.origin?.iata, 'ZRH');
    assert.equal(d.ready, true);
  }
});

test('a city with multiple airports asks and an exact airport answer remains exact', async () => {
  const text = 'Ab Zürich nach London 5.-8. Oktober, Budget 900 CHF';
  const d = await draft(text);
  assert.ok(d.missing.includes('destination'));
  assert.deepEqual(d.open_questions.find(q => q.id === 'destination').options.map(o => o.value).sort(), ['iata:LGW', 'iata:LHR']);
  assert.ok(d.open_questions.find(q => q.id === 'destination').options.some(o => o.label.includes('Gatwick')));
  const selected = await draft(text, { destination: 'iata:LGW' });
  assert.equal(selected.trip.destination?.iata, 'LGW');
  assert.equal(selected.hard_rules.find(r => r.id === 'airport_destination').source.type, 'answer');
  assert.equal(selected.ready, true);
});

test('lowercase multiword destination remains ambiguous until the customer chooses', async () => {
  const text = 'Ab Zürich nach san jose 5.-8. Oktober, Budget 900 CHF';
  const d = await draft(text);
  assert.ok(d.missing.includes('destination'));
  assert.equal(d.trip.origin?.iata, 'ZRH');
  const selected = await draft(text, { destination: 'iata:SJO' });
  assert.equal(selected.trip.destination?.iata, 'SJO');
});

test('lowercase multiword origin is resolved and never replaced with Zurich', async () => {
  const d = await draft('Ab rio de janeiro nach LGW 5.-8. Oktober, Budget 900 CHF');
  assert.equal(d.trip.origin?.iata, 'GIG');
  assert.equal(d.trip.origin?.airport_name, 'Rio de Janeiro Galeao International Airport');
  assert.equal(d.trip.destination?.iata, 'LGW');
  assert.equal(d.ready, true);
});

test('ambiguous origin blocks confirmation and accepts a chosen IATA airport', async () => {
  const text = 'Ab san jose nach LGW 5.-8. Oktober, Budget 900 CHF';
  const d = await draft(text);
  assert.equal(d.trip.origin, null);
  assert.ok(d.missing.includes('origin'));
  assert.equal(d.ready, false);
  assert.deepEqual(d.open_questions.find(q => q.id === 'origin').options.map(o => o.value).sort(), ['iata:SJC', 'iata:SJO']);
  const selected = await draft(text, { origin: 'iata:SJO' });
  assert.equal(selected.trip.origin?.iata, 'SJO');
  assert.equal(selected.hard_rules.find(r => r.id === 'airport_origin').source.type, 'answer');
  assert.equal(selected.ready, true);
});

test('an unknown explicit origin remains a question instead of falling back to Zurich', async () => {
  const d = await draft('Ab nirgendwohausen nach LGW 5.-8. Oktober, Budget 900 CHF');
  assert.equal(d.trip.origin, null);
  assert.equal(d.trip.destination?.iata, 'LGW');
  assert.ok(d.missing.includes('origin'));
  assert.equal(d.ready, false);
});

test('known origin is never reused as an unknown destination; omitted origin keeps its default', async () => {
  const missing = await draft('Ab Zürich nach nirgendwohausen 5.-8. Oktober, Budget 900 CHF');
  assert.equal(missing.trip.origin?.iata, 'ZRH');
  assert.equal(missing.trip.destination, null);
  assert.ok(missing.missing.includes('destination'));
  const defaulted = await draft('Nach LGW 5.-8. Oktober, Budget 900 CHF');
  assert.equal(defaulted.trip.origin?.iata, 'ZRH');
  assert.equal(defaulted.trip.destination?.iata, 'LGW');
});

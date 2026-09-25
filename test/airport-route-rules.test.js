import test from 'node:test';
import assert from 'node:assert/strict';
import { parseIntent, buildDraft, compileLocal } from '../server/app/compile.js';
import { byCity } from '../server/app/places.js';
import { evaluate } from '../server/leash/evaluate.js';

const now = Date.parse('2026-09-25T10:00:00Z');
const text = 'Ab Zürich nach London Gatwick 5.-8. Oktober, Budget 900 CHF';
const compiled = buildDraft(text, { ...parseIntent(text, new Date(now)),
  destination_place: { ...byCity('london'), iata: 'LGW', airport_name: 'London Gatwick Airport' },
}, {}, new Date(now));
const mandate = { ...compiled, mandate_id: 'TM-AIRPORT', version: 1, status: 'active' };

function auth(travel = {}) {
  return { authorization_id: 'AUTH-AIRPORT', mandate_id: mandate.mandate_id, timestamp: new Date(now).toISOString(),
    amount: 100, currency: 'CHF',
    merchant: { merchant_id: 'ME-DUFFEL', merchant_name: 'Duffel Airways', domain: 'duffel.com' },
    items: [{ item_name: 'Flight ticket', item_category: 'flight_fare', quantity: 1, unit_price: 100, currency: 'CHF' }],
    travel: { kind: 'flight', origin_city: 'Zurich', origin_iata: 'ZRH', destination_city: 'London', destination_iata: 'LGW',
      start_date: '2026-10-05', end_date: '2026-10-08', travelers: 1, ...travel } };
}
const check = (travel, m = mandate) => evaluate({ auth: auth(travel), mandate: m, now });

test('compiled flight route accepts Gatwick and rejects Heathrow even with the same city', () => {
  assert.equal(check({}).decision, 'approve');
  const otherAirport = check({ destination_iata: 'LHR' });
  assert.equal(otherAirport.decision, 'decline');
  assert.ok(otherAirport.reason_codes.includes('wrong_destination_airport'));
  assert.equal(otherAirport.checks.find(c => c.rule_id === 'destination').status, 'pass');
  assert.equal(otherAirport.checks.find(c => c.rule_id === 'airport_destination').status, 'fail');
});

test('a flight cannot change the confirmed departure airport', () => {
  const result = check({ origin_iata: 'GVA' });
  assert.equal(result.decision, 'decline');
  assert.ok(result.reason_codes.includes('wrong_origin_airport'));
});

test('missing airport evidence asks; a definite wrong airport still declines', () => {
  for (const field of ['origin_iata', 'destination_iata']) {
    const result = check({ [field]: null });
    assert.equal(result.decision, 'step_up', field);
    assert.ok(result.checks.some(c => c.status === 'unknown' && c.kind.startsWith('airport_')));
  }
  assert.equal(check({ origin_iata: null, destination_iata: 'LHR' }).decision, 'decline');
});

test('hotels do not need airport facts and continue to match the city', () => {
  const result = check({ kind: 'hotel', origin_iata: null, destination_iata: null });
  assert.equal(result.decision, 'approve');
  assert.ok(!result.checks.some(c => c.kind.startsWith('airport_')));
});

test('existing Pristina city spelling aliases still work when the correct airport is present', () => {
  const draft = compileLocal('Ab Zürich nach Pristina 5.-8. Oktober, Budget 900 CHF', {}, new Date(now));
  const m = { ...draft, mandate_id: mandate.mandate_id, version: 1, status: 'active' };
  assert.equal(check({ destination_city: 'Prishtina', destination_iata: 'PRN' }, m).decision, 'approve');
});

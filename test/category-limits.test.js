import test from 'node:test';
import assert from 'node:assert/strict';
import { evaluate } from '../server/leash/evaluate.js';
import { compileLocal } from '../server/app/compile.js';

const total = (value = 1000) => ({ id: 'budget', kind: 'budget_total', label: 'Reisekasse', field: 'authorization.billing_amount_chf', operator: '<=', value, currency: 'CHF', scope: 'period' });
const cap = (kind, value, id = `budget_${kind}`) => ({ id, kind: 'budget_purchase', label: `${kind} höchstens ${value} CHF`, field: 'authorization.billing_amount_chf', operator: '<=', value, currency: 'CHF', scope: 'purchase', applies_to: [kind] });
const nightly = (value) => ({ id: 'night', kind: 'per_night', label: 'Hotel pro Nacht', field: 'travel.price_per_night_chf', operator: '<=', value, currency: 'CHF', applies_to: ['hotel'] });
const auth = (kind, amount) => ({
  authorization_id: 'AZ-CATEGORY', amount, currency: 'CHF', timestamp: '2026-09-25T10:00:00Z',
  merchant: { merchant_id: 'ME-STAYFINDER', merchant_name: 'Stayfinder', domain: 'stayfinder.ch' },
  travel: { kind, destination_city: 'Paris', ...(kind === 'flight' ? { origin_city: 'Zurich', origin_iata: 'ZRH', destination_iata: 'CDG' } : {}),
    start_date: '2026-10-16', end_date: '2026-10-18', travelers: 2 },
});
const mandate = (hard_rules, uncertainty_policy = 'ask') => ({ mandate_id: 'CATEGORY-MANDATE', status: 'active', version: 1, hard_rules, uncertainty_policy });
const decide = (kind, amount, rules, extra = {}) => evaluate({ auth: auth(kind, amount), mandate: mandate(rules), ...extra });

test('compiled customer wording becomes enforceable flight and nightly hotel rules', () => {
  const draft = compileLocal('Paris vom 16. bis 18. Oktober, zwei Personen, Gesamtbudget 900 CHF, 200 CHF Flug maximum, Hotel 150 CHF pro Nacht', {}, new Date('2026-09-25T10:00:00Z'));
  assert.equal(draft.ready, true);
  const active = { ...draft, mandate_id: 'CATEGORY-MANDATE', status: 'active', version: 1 };
  for (const [kind, amount, expected] of [['flight', 200, 'approve'], ['flight', 200.01, 'decline'], ['hotel', 300, 'approve'], ['hotel', 300.01, 'decline']]) {
    const d = evaluate({ auth: auth(kind, amount), mandate: active });
    assert.equal(d.decision, expected, `${kind} CHF ${amount}: ${d.summary}`);
  }
});

test('a flight cannot borrow a higher hotel limit or the remaining total budget', () => {
  const d = decide('flight', 201, [total(), cap('flight', 200), cap('hotel', 500)]);
  assert.equal(d.decision, 'decline');
  assert.deepEqual(d.reason_codes, ['per_booking_limit']);
  assert.equal(d.checks.find(c => c.rule_id === 'budget_flight').status, 'fail');
  assert.ok(!d.checks.some(c => c.rule_id === 'budget_hotel'));
});

test('a hotel ignores a lower flight cap and exact category limits are allowed', () => {
  const rules = [total(), cap('flight', 200), cap('hotel', 500), cap('transfer', 50), cap('activity', 75)];
  for (const [kind, amount] of [['flight', 200], ['hotel', 500], ['transfer', 50], ['activity', 75]]) {
    const d = decide(kind, amount, rules);
    assert.equal(d.decision, 'approve', `${kind} at ${amount}`);
    assert.deepEqual(d.checks.map(c => c.rule_id), ['budget', `budget_${kind}`]);
    assert.equal(decide(kind, amount + 0.01, rules).decision, 'decline', `${kind} one cent above`);
  }
});

test('all applicable caps remain binding, not merely the first category cap', () => {
  const d = decide('flight', 175, [total(), cap('flight', 200), cap('flight', 150, 'budget_flight_2')]);
  assert.equal(d.decision, 'decline');
  assert.equal(d.checks.find(c => c.rule_id === 'budget_flight').status, 'pass');
  assert.equal(d.checks.find(c => c.rule_id === 'budget_flight_2').status, 'fail');
});

test('hotel purchase and nightly limits both apply; nights must be known', () => {
  const rules = [total(), cap('hotel', 400), nightly(150), cap('flight', 100)];
  assert.equal(decide('hotel', 300, rules).decision, 'approve');
  const aboveNight = decide('hotel', 300.02, rules);
  assert.equal(aboveNight.decision, 'decline');
  assert.ok(aboveNight.reason_codes.includes('hotel_price_per_night'));
  const threeNights = auth('hotel', 450.01);
  threeNights.travel.end_date = '2026-10-19';
  const oneCentOver = evaluate({ auth: threeNights, mandate: mandate([total(), nightly(150)]) });
  assert.equal(oneCentOver.decision, 'decline', 'rounding a three-night average must not hide one cent over the limit');
  const missingNights = auth('hotel', 100);
  delete missingNights.travel.end_date;
  assert.equal(evaluate({ auth: missingNights, mandate: mandate(rules) }).decision, 'step_up');
});

test('category caps never replace the shared budget and earlier spending still counts', () => {
  const rules = [total(600), cap('flight', 200), cap('hotel', 500)];
  const ledger = [{ authorization_id: 'EARLIER', mandate_id: 'CATEGORY-MANDATE', status: 'approved', amount_chf: 450, kind: 'hotel', timestamp: '2026-09-24T09:00:00Z' }];
  const d = decide('flight', 200, rules, { ledger });
  assert.equal(d.decision, 'decline');
  assert.ok(d.reason_codes.includes('trip_budget_exceeded'));
  assert.equal(d.checks.find(c => c.rule_id === 'budget_flight').status, 'pass');
});

test('missing category cannot approve through a category cap, including permissive uncertainty', () => {
  const rules = [total(), cap('flight', 200), cap('hotel', 150)];
  for (const policy of ['ask', 'approve']) {
    for (const kind of [undefined, null, '', 'unknown']) {
      const d = decide(kind, 100, rules, { mandate: mandate(rules, policy) });
      assert.equal(d.decision, 'step_up', `${policy} with kind ${kind}`);
      assert.ok(d.reason_codes.includes('category_unknown'));
      assert.match(d.summary, /Buchungsart/);
    }
  }
});

test('a missing category cannot weaken a clear shared budget violation', () => {
  const rules = [total(50), cap('flight', 200)];
  const d = decide(undefined, 100, rules, { mandate: mandate(rules, 'approve') });
  assert.equal(d.decision, 'decline');
  assert.ok(d.reason_codes.includes('trip_budget_exceeded'));
});

test('ordinary purchases do not inherit a flight cap in the split-order heuristic', () => {
  const rules = [total(), cap('flight', 150)];
  const purchase = { ...auth(undefined, 100), items: [{ item_name: 'Second item', quantity: 1, unit_price: 100, currency: 'CHF' }] };
  const ledger = [{ authorization_id: 'EARLIER', mandate_id: 'CATEGORY-MANDATE', status: 'approved', amount_chf: 100,
    merchant_id: 'ME-STAYFINDER', timestamp: '2026-09-25T09:55:00Z', items_key: 'First item' }];
  const d = evaluate({ auth: purchase, mandate: mandate(rules), ledger });
  assert.equal(d.decision, 'step_up');
  assert.ok(!d.reason_codes.includes('split_order'));
});

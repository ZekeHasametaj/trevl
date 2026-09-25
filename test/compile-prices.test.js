import test from 'node:test';
import assert from 'node:assert/strict';
import { compileLocal, parseIntent, buildDraft } from '../server/app/compile.js';
import { mergeIntents } from '../server/app/llm.js';

const today = new Date('2026-09-25T10:00:00Z');
const base = 'Paris vom 16. bis 18. Oktober, zwei Personen, ';
const compile = (text, answers = {}) => compileLocal(base + text, answers, today);
const rule = (d, id) => d.hard_rules.find(r => r.id === id);

test('user wording creates a flight cap and asks about hotel scope, never a trip budget', () => {
  const d = compile('200 chf flug maximum, 150chf hotel');
  assert.equal(rule(d, 'budget_flight').value, 200);
  assert.deepEqual(rule(d, 'budget_flight').applies_to, ['flight']);
  assert.equal(rule(d, 'budget_total'), undefined);
  assert.equal(rule(d, 'budget_hotel'), undefined);
  assert.equal(rule(d, 'per_night'), undefined);
  assert.ok(d.missing.includes('budget'));
  assert.ok(d.missing.includes('price_scope_1'));
  assert.equal(d.ready, false);
});

test('hotel ambiguity can be answered as nightly or the whole stay', () => {
  const text = '200 CHF Flug maximum, 150CHF Hotel, Gesamtbudget 900 CHF';
  const unanswered = compile(text);
  assert.equal(unanswered.ready, false);
  const question = unanswered.open_questions.find(q => q.id === 'price_scope_1');
  assert.deepEqual(question.options.map(o => o.value), ['night', 'booking']);
  const night = compile(text, { price_scope_1: 'night' });
  assert.equal(rule(night, 'per_night').value, 150);
  assert.equal(rule(night, 'budget_total').value, 900);
  assert.equal(night.ready, true);
  const stay = compile(text, { price_scope_1: 'booking' });
  assert.equal(rule(stay, 'budget_hotel').value, 150);
  assert.equal(rule(stay, 'per_night'), undefined);
  assert.match(rule(stay, 'budget_hotel').label, /ganzen Aufenthalt/);
  assert.equal(stay.ready, true);
  assert.equal(compile(text, { price_scope_1: 'anything' }).ready, false);
});

test('explicit limits support category before and after money, CHF without spaces and sentence separators', () => {
  for (const text of [
    'Flug maximal 200 CHF, Hotel maximal 150 CHF pro Nacht, Gesamtbudget 900 CHF',
    '200CHF Flug und 150CHF Hotel pro Nacht, Budget 900 CHF',
    '200CHF Flug maximum 150CHF Hotel pro Nacht, Budget 900 CHF',
    'Budget 900 CHF. Flug maximal 200 CHF. Hotel 150 CHF pro Nacht.',
    'Flug 200CHF Hotel pro Nacht 150CHF, Budget 900 CHF',
  ]) {
    const d = compile(text);
    assert.equal(rule(d, 'budget_flight')?.value, 200, text);
    assert.equal(rule(d, 'per_night')?.value, 150, text);
    assert.equal(rule(d, 'budget_total')?.value, 900, text);
    assert.equal(d.ready, true, text);
    for (const r of d.hard_rules) if (r.source.quote) assert.ok((base + text).includes(r.source.quote), r.source.quote);
  }
});

test('hotel stay, activity and transfer prices are isolated from the total and each other', () => {
  const d = compile('Gesamtbudget 900 CHF, Hotel insgesamt 150 CHF, Aktivitäten maximal 50 CHF, Transfer maximal 25 CHF');
  for (const [kind, amount] of [['hotel', 150], ['activity', 50], ['transfer', 25]]) {
    const r = rule(d, `budget_${kind}`);
    assert.equal(r.value, amount);
    assert.deepEqual(r.applies_to, [kind]);
    assert.equal(r.scope, 'purchase');
  }
  assert.equal(rule(d, 'budget_total').value, 900);
  assert.equal(rule(d, 'per_night'), undefined);
  assert.ok(d.trip.kinds.includes('activity'));
});

test('category per-person caps are multiplied only for that category', () => {
  const d = compile('Budget 900 CHF, Flug maximal 200 CHF pro Person, Hotel 150 CHF pro Nacht');
  assert.equal(rule(d, 'budget_flight').value, 400);
  assert.equal(rule(d, 'per_night').value, 150);
  assert.equal(rule(d, 'budget_total').value, 900);
  assert.match(rule(d, 'budget_flight').label, /alle Reisenden/);
  assert.ok(d.guidance.some(g => g.includes('pro Person × 2')));
});

test('zero and small caps are real restrictions, negative and invalid caps block confirmation', () => {
  const zero = compile('Budget 900 CHF, Flug 0 CHF, Transfer 5 CHF');
  assert.equal(rule(zero, 'budget_flight').value, 0);
  assert.equal(rule(zero, 'budget_transfer').value, 5);
  for (const bad of ['-150', '1.2.3', '99999999999999999']) {
    const d = compile(`Budget 900 CHF, Hotel ${bad} CHF insgesamt`);
    assert.equal(d.ready, false, bad);
    assert.equal(rule(d, 'budget_hotel'), undefined, bad);
    assert.ok(d.missing.some(k => k.startsWith('price_invalid_')), bad);
  }
  assert.equal(compile('Budget 900 CHF, Hotel CHF -150 insgesamt').ready, false);
});

test('unsupported combined activity budgets are not silently turned into per-booking limits', () => {
  const d = compile('Gesamtbudget 900 CHF, Aktivitäten insgesamt 100 CHF');
  assert.equal(d.ready, false);
  assert.equal(rule(d, 'budget_activity'), undefined);
  assert.ok(d.open_questions.some(q => q.required && q.text.includes('gemeinsames Limit')));
});

test('nightly plus whole-stay hotel limits and repeated flight caps are all preserved', () => {
  const d = compile('Budget 900 CHF, Hotel 150 CHF pro Nacht, Hotel insgesamt 250 CHF, Flug 200 CHF, Flug maximal 180 CHF');
  assert.equal(rule(d, 'per_night').value, 150);
  assert.equal(rule(d, 'budget_hotel').value, 250);
  assert.deepEqual(d.hard_rules.filter(r => r.applies_to?.includes('flight')).map(r => r.value), [200, 180]);
  assert.equal(new Set(d.hard_rules.map(r => r.id)).size, d.hard_rules.length);
});

test('foreign currencies and decimals retain their value and category', () => {
  const d = compile('Budget 900 CHF, Flug maximal 199,50 EUR, Hotel insgesamt 150 USD');
  assert.equal(rule(d, 'budget_flight').value, 199.5);
  assert.equal(rule(d, 'budget_flight').currency, 'EUR');
  assert.equal(rule(d, 'budget_hotel').currency, 'USD');
});

test('optional model cannot reclassify category limits or answer monetary ambiguity', () => {
  const text = base + 'Flug 200 CHF, Hotel 150 CHF';
  const merged = mergeIntents(parseIntent(text, today), { budget_total: { amount: 200, currency: 'CHF', quote: '200 CHF' }, per_night: { amount: 150, currency: 'CHF', quote: 'Hotel 150 CHF' }, category_limits: [] });
  const d = buildDraft(text, merged, {}, today);
  assert.equal(rule(d, 'budget_flight').value, 200);
  assert.equal(rule(d, 'budget_total'), undefined);
  assert.equal(rule(d, 'per_night'), undefined);
  assert.ok(d.missing.includes('price_scope_1'));
});

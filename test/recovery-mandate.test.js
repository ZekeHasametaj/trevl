import test from 'node:test';
import assert from 'node:assert/strict';
import { createLeashStore } from '../server/leash/store.js';

function setup() {
  const store = createLeashStore();
  const draft = store.createDraft({
    instruction: 'Lissabon, zwei Personen, Flug und Hotel, Budget 900 CHF',
    hard_rules: [{ id: 'budget', kind: 'budget_total', field: 'authorization.billing_amount_chf', operator: '<=', value: 900, currency: 'CHF', scope: 'period' }],
    uncertainty_policy: 'ask',
    trip: { origin: { name: 'Zurich', iata: 'ZRH' }, destination: { name: 'Lisbon', iata: 'LIS' }, start_date: '2030-01-02', end_date: '2030-01-05', travelers: 2, kinds: ['flight', 'hotel'] },
  });
  const m = store.confirmDraft(draft.draft_id, { confirmed: true });
  const authorize = (id, kind = 'flight', amount = 200) => {
    const result = store.authorize({ authorization_id: id, mandate_id: m.mandate_id, amount, currency: 'CHF',
      timestamp: new Date().toISOString(), initiator_type: 'agent', order_cancellable: 'true',
      merchant: { merchant_id: 'ME-DUFFEL', merchant_name: 'Duffel Airways', domain: 'duffel.com' },
      items: [{ item_name: kind === 'flight' ? 'Return flight' : 'Hotel room', item_category: kind === 'flight' ? 'flight_fare' : 'hotel_room', quantity: 1, unit_price: amount, currency: 'CHF' }],
      travel: { kind, title: kind, origin_city: 'Zurich', destination_city: 'Lisbon', start_date: '2030-01-02', end_date: '2030-01-05', travelers: 2 },
    });
    assert.equal(result.decision, 'approve');
    return result;
  };
  return { store, m, authorize };
}

test('confirmed recovery edits the same mandate and preserves booked flights and spent budget', () => {
  const { store, m, authorize } = setup();
  authorize('booked-flight');
  store.markBooked('booked-flight', { booking_reference: 'OFFLINE-FLIGHT' });
  const before = structuredClone(store.get('booked-flight'));
  const result = store.updateMandate(m.mandate_id, {
    instruction: 'Lissabon, zwei Personen, Hotel höchstens 250 CHF, Budget 1000 CHF',
    hard_rules: [{ ...m.hard_rules[0], value: 1000 }], trip: structuredClone(m.trip),
    guidance: ['Hotel nahe Bahnhof'], open_questions: [], valid_until: '2030-01-06T00:00:00Z',
  }, { customerConfirmed: true });
  assert.equal(result.mandate.mandate_id, m.mandate_id);
  assert.equal(result.mandate.version, 2);
  assert.match(result.mandate.instruction, /250 CHF/);
  assert.deepEqual(result.mandate.guidance, ['Hotel nahe Bahnhof']);
  assert.deepEqual(store.get('booked-flight'), before);
  const summary = store.summary(m.mandate_id);
  assert.equal(summary.approved, 200);
  assert.equal(summary.free, 800);
  assert.equal(summary.bookings.length, 1);
  assert.equal(summary.bookings[0].authorization_id, 'booked-flight');
  assert.equal(store.events().at(-1).type, 'mandate.updated');
});

test('booked itinerary cannot change and a rejected combined edit leaves all state untouched', () => {
  for (const [field, value] of Object.entries({ origin: { iata: 'GVA' }, destination: { iata: 'CDG' }, start_date: '2030-01-03', end_date: '2030-01-06', travelers: 3 })) {
    const { store, m, authorize } = setup();
    authorize('booked-flight'); store.markBooked('booked-flight', { booking_reference: 'OFFLINE-FLIGHT' });
    const before = structuredClone(m), events = store.events().length;
    assert.throws(() => store.updateMandate(m.mandate_id, {
      instruction: 'Changed trip', hard_rules: [{ ...m.hard_rules[0], value: 1200 }], trip: { ...m.trip, [field]: value },
    }, { customerConfirmed: true }), error => error.status === 409 && error.details.booked_itinerary === true);
    assert.deepEqual(store.getMandate(m.mandate_id), before, field);
    assert.equal(store.events().length, events);
    assert.equal(store.summary(m.mandate_id).approved, 200);
  }
});

test('unconfirmed changes to searched or reviewed metadata are rejected without mutation', () => {
  for (const update of [{ instruction: 'Another wish' }, { trip: { destination: { iata: 'CDG' } } }, { guidance: ['Spa hotel'] }, { open_questions: [{ key: 'dates', question: 'When?' }] }]) {
    const { store, m } = setup(), before = structuredClone(m);
    assert.throws(() => store.updateMandate(m.mandate_id, update), error => error.status === 409 && error.details.requires_confirmation === true);
    assert.deepEqual(m, before);
  }
});

test('confirmed metadata-only changes update context, increment version and emit an event', () => {
  const { store, m } = setup();
  const result = store.updateMandate(m.mandate_id, {
    instruction: 'New hotel preference for Lisbon', trip: { ...m.trip, kinds: ['hotel'] }, guidance: ['Near the station'], open_questions: [{ key: 'hotel', question: 'Room preference?' }],
  }, { customerConfirmed: true });
  assert.equal(result.mandate.version, 2);
  assert.equal(result.changes.length, 4);
  assert.deepEqual(m.trip.kinds, ['hotel']);
  assert.deepEqual(m.open_questions, [{ key: 'hotel', question: 'Room preference?' }]);
  assert.equal(store.events().at(-1).version, 2);
  const same = store.updateMandate(m.mandate_id, { instruction: m.instruction, trip: structuredClone(m.trip) }, { customerConfirmed: true });
  assert.equal(same.mandate.version, 2);
  assert.deepEqual(same.changes, []);
});

test('summary lists only recorded bookings, not approved offers, and returns detached booking data', () => {
  const { store, m, authorize } = setup();
  authorize('booked-flight'); store.markBooked('booked-flight', { booking_reference: 'OFFLINE-FLIGHT', detail: { provider: 'offline' } });
  authorize('unbooked-hotel', 'hotel', 100);
  const summary = store.summary(m.mandate_id);
  assert.equal(summary.approved, 300);
  assert.deepEqual(summary.bookings.map(b => [b.authorization_id, b.kind]), [['booked-flight', 'flight']]);
  summary.bookings[0].booking.detail.provider = 'changed externally';
  assert.equal(store.get('booked-flight').booking.detail.provider, 'offline');
});

test('invalid confirmed recovery is validated before any rules or metadata change', () => {
  const { store, m } = setup(), before = structuredClone(m);
  assert.throws(() => store.updateMandate(m.mandate_id, { instruction: 'New preference', hard_rules: [{ field: 'amount', operator: 'invalid', value: 10 }] }, { customerConfirmed: true }));
  assert.deepEqual(m, before);
});

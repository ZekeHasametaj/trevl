import test from 'node:test';
import assert from 'node:assert/strict';
import { createAgent } from '../server/app/agent.js';
import { createLeashStore } from '../server/leash/store.js';
import { LITEAPI_MERCHANT } from '../server/app/liteapi.js';

const deferred = () => { let resolve; const promise = new Promise(r => { resolve = r; }); return { promise, resolve }; };
function setup(kind = 'flight') {
  const store = createLeashStore();
  const rules = [
    { id: 'budget', kind: 'budget_total', field: 'authorization.billing_amount_chf', operator: '<=', value: 100, currency: 'CHF', scope: 'period' },
    { id: 'purchase', kind: 'budget_purchase', field: 'authorization.billing_amount_chf', operator: '<=', value: 80, currency: 'CHF' },
  ];
  const draft = store.createDraft({ instruction: 'Lisbon, only the confirmed offer', hard_rules: rules, uncertainty_policy: 'ask', trip: {
    origin: { name: 'Zurich', iata: 'ZRH' }, destination: { name: 'Lisbon', iata: 'LIS', city: 'lisbon', country: 'PT' },
    travelers: 1, start_date: '2030-01-02', end_date: '2030-01-05', kinds: [kind],
  } });
  const mandate = structuredClone(store.confirmDraft(draft.draft_id, { confirmed: true }));
  const flight = { id: 'offline-flight', amount: 60, total_currency: 'CHF', airline: { name: 'Duffel Airways', iata: 'ZZ' },
    origin: { city: 'Zurich', iata: 'ZRH' }, destination: { city: 'Lisbon', iata: 'LIS' }, travelers: 1, flight_numbers: ['ZZ1'],
    depart_at: '2030-01-02T10:00:00Z', return_at: '2030-01-05T10:00:00Z', cabin: 'economy', checked_bags: 1, stops: 0, refundable: 'true', demo: false };
  const hotel = { id: 'offline-hotel', offer_id: 'offline-hotel', provider: 'liteapi', key: 'offline', kind: 'hotel', title: 'Offline Hotel',
    amount: 20, currency: 'CHF', cancellable: 'true', merchant: LITEAPI_MERCHANT, city: 'Lisbon', travelers: 1, nights: 3,
    start_date: '2030-01-02', end_date: '2030-01-05', items: [{ item_name: 'Room', item_category: 'hotel_room', quantity: 1, unit_price: 20, currency: 'CHF', item_details: 'Refundable room' }] };
  const calls = { authorize: [], void: [], booked: [], providerBook: 0, refresh: 0, prebook: 0 }, hooks = {}, events = [], done = deferred();
  const leash = async (method, path, body) => {
    await hooks.leash?.(method, path, body);
    if (method === 'GET') {
      if (path.endsWith('/summary')) return structuredClone(store.summary(mandate.mandate_id));
      if (path.startsWith('/v1/mandates/')) return structuredClone(store.getMandate(mandate.mandate_id));
      return structuredClone(store.get(path.split('/').at(-1)));
    }
    if (path === '/v1/authorizations') { calls.authorize.push(structuredClone(body)); return store.authorizeChecked(body); }
    const id = path.split('/').at(-2);
    if (path.endsWith('/void')) { calls.void.push(id); return store.voidAuthorization(id, body.reason); }
    if (path.endsWith('/booked')) { calls.booked.push(id); await hooks.report?.(); return store.markBooked(id, body); }
    throw Error(`Unexpected offline request: ${method} ${path}`);
  };
  const providerBook = async () => { calls.providerBook++; await hooks.book?.(); return { booking_reference: 'OFFLINE-ONLY', sandbox: true }; };
  const agent = createAgent({ leash, pace: () => 0, emit: event => { events.push(event); if (event.type === 'agent.finished') done.resolve(); },
    duffel: { label: 'offline stub', searchRoundTrip: async () => [structuredClone(flight)],
      refresh: async (value) => { calls.refresh++; return await hooks.refresh?.(value) ?? value; }, book: providerBook },
    liteapi: { on: true, searchHotels: async () => [structuredClone(hotel)],
      prebook: async () => { calls.prebook++; return await hooks.prebook?.() ?? { prebookId: 'offline-prebook', amount: 20, currency: 'CHF', cancellable: 'true' }; }, book: providerBook },
  });
  return { agent, store, mandate, rules, flight, hotel, calls, hooks, events, done: done.promise,
    start: () => agent.start(mandate.mandate_id), run: async () => { await agent.start(mandate.mandate_id); await done.promise; } };
}

test('booking boundary: ordinary approved flight and hotel still book once through fresh rule and budget checks', async () => {
  for (const kind of ['flight', 'hotel']) {
    const h = setup(kind); const reads = []; h.hooks.leash = async (method, path) => { if (method === 'GET') reads.push(path); };
    await h.run(); assert.equal(h.calls.providerBook, 1); assert.equal(h.calls.booked.length, 1);
    assert.ok(reads.some(path => path.endsWith('/summary'))); assert.equal(h.calls.void.length, 0);
  }
});

test('booking boundary: Stop during refresh or prebook prevents submission', async () => {
  for (const kind of ['flight', 'hotel']) {
    const h = setup(kind), entered = deferred(), release = deferred();
    h.hooks[kind === 'flight' ? 'refresh' : 'prebook'] = async value => { entered.resolve(); await release.promise; return value; };
    await h.start(); await entered.promise; h.agent.stop(); release.resolve(); await h.done;
    assert.equal(h.calls.providerBook, 0); assert.equal(h.calls.booked.length, 0); assert.equal(h.agent.state().stopped, true);
  }
});

test('booking boundary: fresh wallet pause or revoke prevents booking after refresh/prebook', async () => {
  for (const kind of ['flight', 'hotel']) for (const status of ['paused', 'revoked']) {
    const h = setup(kind); h.hooks[kind === 'flight' ? 'refresh' : 'prebook'] = async value => { h.store.setStatus(h.mandate.mandate_id, status); return value; };
    await h.run(); assert.equal(h.calls.providerBook, 0); assert.equal(h.calls.booked.length, 0);
    assert.equal(h.store.summary(h.mandate.mandate_id).approved, kind === 'flight' ? 60 : 20);
  }
});

test('booking boundary: changed hard rules and budget are rechecked before payment', async () => {
  for (const field of ['budget', 'purchase']) {
    const h = setup(); h.hooks.refresh = async value => { h.store.updateMandate(h.mandate.mandate_id, { hard_rules: h.rules.map(rule => rule.id === field ? { ...rule, value: 10 } : rule) }); return value; };
    await h.run(); assert.equal(h.calls.providerBook, 0); assert.ok(h.events.some(e => /Limit|Reisekasse|Regeln/.test(e.text ?? '')));
  }
});

test('booking boundary: Stop while final GET is in flight still prevents submission', async () => {
  const h = setup(); let mandateReads = 0;
  h.hooks.leash = async (method, path) => { if (method === 'GET' && path === `/v1/mandates/${h.mandate.mandate_id}` && ++mandateReads === 2) h.agent.stop(); };
  await h.run(); assert.equal(h.calls.providerBook, 0); assert.equal(h.calls.booked.length, 0);
});

test('booking boundary: any flight amount, currency or cancellation change requires a new authorization', async () => {
  for (const change of [{ amount: 60.001 }, { total_currency: 'USD' }, { refundable: 'false' }]) {
    const h = setup(); h.hooks.refresh = async value => ({ ...value, ...change });
    await h.run(); assert.equal(h.calls.authorize.length, 2); assert.equal(h.calls.void.length, 1); assert.equal(h.calls.providerBook, 1);
    const final = h.calls.authorize[1]; assert.equal(final.amount, change.amount ?? 60); assert.equal(final.currency, change.total_currency ?? 'CHF'); assert.equal(final.order_cancellable, change.refundable ?? 'true');
  }
});

test('booking boundary: one-cent hotel increase, currency and cancellation changes never reuse old approval', async () => {
  for (const change of [{ amount: 20.01 }, { currency: 'USD' }, { cancellable: 'false' }]) {
    const h = setup('hotel'); h.hooks.prebook = async () => ({ prebookId: 'offline-prebook', amount: 20, currency: 'CHF', cancellable: 'true', ...change });
    await h.run(); assert.equal(h.calls.authorize.length, 2); assert.equal(h.calls.void.length, 1); assert.equal(h.calls.providerBook, 1);
  }
});

test('booking boundary: a small fresh increase beyond the purchase limit is declined before booking', async () => {
  const h = setup('hotel'); h.store.updateMandate(h.mandate.mandate_id, { hard_rules: h.rules.map(rule => rule.id === 'purchase' ? { ...rule, value: 20 } : rule) });
  h.hooks.prebook = async () => ({ prebookId: 'offline-prebook', amount: 20.01, currency: 'CHF', cancellable: 'true' });
  await h.run(); assert.equal(h.calls.providerBook, 0); assert.equal(h.calls.authorize.length, 2);
  assert.equal(h.store.get(h.calls.authorize[1].authorization_id).status, 'declined');
});

test('booking boundary: an ambiguous provider result retains budget and stops instead of trying another offer', async () => {
  for (const kind of ['flight', 'hotel']) {
    const h = setup(kind); h.hooks.book = async () => { throw Error('timeout after possible provider acceptance'); };
    await h.run(); assert.equal(h.calls.providerBook, 1); assert.equal(h.calls.void.length, 0);
    assert.equal(h.store.summary(h.mandate.mandate_id).approved, kind === 'flight' ? 60 : 20);
    assert.equal(h.agent.state().uncertain.length, 1); assert.ok(h.events.some(e => e.booking_unknown === true));
  }
});

test('booking boundary: failed booked-report after provider success never releases budget', async () => {
  const h = setup(); h.hooks.report = async () => { throw Error('leash reply unavailable after booking'); };
  await h.run(); assert.equal(h.calls.providerBook, 1); assert.equal(h.calls.void.length, 0);
  assert.equal(h.store.summary(h.mandate.mandate_id).approved, 60); assert.equal(h.agent.state().uncertain.length, 1);
  assert.equal(h.events.filter(e => e.kind === 'booked').length, 0);
});

test('booking boundary: demo bookings also honor a freshly revoked mandate', async () => {
  const h = setup('activity'); h.hooks.leash = async (method, path) => {
    if (method === 'GET' && path.startsWith('/v1/authorizations/')) h.store.setStatus(h.mandate.mandate_id, 'revoked');
  };
  await h.run(); assert.equal(h.calls.providerBook, 0); assert.equal(h.calls.booked.length, 0); assert.equal(h.agent.state().stopped, true);
});

test('booking boundary: a late successful response after Stop remains recorded truthfully', async () => {
  const h = setup(); h.hooks.book = async () => { h.agent.stop(); };
  await h.run(); assert.equal(h.calls.providerBook, 1); assert.equal(h.calls.booked.length, 1); assert.equal(h.calls.void.length, 0);
  assert.equal(h.agent.state().stopped, true); assert.equal(h.store.summary(h.mandate.mandate_id).approved, 60);
});

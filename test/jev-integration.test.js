import test from 'node:test';
import fs from 'node:fs';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { createLeashStore } from '../server/leash/store.js';
import { createLeashService } from '../server/leash/service.js';
import { semanticInput } from '../server/leash/semantic.js';
import { erstelleTextpruefung } from '../server/leash/vendor/jev-check.js';

const match = { passung: 'passt', quelle: 'jev' };
const rule = { id: 'cancel', field: 'authorization.order_cancellable', operator: '=', value: 'true', applies_to: ['hotel'] };
function setup(textCheck = async () => match, options = {}, policy = 'ask') {
  const store = createLeashStore({ textCheck, ...options });
  const draft = store.createDraft({ instruction: 'Ein stornierbares Hotel, höchstens 300 CHF.', uncertainty_policy: policy,
    hard_rules: [{ id: 'budget', kind: 'budget_total', field: 'authorization.billing_amount_chf', operator: '<=', value: 300, currency: 'CHF', scope: 'period' }, rule] });
  const m = store.confirmDraft(draft.draft_id, { confirmed: true });
  const auth = { authorization_id: 'jev-1', mandate_id: m.mandate_id, amount: 240, currency: 'CHF', order_cancellable: 'true',
    merchant: { merchant_id: 'ME-DUFFEL', merchant_name: 'Duffel', domain: 'duffel.com' },
    items: [{ item_name: 'Zimmer', item_category: 'hotel_room', quantity: 1, unit_price: 240, item_details: 'Kostenlos stornierbares Zimmer.' }],
    travel: { kind: 'hotel', title: 'Testhotel' } };
  return { store, m, auth };
}
const deferred = () => { let resolve; const promise = new Promise(r => { resolve = r; }); return { promise, resolve }; };

test('original Jev contract joins the wallet, emits real progress and preserves replay', async () => {
  let calls = 0;
  const { store, m, auth } = setup(async input => { calls++; assert.ok(input.auftrag); return match; });
  const decision = await store.authorizeChecked(auth);
  assert.equal(decision.decision, 'approve');
  assert.equal(decision.semantic_check.quelle, 'jev');
  assert.ok(decision.checks.some(c => c.rule_id === 'jev_content' && c.status === 'pass'));
  assert.deepEqual(store.events().filter(e => e.type.includes('semantic')).map(e => e.type), ['authorization.semantic.started', 'authorization.semantic.completed']);
  assert.equal((await store.authorizeChecked(auth)).replay, true);
  assert.equal(calls, 1);
  assert.equal(store.summary(m.mandate_id).approved, 240);
  await assert.rejects(store.authorizeChecked({ ...auth, amount: 600 }), /anderen Kaufdaten/);
});

test('clear budget violation bypasses Jev and cannot become uncertainty', async () => {
  const { store, auth } = setup(async () => { throw new Error('Should not call model'); });
  const result = await store.authorizeChecked({ ...auth, amount: 360 });
  assert.equal(result.decision, 'decline');
  assert.equal(result.semantic_check, undefined);
});

test('semantic contradiction declines a structurally matching offer', async () => {
  const { store, auth } = setup(async () => ({ passung: 'widerspricht', quelle: 'jev' }));
  const d = await store.authorizeChecked(auth);
  assert.equal(d.decision, 'decline');
  assert.ok(d.reason_codes.includes('jev_text_conflict'));
});

test('uncertainty asks the real customer; no automatic customer answer', async () => {
  const { store, auth } = setup(async () => ({ passung: 'unklar', quelle: 'jev' }));
  const d = await store.authorizeChecked(auth);
  assert.equal(d.status, 'pending');
  assert.equal(d.step_up.window_seconds, 120);
  assert.equal(store.get(auth.authorization_id).resolution, null);
  assert.equal(store.resolve(auth.authorization_id, { decision: 'approve' }).status, 'approved');
});

test('model outage/fake fallback never becomes a positive Jev approval', async () => {
  for (const output of [{ passung: 'passt', quelle: 'ersatz' }, { passung: 'bogus', quelle: 'jev' }, null]) {
    const { store, auth } = setup(async () => output, {}, 'approve');
    const d = await store.authorizeChecked(auth);
    assert.equal(d.decision, 'step_up');
    assert.equal(d.semantic_check.quelle, 'ersatz');
    assert.equal(d.semantic_check.passung, 'unklar');
  }
});

test('genuine uncertainty respects confirmed decline/approve policies and stays visible', async () => {
  for (const policy of ['decline', 'approve']) {
    const { store, auth } = setup(async () => ({ passung: 'unklar', quelle: 'jev' }), {}, policy);
    const d = await store.authorizeChecked(auth);
    assert.equal(d.decision, policy);
    assert.equal(d.checks.at(-1).status, 'unknown');
    assert.ok(d.uncertainty.length);
  }
});

test('pause/revoke during Jev prevents authorization after the model returns', async () => {
  for (const status of ['paused', 'revoked']) {
    const gate = deferred();
    const { store, m, auth } = setup(() => gate.promise);
    const work = store.authorizeChecked(auth);
    store.setStatus(m.mandate_id, status);
    gate.resolve(match);
    assert.equal((await work).decision, 'decline');
    assert.equal(store.summary(m.mandate_id).approved, 0);
  }
});

test('changed policy during Jev invalidates the stale result and customer approval', async () => {
  const gate = deferred();
  const { store, m, auth } = setup(() => gate.promise);
  const work = store.authorizeChecked(auth);
  store.updateMandate(m.mandate_id, { hard_rules: [...m.hard_rules, { id: 'city', field: 'travel.destination_city', operator: '=', value: 'Lisbon' }] });
  gate.resolve(match);
  const d = await work;
  assert.equal(d.decision, 'step_up');
  assert.equal(d.semantic_check.quelle, 'ersatz');
  assert.throws(() => store.resolve(auth.authorization_id, { decision: 'approve' }), /erneut prüfen/);
});

test('two model calls cannot approve the same remaining budget', async () => {
  const gate = deferred();
  const { store, m, auth } = setup(() => gate.promise);
  const a = store.authorizeChecked(auth);
  const b = store.authorizeChecked({ ...auth, authorization_id: 'jev-2' });
  gate.resolve(match);
  assert.deepEqual((await Promise.all([a, b])).map(d => d.decision), ['approve', 'decline']);
  assert.equal(store.summary(m.mandate_id).approved, 240);
});

test('concurrent matching retry shares model work; altered request conflicts', async () => {
  const gate = deferred(); let calls = 0;
  const { store, auth } = setup(() => { calls++; return gate.promise; });
  const a = store.authorizeChecked(auth), b = store.authorizeChecked({ ...auth });
  await assert.rejects(store.authorizeChecked({ ...auth, amount: 12 }), /anderen Kaufdaten/);
  gate.resolve(match);
  assert.equal((await a).decision, 'approve');
  assert.equal((await b).decision, 'approve');
  assert.equal(calls, 1);
});

test('HTTP callers cannot supply their own semantic pass', async t => {
  const { store, auth } = setup(async () => ({ passung: 'widerspricht', quelle: 'jev' }));
  const server = createLeashService({ store, customerKey: 'test-customer', agentKey: 'test-agent' }).server();
  await new Promise(r => server.listen(0, '127.0.0.1', r));
  t.after(() => { server.closeAllConnections(); server.close(); });
  const res = await fetch(`http://127.0.0.1:${server.address().port}/v1/authorizations`, {
    method: 'POST', headers: { Authorization: 'Bearer test-agent', 'Content-Type': 'application/json' },
    body: JSON.stringify({ ...auth, semantic_check: match }),
  });
  assert.equal(res.status, 200);
  assert.equal((await res.json()).decision, 'decline');
});

test('semantic projection excludes money and other booking categories', () => {
  const { m, auth } = setup();
  const input = semanticInput(m, auth);
  assert.ok(!input.auftrag.includes('300'));
  assert.ok(input.auftrag.includes('order_cancellable'));
  assert.ok(!input.angebotstext.includes('unit_price'));
  assert.equal(semanticInput(m, { ...auth, travel: { kind: 'flight' } }), null);
});

test('agent cannot forge a lower issuer billing amount to bypass the budget', async () => {
  const { store, auth, m } = setup();
  for (const data of [{ amount: 1000, currency: 'CHF', billing_amount_chf: 1 },
    { amount: 1000, currency: 'EUR', billing_amount_chf: 1 },
    { amount: 1000, currency: 'ZZZ', billing_amount_chf: 1 }]) {
    await assert.rejects(store.authorizeChecked({ ...auth, ...data }), /Abrechnungsbetrag/);
  }
  assert.equal(store.summary(m.mandate_id).approved, 0);
  assert.equal((await store.authorizeChecked({ ...auth, billing_amount_chf: 240 })).decision, 'approve');
});

test('Jev receives structured size and return window without inventing missing values', () => {
  const mandate = { hard_rules: [{ field: 'items.size', operator: '=', value: '43' }, { field: 'items.return_days', operator: '>=', value: 14 }] };
  const input = semanticInput(mandate, { items: [{ item_name: 'Schuhe', size: '43', return_days: 30 }, { item_name: 'Schuhe ohne Angaben' }] });
  const items = JSON.parse(input.angebotstext).items;
  assert.equal(items[0].size, '43');
  assert.equal(items[0].return_days, 30);
  assert.equal(items[1].size, null);
  assert.equal(items[1].return_days, null);
});

test('invalid amounts cannot get model approval and exact budget passes', async () => {
  for (const amount of [NaN, Infinity, -1, '240', undefined]) {
    const { store, auth } = setup();
    await assert.rejects(store.authorizeChecked({ ...auth, amount }), /amount/);
  }
  const { store, auth } = setup();
  auth.amount = 300; auth.items[0].unit_price = 300;
  assert.equal((await store.authorizeChecked(auth)).decision, 'approve');
});

test('booking cannot release spent budget; committed decisions survive restart', async () => {
  const dir = mkdtempSync(path.join(tmpdir(), 'trevl-jev-'));
  try {
    const file = path.join(dir, 'state.json');
    const { store, m, auth } = setup(undefined, { file });
    await store.authorizeChecked(auth);
    assert.equal(JSON.parse(readFileSync(file, 'utf8')).auths[auth.authorization_id].status, 'approved');
    store.markBooked(auth.authorization_id, { booking_reference: 'OFFLINE' });
    assert.throws(() => store.voidAuthorization(auth.authorization_id), /Budget bleibt/);
    const restarted = createLeashStore({ file });
    assert.equal(restarted.summary(m.mandate_id).approved, 240);
    writeFileSync(file, '{ broken');
    assert.throws(() => createLeashStore({ file }), SyntaxError);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('original checker rejects invalid probabilities and bounds a hanging transport', async () => {
  const invalid = erstelleTextpruefung(async () => ({ answers: { passung: { type: 'choice', choice: 'passt', confidence: 1, probabilities: { passt: 0, widerspricht: 1, unklar: 0 } } } }));
  assert.deepEqual(await invalid({ auftrag: 'Hotel', angebotstext: 'Hotel' }), { passung: 'unklar', quelle: 'ersatz' });
  const start = performance.now();
  const hanging = erstelleTextpruefung(() => new Promise(() => {}), 15);
  assert.deepEqual(await hanging({ auftrag: 'Hotel', angebotstext: 'Hotel' }), { passung: 'unklar', quelle: 'ersatz' });
  assert.ok(performance.now() - start < 1000);
});

test('failed persistence never exposes an uncommitted approval via retry, GET or SSE', async () => {
  const dir = mkdtempSync(path.join(tmpdir(), 'trevl-durability-'));
  const file = path.join(dir, 'state.json');
  const { store, auth } = setup(undefined, { file });
  const realWrite = fs.writeFileSync;
  let attempts = 0; const events = [];
  store.subscribe(e => events.push(e));
  fs.writeFileSync = (...args) => {
    if (args[0] === file + '.tmp') { attempts++; throw new Error('simulated ENOSPC'); }
    return realWrite(...args);
  };
  try {
    // Use the sync commit to isolate a failure after the decision, not at the
    // earlier semantic-start event. HTTP also runs ensureDurable before serving.
    assert.throws(() => store.authorize(auth), /ENOSPC/);
    assert.throws(() => store.authorize(auth), /ENOSPC/);
    assert.throws(() => store.get(auth.authorization_id), /ENOSPC/);
    assert.throws(() => store.ensureDurable(), /ENOSPC/);
    assert.equal(attempts, 4);
    assert.equal(events.filter(e => e.type === 'authorization.decided').length, 0);
  } finally { fs.writeFileSync = realWrite; }
  try {
    const replay = store.authorize(auth);
    assert.equal(replay.status, 'approved');
    assert.equal(replay.replay, true);
    assert.equal(JSON.parse(readFileSync(file, 'utf8')).auths[auth.authorization_id].status, 'approved');
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

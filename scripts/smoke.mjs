// End-to-end check against a running server: compile → confirm → agent → answer the question.
// Usage: node scripts/smoke.mjs [baseUrl] [approve|decline] ["eigener Reisetext"]
const B = process.argv[2] ?? 'http://localhost:4310';
const answer = process.argv[3] ?? 'approve';
const j = async (method, p, body) => {
  const r = await fetch(B + p, { method, headers: { 'Content-Type': 'application/json' }, body: body && JSON.stringify(body) });
  const out = await r.json();
  if (!r.ok) throw new Error(`${method} ${p}: ${JSON.stringify(out)}`);
  return out;
};
const sleep = (ms) => new Promise(r => setTimeout(r, ms));

await j('POST', '/api/regie/reset', {});
await j('POST', '/api/regie/pace', { pace: 0.2 });
const text = process.argv[4] ?? "Lissabon vom 9. bis 12. Oktober zu zweit, alles zusammen max. CHF 1'500, Hotel kostenlos stornierbar, keine Extras, frag mich, wenn du unsicher bist.";
const d = await j('POST', '/api/compile', { text });
console.log('Leine:', d.hard_rules.map(r => r.label).join(' | '));
const draft = await j('POST', '/api/leash/mandates', { instruction: d.instruction, trip: d.trip, hard_rules: d.hard_rules, uncertainty_policy: d.uncertainty_policy, guidance: d.guidance, open_questions: [], valid_until: d.trip.start_date });
const m = await j('POST', `/api/leash/mandates/${draft.draft_id}/confirm`, { confirmed: true });
await j('POST', '/api/agent/start', { mandate_id: m.mandate_id });
for (let i = 0; i < 360; i++) { // real APIs (Duffel, LiteAPI) can take a while
  await sleep(500);
  const list = await j('GET', `/api/leash/authorizations?mandate_id=${m.mandate_id}`);
  const pending = list.find(a => a.status === 'pending');
  if (pending) { console.log(`Frage: ${pending.decision.summary} → ${answer}`); await j('POST', `/api/leash/authorizations/${pending.authorization_id}/resolve`, { decision: answer }); }
  const st = await j('GET', '/api/agent/state');
  if (st.done) break;
}
const list = await j('GET', `/api/leash/authorizations?mandate_id=${m.mandate_id}`);
for (const a of list) console.log(`${a.status.padEnd(10)} ${a.authorization.travel.kind.padEnd(8)} ${a.authorization.purchase_description.padEnd(28)} ${a.authorization.currency} ${a.authorization.amount.toFixed(2).padStart(7)}  ${a.decision.reason_codes.join(',')}  ${a.booking?.booking_reference ?? ''}  ${a.decision.latency_ms} ms`);
console.log('Kasse:', await j('GET', `/api/leash/mandates/${m.mandate_id}/summary`));

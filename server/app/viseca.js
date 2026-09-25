// Replays Viseca's public scenarios (data pack from github.com/Swiss-ai-Weeks/viseca-2026) through the
// same leash engine the app uses. Only the customer-confirmed rules per instruction are written down here,
// as trevl's frontend would produce them after the customer confirms. No expected answers exist or are used.
import fs from 'node:fs';
import path from 'node:path';
import { createLeashStore } from '../leash/store.js';

function parseLine(l) {
  const out = []; let cur = '', q = false;
  for (let i = 0; i < l.length; i++) {
    const c = l[i];
    if (q) { if (c === '"' && l[i + 1] === '"') { cur += '"'; i++; } else if (c === '"') q = false; else cur += c; }
    else if (c === '"') q = true; else if (c === ',') { out.push(cur); cur = ''; } else cur += c;
  }
  out.push(cur);
  return out;
}
function csv(dir, name) {
  const lines = fs.readFileSync(path.join(dir, name), 'utf8').trim().split(/\r?\n/);
  const head = parseLine(lines[0]);
  return lines.slice(1).map(l => { const v = parseLine(l); return Object.fromEntries(head.map((h, i) => [h, v[i]])); });
}
const num = (v) => (v === '' || v == null ? null : Number(v));
const str = (v) => (v === '' || v == null ? null : v);

const R = {
  perOrder: (v) => ({ id: 'per_order', kind: 'budget_purchase', label: `Pro Bestellung höchstens CHF ${v}`, field: 'authorization.billing_amount_chf', operator: '<=', value: v, currency: 'CHF', scope: 'purchase' }),
  rolling: (v, d) => ({ id: 'rolling', kind: 'budget_total', label: `Höchstens CHF ${v} in ${d} Tagen`, field: 'authorization.billing_amount_chf', operator: '<=', value: v, currency: 'CHF', scope: 'period', period_days: d }),
  categories: (list) => ({ id: 'categories', kind: 'no_extras', label: `Nur ${list.join(', ')}`, field: 'items.item_category', operator: 'in', value: list }),
  item: (names) => ({ id: 'item', kind: 'item', label: `Nur: ${names.join(', ')}`, field: 'items.item_name', operator: 'in', value: names }),
  size: (s) => ({ id: 'size', kind: 'size', label: `Grösse ${s}`, field: 'items.size', operator: '=', value: s }),
  shopType: (list) => ({ id: 'shop_type', kind: 'merchant_category', label: 'Nur Sport-Fachhändler', field: 'merchant.merchant_category', operator: 'in', value: list }),
  returnable: () => ({ id: 'returnable', kind: 'returns', label: 'Rückgabe möglich', field: 'authorization.order_returnable', operator: '=', value: 'true' }),
  returnDays: (d) => ({ id: 'return_days', kind: 'returns', label: `Rückgabe mindestens ${d} Tage`, field: 'items.return_days', operator: '>=', value: d }),
  knownShop: () => ({ id: 'known_shop', kind: 'merchant_trust', label: 'Nur Shops, bei denen ich schon gekauft habe', field: 'merchant.trust_level', operator: 'in', value: ['known', 'verified'] }),
};
export const VISECA_MANDATES = {
  SCEN0000: [R.perOrder(20), R.categories(['groceries']), R.knownShop()],
  SCEN0001: [R.perOrder(120), R.rolling(300, 7), R.categories(['groceries', 'household'])],
  SCEN0002: [R.item(['Road-running shoes']), R.size('43'), R.shopType(['sporting_goods']), R.returnable(), R.returnDays(14), R.perOrder(200)],
  SCEN0003: [R.categories(['clothing']), R.perOrder(250), R.knownShop()],
  SCEN0004: [R.item(['27-inch computer monitor']), R.perOrder(400), R.knownShop()],
};

export function visecaDataAvailable(dir) {
  return !!dir && fs.existsSync(path.join(dir, 'purchase_attempts.csv'));
}

export function runVisecaReplay(dir) {
  const t0 = performance.now();
  const scenarios = csv(dir, 'scenario_catalogue.csv');
  const attempts = csv(dir, 'purchase_attempts.csv');
  const lines = csv(dir, 'purchase_attempt_items.csv');
  const merchants = Object.fromEntries(csv(dir, 'merchants.csv').map(m => [m.merchant_id, m]));
  const history = csv(dir, 'authorization_history.csv');
  const totals = { approve: 0, decline: 0, step_up: 0 };
  let maxLatency = 0;
  const result = [];

  for (const sc of scenarios) {
    const rows = attempts.filter(a => a.scenario_id === sc.scenario_id).sort((a, b) => Number(a.replay_order) - Number(b.replay_order));
    if (!rows.length || !VISECA_MANDATES[sc.scenario_id]) continue;
    const card = rows[0].card_id, start = rows[0].timestamp;
    // Chronology-safe: only history before the scenario starts.
    const past = history.filter(h => h.card_id === card && h.status === 'approved' && h.transaction_type === 'purchase' && h.timestamp < start);
    const familiarMerchants = [...new Map(past.map(h => [h.merchant_id, { merchant_id: h.merchant_id, merchant_name: h.merchant_name }])).values()];
    const familiarDevices = [...new Set(past.map(h => h.customer_device_id).filter(Boolean))];
    let clock = Date.parse(start);
    const store = createLeashStore({ clock: () => clock, familiarMerchantsSeed: familiarMerchants, familiarDevicesSeed: familiarDevices });
    const draft = store.createDraft({ instruction: sc.cardholder_instruction, hard_rules: VISECA_MANDATES[sc.scenario_id], uncertainty_policy: 'ask' });
    const m = store.confirmDraft(draft.draft_id, { confirmed: true });
    const liveId = new Map();
    const out = [];
    for (const a of rows) {
      clock = Date.parse(a.timestamp);
      store.sweep(); // unanswered questions expire after 120 s of simulated time
      const mer = merchants[a.merchant_id];
      const auth = {
        authorization_id: `LIVE-${a.authorization_id}`, source_authorization_id: a.authorization_id, scenario_id: a.scenario_id, replay_order: Number(a.replay_order),
        mandate_id: m.mandate_id, initiator_type: 'agent', timestamp: a.timestamp,
        merchant: { merchant_id: mer.merchant_id, merchant_name: mer.merchant_name, merchant_category: mer.merchant_category, merchant_mcc: mer.merchant_mcc, merchant_country: mer.merchant_country, merchant_city: mer.merchant_city, availability: mer.availability, recurring_capable: mer.recurring_capable },
        amount: num(a.amount), currency: a.currency, billing_amount_chf: num(a.billing_amount_chf), items_subtotal: num(a.items_subtotal), delivery_fee: num(a.delivery_fee) ?? 0,
        channel: a.channel, customer_device_id: str(a.customer_device_id), recent_attempt_count_10m: num(a.recent_attempt_count_10m) ?? 0,
        fulfillment_method: str(a.fulfillment_method), delivery_by: str(a.delivery_by), order_returnable: str(a.order_returnable) ?? 'unknown', order_cancellable: str(a.order_cancellable) ?? 'unknown',
        related_authorization_id: a.related_authorization_id ? liveId.get(a.related_authorization_id) ?? null : null, related_authorization_status: str(a.related_authorization_status),
        purchase_description: a.purchase_description,
        items: lines.filter(l => l.authorization_id === a.authorization_id).map(l => ({ line_no: Number(l.line_no), item_id: l.item_id, item_name: l.item_name, item_category: l.item_category, quantity: Number(l.quantity), unit_price: Number(l.unit_price), currency: l.currency, item_details: l.item_details })),
      };
      liveId.set(a.authorization_id, auth.authorization_id);
      const d = store.authorize(auth);
      totals[d.decision]++;
      maxLatency = Math.max(maxLatency, d.latency_ms);
      out.push({ order: Number(a.replay_order), id: a.authorization_id, timestamp: a.timestamp, merchant: mer.merchant_name, amount: Number(a.amount), currency: a.currency,
        items: auth.items.map(i => i.item_name).join(', '), decision: d.decision, reason_codes: d.reason_codes, summary: d.summary, latency_ms: d.latency_ms });
    }
    result.push({ id: sc.scenario_id, name: sc.scenario_name, instruction: sc.cardholder_instruction, rules: m.hard_rules.map(r => r.label),
      familiar_shops: familiarMerchants.length, familiar_devices: familiarDevices.length, rows: out });
  }
  return { scenarios: result, totals, count: totals.approve + totals.decline + totals.step_up, max_latency_ms: maxLatency, total_ms: Math.round((performance.now() - t0) * 10) / 10 };
}

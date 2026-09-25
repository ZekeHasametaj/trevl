// Wallet policy (mandate) format and change rules.
// Core rule fields follow Viseca's rule format: field, operator, value, currency, scope, period_days.
// trevl adds: id, kind (UI hint), label, applies_to (booking kinds), source (where the rule came from).

export const OPERATORS = ['<', '<=', '=', '!=', '>', '>=', 'in', 'not_in'];
export const UNCERTAINTY = ['approve', 'ask', 'decline'];
export const BOOKING_KINDS = ['flight', 'hotel', 'transfer', 'activity'];
const STRICTNESS = { approve: 0, ask: 1, decline: 2 };

export class PolicyError extends Error {
  constructor(message, status = 400, details) { super(message); this.status = status; this.details = details; }
}

export function validateRule(r, i = 0) {
  const where = `Regel ${i + 1}`;
  if (!r || typeof r !== 'object') throw new PolicyError(`${where}: ungültig`);
  if (typeof r.field !== 'string' || !r.field.trim()) throw new PolicyError(`${where}: field fehlt`);
  if (!OPERATORS.includes(r.operator)) throw new PolicyError(`${where}: Operator ${r.operator} unbekannt`);
  const v = r.value;
  const okValue = typeof v === 'number' ? Number.isFinite(v) : typeof v === 'string' ? true : Array.isArray(v) && v.every(x => typeof x === 'string');
  if (!okValue) throw new PolicyError(`${where}: value muss Zahl, Text oder Textliste sein`);
  if ((r.operator === 'in' || r.operator === 'not_in') && !Array.isArray(v)) throw new PolicyError(`${where}: in/not_in braucht eine Liste`);
  if (r.scope != null && !['purchase', 'period'].includes(r.scope)) throw new PolicyError(`${where}: scope ungültig`);
  if (r.period_days != null && !(Number.isInteger(r.period_days) && r.period_days >= 1)) throw new PolicyError(`${where}: period_days ungültig`);
  if (r.applies_to != null && !(Array.isArray(r.applies_to) && r.applies_to.every(k => BOOKING_KINDS.includes(k)))) throw new PolicyError(`${where}: applies_to ungültig`);
  return {
    id: r.id || `R${i + 1}`,
    kind: r.kind || 'custom',
    label: r.label || `${r.field} ${r.operator} ${Array.isArray(v) ? v.join(', ') : v}`,
    field: r.field.trim(), operator: r.operator, value: v,
    ...(r.currency ? { currency: r.currency } : {}),
    ...(r.scope ? { scope: r.scope } : {}),
    ...(r.period_days ? { period_days: r.period_days } : {}),
    ...(r.applies_to ? { applies_to: r.applies_to } : {}),
    source: r.source ?? { type: 'customer' },
  };
}

export function validateMandateInput(body) {
  if (!body || typeof body !== 'object') throw new PolicyError('Leere Leine');
  if (typeof body.instruction !== 'string' || !body.instruction.trim()) throw new PolicyError('Originaltext (instruction) fehlt');
  if (!Array.isArray(body.hard_rules)) throw new PolicyError('hard_rules fehlt');
  const unc = body.uncertainty_policy ?? 'ask';
  if (!UNCERTAINTY.includes(unc)) throw new PolicyError('uncertainty_policy muss approve, ask oder decline sein');
  const rules = body.hard_rules.map(validateRule);
  const ids = new Set();
  for (const r of rules) { if (ids.has(r.id)) r.id = `${r.id}-${ids.size}`; ids.add(r.id); }
  return {
    instruction: body.instruction.trim(),
    trip: body.trip ?? null,
    hard_rules: rules,
    uncertainty_policy: unc,
    guidance: Array.isArray(body.guidance) ? body.guidance.map(String) : [],
    open_questions: Array.isArray(body.open_questions) ? body.open_questions : [],
    valid_until: typeof body.valid_until === 'string' ? body.valid_until : null,
  };
}

// Compare one old rule with its new version. Returns 'same' | 'tighter' | 'looser'.
function compareRule(o, n) {
  if (o.field !== n.field || (o.applies_to ?? []).join() !== (n.applies_to ?? []).join() || o.scope !== n.scope || o.period_days !== n.period_days) return 'looser';
  if (JSON.stringify(o.value) === JSON.stringify(n.value) && o.operator === n.operator) return 'same';
  if (o.operator !== n.operator) {
    // "< x" is tighter than "<= x"; everything else counts as a real change.
    if (o.operator === '<=' && n.operator === '<' && n.value <= o.value) return 'tighter';
    if (o.operator === '>=' && n.operator === '>' && n.value >= o.value) return 'tighter';
    return 'looser';
  }
  switch (o.operator) {
    case '<': case '<=': return n.value < o.value ? 'tighter' : 'looser';
    case '>': case '>=': return n.value > o.value ? 'tighter' : 'looser';
    case 'in': return n.value.every(x => o.value.includes(x)) ? 'tighter' : 'looser';
    case 'not_in': return o.value.every(x => n.value.includes(x)) ? 'tighter' : 'looser';
    default: return 'looser';
  }
}

// Diff an active mandate against a proposed update. Loosening needs a fresh customer confirmation.
export function diffMandate(current, update) {
  const changes = [];
  if (update.hard_rules) {
    const next = update.hard_rules.map(validateRule);
    const byId = new Map(next.map(r => [r.id, r]));
    for (const o of current.hard_rules) {
      const n = byId.get(o.id);
      if (!n) changes.push({ type: 'looser', rule_id: o.id, text: `Regel entfernt: ${o.label}` });
      else {
        const c = compareRule(o, n);
        if (c !== 'same') changes.push({ type: c, rule_id: o.id, text: `${o.label} → ${n.label}` });
      }
    }
    for (const n of next) if (!current.hard_rules.some(o => o.id === n.id)) changes.push({ type: 'tighter', rule_id: n.id, text: `Neue Regel: ${n.label}` });
  }
  if (update.uncertainty_policy && update.uncertainty_policy !== current.uncertainty_policy) {
    if (!UNCERTAINTY.includes(update.uncertainty_policy)) throw new PolicyError('uncertainty_policy ungültig');
    const t = STRICTNESS[update.uncertainty_policy] > STRICTNESS[current.uncertainty_policy] ? 'tighter' : 'looser';
    changes.push({ type: t, rule_id: 'uncertainty', text: `Bei Unsicherheit: ${UNC_LABEL[current.uncertainty_policy]} → ${UNC_LABEL[update.uncertainty_policy]}` });
  }
  if (update.valid_until !== undefined && update.valid_until !== current.valid_until) {
    const t = current.valid_until && update.valid_until && update.valid_until < current.valid_until ? 'tighter' : 'looser';
    changes.push({ type: t, rule_id: 'valid_until', text: `Leine gültig bis ${update.valid_until ?? 'unbegrenzt'}` });
  }
  return changes;
}

export const UNC_LABEL = { approve: 'selbst entscheiden', ask: 'mich fragen', decline: 'ablehnen' };

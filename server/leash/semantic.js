// Jev is an additional content check, never a replacement for the wallet's rules.
// Only the trusted service calls this module; an agent-supplied "pass" has no authority.
const CONTENT_FIELDS = new Set([
  'travel.destination_city', 'travel.origin_city', 'travel.start_date', 'travel.end_date',
  'travel.travelers', 'travel.stops', 'travel.cabin_class', 'travel.checked_bags',
  'travel.stars', 'travel.kind', 'items.item_category', 'items.item_name', 'items.size',
  'items.return_days', 'authorization.order_cancellable', 'authorization.order_returnable',
]);

export function semanticInput(mandate, auth) {
  const rules = mandate.hard_rules.filter(r => CONTENT_FIELDS.has(r.field)
    && (!r.applies_to?.length || r.applies_to.includes(auth.travel?.kind)));
  if (!rules.length) return null;
  // Do not ask the text model to calculate a budget, prove merchant identity or
  // satisfy the other bookings in a whole-trip instruction. Those are separate checks.
  return {
    auftrag: 'Prüfe die inhaltlichen Anforderungen für diesen einzelnen Kauf. '
      + 'Die Feldnamen beschreiben Angebotsmerkmale. Alle folgenden bestätigten Anforderungen müssen passen: '
      + JSON.stringify(rules.map(({ field, operator, value }) => ({ field, operator, value }))),
    angebotstext: JSON.stringify({
      travel: auth.travel ?? null,
      purchase_description: auth.purchase_description ?? null,
      order_cancellable: auth.order_cancellable ?? null,
      order_returnable: auth.order_returnable ?? null,
      items: (auth.items ?? []).map(({ item_name, item_category, quantity, item_details, size, return_days }) => ({
        item_name, item_category, quantity, item_details, size: size ?? null, return_days: return_days ?? null,
      })),
    }),
  };
}

export function normalizeSemantic(result) {
  if (!result || !['passt', 'widerspricht', 'unklar'].includes(result.passung)
    || !['jev', 'ersatz'].includes(result.quelle)) return { passung: 'unklar', quelle: 'ersatz' };
  // An alleged positive fallback can never be a successful Jev check.
  return { passung: result.quelle === 'ersatz' && result.passung === 'passt' ? 'unklar' : result.passung, quelle: result.quelle };
}

export function withSemantic(decision, assessment, mandate) {
  if (!assessment) return decision;
  const conflict = assessment.passung === 'widerspricht';
  const pass = assessment.passung === 'passt' && assessment.quelle === 'jev';
  const code = conflict ? 'jev_text_conflict' : pass ? 'jev_text_match'
    : assessment.quelle === 'ersatz' ? 'jev_unavailable' : 'jev_text_unclear';
  const detail = conflict ? 'Die Textprüfung meldet einen inhaltlichen Widerspruch zu den bestätigten Anforderungen.'
    : pass ? 'Jev meldet eine inhaltliche Übereinstimmung mit den geprüften Anforderungen.'
    : assessment.quelle === 'ersatz' ? 'Keine gültige aktuelle Jev-Prüfung verfügbar. Eine Ersatzantwort ist keine Freigabe.'
    : 'Jev kann die inhaltliche Passung nicht eindeutig bestätigen.';
  const out = {
    ...decision,
    semantic_check: assessment,
    checks: [...decision.checks, { rule_id: 'jev_content', kind: 'semantic', label: 'Jev · inhaltliche Passung',
      status: conflict ? 'fail' : pass ? 'pass' : 'unknown', detail, reason_code: code, source: { type: assessment.quelle } }],
    evidence: [...decision.evidence, { fact: 'Inhaltsprüfung', value: `${assessment.passung} · ${assessment.latency_ms} ms`,
      source: assessment.quelle === 'jev' ? 'Jev · Modellbewertung, kein Beweis' : 'Ersatzantwort · keine Modellfreigabe' }],
    reason_codes: [...decision.reason_codes, code],
    latency_ms: Math.round((decision.latency_ms + assessment.latency_ms) * 100) / 100,
  };
  // Clear prohibitions always win, regardless of a positive/unclear model answer.
  if (decision.decision === 'decline') return out;
  if (conflict) {
    return { ...out, decision: 'decline', headline: 'Inhalt widerspricht deiner Leine', summary: detail,
      reason_codes: out.reason_codes.filter(c => !['within_policy', 'customer_confirmation'].includes(c)),
      customer_message: detail, agent_hint: 'Ein Angebot suchen, dessen Bedingungen zum bestätigten Auftrag passen.' };
  }
  if (pass) return out;
  // Honour the explicit uncertainty policy for genuine uncertainty. A model
  // failure never silently becomes permission, even with "approve on uncertainty".
  const next = mandate.uncertainty_policy === 'decline' ? 'decline'
    : assessment.quelle === 'ersatz' || decision.decision === 'step_up' || mandate.uncertainty_policy === 'ask' ? 'step_up' : 'approve';
  const summary = `${detail} ${next === 'step_up' ? 'Bitte entscheide über diesen konkreten Kauf.'
    : next === 'decline' ? 'Gemäss deiner Unsicherheitsregel abgelehnt.' : 'Deine bestätigte Unsicherheitsregel erlaubt diesen Kauf mit Vorbehalt.'}`;
  return { ...out, decision: next, headline: next === 'step_up' ? 'trevl fragt dich' : next === 'decline' ? 'Kauf abgelehnt' : 'Freigegeben – mit Vorbehalt',
    summary, customer_message: summary, uncertainty: [...decision.uncertainty, detail],
    reason_codes: [...new Set([...out.reason_codes.filter(c => c !== 'within_policy' && c !== 'customer_confirmation'), ...(next === 'step_up' ? ['customer_confirmation'] : [])])] };
}

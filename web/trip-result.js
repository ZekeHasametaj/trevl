// A view of recorded outcomes, never a new payment or booking decision.
const LABEL = { flight: 'Flug', hotel: 'Hotel', transfer: 'Transfer', activity: 'Aktivität' };
const amount = record => {
  const value = record.decision?.facts?.amount_chf;
  return Number.isFinite(value) && value >= 0 ? value : null;
};
const total = records => records.every(r => amount(r) !== null)
  ? Math.round(records.reduce((sum, r) => sum + amount(r), 0) * 100) / 100 : null;

export function bookingEnvironment(booking) {
  if (booking?.provider === 'duffel') return 'Duffel-Test · kein echtes Ticket';
  if (booking?.provider === 'liteapi') return 'LiteAPI-Sandbox · kein echter Aufenthalt';
  if (booking?.provider === 'demo' || booking?.demo) return 'Demo-Buchung';
  return 'Buchungsbestätigung gespeichert';
}

export function buildTripResult({ mandate, auths = [], agent = {}, feed = [], summary, block = null }) {
  if (!mandate) return null;
  const id = mandate.mandate_id;
  const records = [...new Map(auths.filter(a => a.authorization?.mandate_id === id)
    .map(a => [a.authorization_id, a])).values()];
  const startIndex = feed.findLastIndex(e => e.type === 'agent.started' && e.mandate_id === id);
  const start = feed[startIndex];
  const live = agent.mandate_id === id && (!start || agent.id === start.run_id) ? agent : null;
  const runId = start?.run_id ?? live?.id;
  const finished = feed.findLast(e => e.type === 'agent.finished' && e.run_id === runId);
  if (live?.running || (start && !finished && !live?.stopped && !live?.done)) return null;
  if (!finished && !live?.done && !live?.stopped && !block) return null;

  // Legacy agent.say events have no run id; limit those to this run's time slice.
  const nextStart = startIndex < 0 ? -1 : feed.findIndex((e, i) => i > startIndex && e.type === 'agent.started');
  const events = startIndex < 0 ? [] : feed.slice(startIndex, nextStart < 0 ? undefined : nextStart)
    .filter(e => (!e.run_id || e.run_id === runId) && (!e.mandate_id || e.mandate_id === id));
  const uncertainIds = new Set([...(live?.uncertain ?? []), ...events.filter(e => e.booking_unknown).map(e => e.authorization_id)]);
  const booked = records.filter(a => a.booking);
  const uncertain = records.filter(a => !a.booking && uncertainIds.has(a.authorization_id));
  const pending = records.filter(a => !a.booking && a.status === 'pending');
  const unconfirmed = records.filter(a => !a.booking && a.status === 'approved');
  const current = records.filter(a => a.decision?.mandate_version == null || a.decision.mandate_version === mandate.version);
  const rejected = current.filter(a => !a.booking && ['declined', 'expired'].includes(a.status));
  const stopped = !!(live?.stopped || finished?.stopped || block);
  const settling = !!(live?.stopped && !live.done && !finished);
  const lastStop = events.findLast(e => e.type === 'agent.say' && ['warn', 'stop'].includes(e.kind) &&
    !(e.booking_unknown && booked.some(a => a.authorization_id === e.authorization_id)));
  const kinds = [...new Set([...(mandate.trip?.kinds ?? ['flight', 'hotel', 'transfer']),
    ...[...booked, ...uncertain, ...pending, ...unconfirmed, ...rejected].map(a => a.authorization.travel?.kind).filter(Boolean)])];
  const rows = kinds.map(kind => {
    const ofKind = list => list.filter(a => a.authorization.travel?.kind === kind);
    const bookings = ofKind(booked), unknowns = ofKind(uncertain), waiting = ofKind(pending), approvals = ofKind(unconfirmed), declines = ofKind(rejected);
    const attempts = ofKind(current).filter(a => !['superseded'].includes(a.status));
    const last = attempts.at(-1);
    let state, reason;
    if (unknowns.length) { state = 'uncertain'; reason = 'Der Anbieter könnte gebucht haben. Bestätigung fehlt; vor einem neuen Versuch den Anbieterstatus prüfen.'; }
    else if (waiting.length) { state = 'pending'; reason = 'Deine Freigabe steht noch aus. Noch keine bestätigte Buchung für dieses Angebot.'; }
    else if (approvals.length) { state = 'unconfirmed'; reason = 'Von der Leash freigegeben, aber noch keine Buchungsbestätigung. Der Betrag bleibt gebunden.'; }
    else if (bookings.length) { state = 'booked'; reason = 'Buchungsbestätigung liegt vor.'; }
    else if (declines.length) {
      state = 'declined';
      const a = declines.at(-1);
      reason = a.resolution?.text ?? a.decision?.summary ?? 'Das Angebot wurde abgelehnt.';
    } else if (block?.category === kind) { state = 'not_found'; reason = block.message ?? 'Kein passendes Angebot gefunden.'; }
    else if (block && !attempts.length) { state = 'skipped'; reason = `Nicht weitergesucht, weil ${LABEL[block.category] ?? 'die Voraussetzung'} nicht gebucht werden konnte.`; }
    else { state = 'not_booked'; reason = last?.resolution?.text ?? (stopped ? 'Der Durchlauf wurde vor einer bestätigten Buchung angehalten.' : 'Für diese Kategorie liegt keine Buchungsbestätigung vor.'); }
    return { kind, label: LABEL[kind] ?? kind, state, reason, bookings, declines: declines.length,
      attention: unknowns[0] ?? waiting[0] ?? approvals[0] ?? null,
      lastAttempt: ['declined', 'not_booked'].includes(state) ? (declines.at(-1) ?? last ?? null) : null };
  });
  const complete = rows.length > 0 && rows.every(r => r.state === 'booked');
  let title = complete ? 'Alles gebucht' : booked.length ? 'Teilweise gebucht' : 'Nichts gebucht';
  let tone = complete ? 'success' : 'warning';
  if (uncertain.length) title = 'Buchungsausgang unklar';
  else if (settling) title = 'Agent stoppt – Zwischenstand';
  else if (pending.length) title = 'Freigabe noch offen';
  else if (unconfirmed.length) title = 'Buchung noch nicht bestätigt';
  else if (!booked.length && rejected.length) { title = 'Keine Buchung – Angebote abgelehnt'; tone = 'declined'; }
  else if (stopped && !block && !complete) title = booked.length ? 'Gestoppt – teilweise gebucht' : 'Durchlauf gestoppt';
  const next = uncertain.length || unconfirmed.length
    ? 'Zuerst den Buchungsstatus beim Anbieter prüfen. Nicht erneut buchen, solange der Ausgang unklar ist.'
    : pending.length ? 'Beantworte die offene Freigabe. Erst danach kann es weitergehen.'
      : complete ? 'Die Bestätigungen stehen hier und in deiner Reisekasse.'
        : block ? 'Passe deine Werte oder Wünsche an und bestätige die neuen Regeln.'
          : stopped ? 'Prüfe den Stoppgrund. Bestehende Buchungen bleiben erhalten.'
            : 'Prüfe die offenen Kategorien und passe bei Bedarf deine Werte an.';
  return { key: `${id}:${runId ?? 'saved'}`, title, tone, complete, settling, rows,
    explanation: block?.message ?? (stopped ? lastStop?.text : null), next,
    canAdjust: !!block && !uncertain.length && !unconfirmed.length && !pending.length && !settling && mandate.status === 'active',
    bookedCount: booked.length, rejectedCount: rejected.length, bookedAmount: total(booked),
    boundAmount: total([...unconfirmed, ...pending]),
    freeAmount: summary?.mandate_id === id ? summary.free_after_pending : null,
    pending, booked, uncertain, unconfirmed };
}

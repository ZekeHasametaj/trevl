// The travel agent. It searches and proposes, but it cannot pay or change rules:
// every purchase goes to the leash engine over HTTP with the agent's own key.
// It is deliberately a "normal" agent: it likes cheap offers and learns only from the leash's answers.
import { hotelOffers, transferOffers, activityOffers } from './market.js';
import { uid } from '../leash/util.js';
import { evaluate } from '../leash/evaluate.js';
import { isDeepStrictEqual } from 'node:util';
import { runAiAgent, categoryDependency } from './ai-agent.js';

const sleep = (ms) => new Promise(r => setTimeout(r, ms));
const ORDER = ['flight', 'hotel', 'transfer', 'activity'];

export function createLeashClient({ baseUrl, key, onCall }) {
  return async function call(method, path, body) {
    const t0 = Date.now();
    let status = 0, json = null;
    try {
      const res = await fetch(`${baseUrl}${path}`, { method, headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' }, body: body === undefined ? undefined : JSON.stringify(body), signal: AbortSignal.timeout(8000) });
      status = res.status;
      json = await res.json().catch(() => null);
    } catch (e) {
      json = { error: { message: `Leine nicht erreichbar: ${e.message}` } };
    }
    onCall?.({ method, path, status, request: body ?? null, response: json, ms: Date.now() - t0, at: new Date().toISOString() });
    if (status < 200 || status >= 300) { const err = new Error(json?.error?.message ?? `HTTP ${status}`); err.status = status; err.body = json; throw err; }
    return json;
  };
}

export function createAgent({ leash, duffel, liteapi = null, emit, pace = () => 1 }) {
  let run = null; // { id, mandate, stopped, waiting: Map }

  const say = (kind, text, extra = {}) => emit({ type: 'agent.say', kind, text, ...extra });
  const wait = (ms) => sleep(ms * pace());

  function toAuthorization(mandate, offer, extra = {}) {
    const trip = mandate.trip ?? {};
    const common = {
      authorization_id: uid('AZ'), mandate_id: mandate.mandate_id, request_id: uid('RQ'), timestamp: new Date().toISOString(),
      initiator_type: 'agent', channel: 'ecommerce', ...extra,
    };
    if (offer.kind === 'flight') {
      const f = offer.flight;
      const title = `${f.origin.iata} ⇄ ${f.destination.iata} · ${f.airline.name}`;
      return {
        ...common,
        merchant: { merchant_id: f.airline.iata === 'ZZ' ? 'ME-DUFFEL' : `ME-AIR-${f.airline.iata}`, merchant_name: f.airline.name, domain: f.airline.iata === 'ZZ' ? 'duffel.com' : null, merchant_category: 'airline', merchant_mcc: '4511', merchant_country: 'GB', iata_code: f.airline.iata },
        amount: f.amount, currency: f.total_currency, order_cancellable: f.refundable, order_returnable: 'not_applicable',
        purchase_description: `Flug ${f.origin.iata}–${f.destination.iata} retour`,
        items: [{ line_no: 1, item_id: f.id, item_name: `Flug ${f.origin.iata}–${f.destination.iata} retour, ${f.travelers} ${f.travelers === 1 ? 'Person' : 'Personen'}${f.checked_bags ? ', mit Gepäck' : ', ohne Aufgabegepäck'}`, item_category: 'flight_fare', quantity: 1, unit_price: f.amount, currency: f.total_currency, item_details: `${f.flight_numbers.join(' / ')} · ${f.cabin ?? ''}` }],
        travel: { kind: 'flight', title, origin_city: f.origin.city ?? trip.origin?.en, destination_city: f.destination.city ?? trip.destination?.en, destination_iata: f.destination.iata ?? null,
          start_date: f.depart_at?.slice(0, 10), end_date: (f.return_at ?? f.depart_at)?.slice(0, 10), travelers: f.travelers, stops: f.stops,
          cabin_class: f.cabin, checked_bags: f.checked_bags, provider: f.demo ? 'demo' : 'duffel', offer_id: f.id },
      };
    }
    return {
      ...common,
      merchant: offer.merchant, amount: offer.amount, currency: offer.currency, order_cancellable: offer.cancellable, order_returnable: 'not_applicable',
      purchase_description: offer.title,
      items: offer.items.map((it, i) => ({ line_no: i + 1, item_id: `${offer.id}_${i + 1}`, ...it })),
      travel: { kind: offer.kind, title: offer.title, origin_city: offer.origin_city ?? offer.city, destination_city: offer.city, destination_iata: offer.iata ?? null, start_date: offer.start_date, end_date: offer.end_date,
        travelers: offer.travelers, stars: offer.stars ?? null, nights: offer.nights ?? null, provider: offer.provider ?? 'market', offer_id: offer.id },
    };
  }

  function ensureCategory(r, kind) {
    if (stopped(r)) throw new Error('Der Agent wurde gestoppt.');
    const dependency = categoryDependency(r, kind);
    if (dependency) throw new Error(`Zuerst muss ${dependency === 'flight' ? 'der Flug' : 'das Hotel'} gebucht werden.`);
    if (!(r.mandate.trip.kinds ?? ORDER).includes(kind)) throw new Error('Diese Kategorie gehört nicht zum Auftrag.');
  }

  function noMatchingOffer(r, kind) {
    if (stopped(r) || !['flight', 'hotel'].includes(kind)) return;
    const category = kind === 'flight' ? 'Flug' : 'Hotel';
    r.blocked = { category: kind, reason: 'no_matching_offer', message: `Kein passendes Angebot für ${kind === 'flight' ? 'den Flug' : 'das Hotel'} gefunden. Bitte passe deine Werte an.` };
    r.stopped = true;
    emit({ type: 'agent.blocked', run_id: r.id, mandate_id: r.mandate.mandate_id, ...r.blocked });
    say('stop', `${category} nicht gefunden. Der weitere Reiseprozess wurde angehalten.`, { category: kind });
  }

  async function search(r, kind) {
    ensureCategory(r, kind);
    const mandate = r.mandate;
    const trip = mandate.trip;
    if (kind === 'flight') {
      const via = trip.destination.airport ? ` – nächster Flughafen für ${trip.destination.name}, danach Transfer` : '';
      say('search', `Suche Flüge ${trip.origin.iata} → ${trip.destination.iata}${via}, ${trip.travelers} ${trip.travelers === 1 ? 'Person' : 'Personen'} (${duffel.label}) …`);
      const flights = await duffel.searchRoundTrip({ origin: trip.origin.iata, destination: trip.destination.iata, departDate: trip.start_date, returnDate: trip.end_date, adults: trip.travelers, cabin: trip.cabin ?? 'economy', direct: false });
      ensureCategory(r, kind);
      return flights.map(f => ({ kind: 'flight', id: f.id, title: `${f.airline.name} ${f.flight_numbers[0]}`, amount: f.amount, currency: f.total_currency, flight: f }));
    }
    const label = { hotel: 'Hotels', transfer: 'Transfers', activity: 'Aktivitäten' }[kind];
    if (kind === 'hotel' && liteapi?.on) {
      // Real sandbox hotels from LiteAPI; the market still supplies the tricky offers (fake site, no refund, unclear terms).
      say('search', `Suche Hotels in ${trip.destination.name} (LiteAPI Sandbox + Testmarkt) …`);
      const tricky = hotelOffers(trip).filter(h => ['fake', 'noncancel', 'unclear'].includes(h.key));
      const real = await liteapi.searchHotels(trip);
      ensureCategory(r, kind);
      return (real.length ? [...tricky, ...real] : []).sort((a, b) => a.amount - b.amount);
    }
    say('search', `Suche ${label} in ${trip.destination.name} …`);
    const list = kind === 'hotel' ? hotelOffers(trip) : kind === 'transfer' ? transferOffers(trip) : activityOffers(trip);
    return list.sort((a, b) => a.amount - b.amount);
  }

  const contract = (a) => ({ amount: a.amount, currency: a.currency, order_cancellable: a.order_cancellable,
    order_returnable: a.order_returnable, merchant: a.merchant, items: a.items, travel: a.travel, purchase_description: a.purchase_description });
  const stopped = (r) => r.stopped || run !== r;
  function blockExecution(r, text) {
    r.stopped = true;
    say('stop', `Buchung angehalten: ${text}`);
    return false;
  }

  async function executionAllowed(r, offer, auth) {
    if (stopped(r)) return false;
    const current = await leash('GET', `/v1/authorizations/${auth.authorization_id}`);
    if (stopped(r)) return false;
    if (current.status !== 'approved' || current.booking) return blockExecution(r, 'Diese Freigabe ist nicht offen oder bereits als gebucht gespeichert.');
    if (current.authorization?.mandate_id !== r.mandate.mandate_id || !isDeepStrictEqual(contract(current.authorization), contract(toAuthorization(r.mandate, offer)))) {
      return blockExecution(r, 'Die aktuelle Freigabe gehört zu anderen Kaufdaten. Bitte erneut prüfen.');
    }
    const summary = await leash('GET', `/v1/mandates/${r.mandate.mandate_id}/summary`);
    if (stopped(r)) return false;
    const mandate = await leash('GET', `/v1/mandates/${r.mandate.mandate_id}`);
    if (stopped(r)) return false;
    if (mandate.status !== 'active' || summary.status !== 'active' || summary.version !== mandate.version) return blockExecution(r, 'Die Leine wurde pausiert, widerrufen oder während der Prüfung verändert.');
    if (mandate.valid_until && (!Number.isFinite(Date.parse(mandate.valid_until)) || Date.parse(mandate.valid_until) <= Date.now())) return blockExecution(r, 'Die Leine ist abgelaufen oder ihre Gültigkeit ist unklar.');
    const ownAmount = current.decision?.facts?.amount_chf;
    if (![summary.approved, summary.pending, ownAmount].every((value) => Number.isFinite(value) && value >= 0) || summary.approved + 1e-9 < ownAmount) return blockExecution(r, 'Die aktuelle Budgetbindung konnte nicht nachgewiesen werden.');
    // The agent GET API exposes aggregate spend, not the full ledger. Counting all
    // outstanding spend in every period is conservative; it cannot invent free budget.
    const ledger = [
      { authorization_id: 'execution-other-approved', status: 'approved', amount_chf: Math.max(0, summary.approved - ownAmount) },
      { authorization_id: 'execution-other-pending', status: 'pending', amount_chf: summary.pending },
    ].map((entry) => ({ ...entry, mandate_id: mandate.mandate_id, timestamp: current.authorization.timestamp }));
    const familiar = current.decision?.merchant_trust === 'known' ? new Set([current.authorization.merchant?.merchant_id]) : new Set();
    const checked = evaluate({ auth: current.authorization, mandate, ledger, familiar });
    const unclearBudget = checked.checks.some((check) => check.status === 'unknown' && mandate.hard_rules.some((rule) => rule.id === check.rule_id && rule.field === 'authorization.billing_amount_chf' && rule.scope === 'period'));
    if (checked.checks.some((check) => check.status === 'fail') || checked.signals.some((signal) => signal.severity === 'block') || unclearBudget) return blockExecution(r, checked.summary);
    if (current.decision?.mandate_version !== mandate.version) return blockExecution(r, 'Die Regeln wurden seit der Freigabe geändert. Eine neue Prüfung ist erforderlich.');
    return !stopped(r);
  }

  async function execute(r, offer, auth) {
    if (stopped(r)) return { blocked: true };
    ensureCategory(r, offer.kind);
    let submitted = false;
    try {
      let candidate = offer, book, label;
      let termsChanged = false;
      if (offer.kind === 'flight') {
        say('book', `Prüfe das Flugangebot vor der Buchung erneut …`);
        const fresh = await duffel.refresh(offer.flight);
        if (stopped(r)) return { blocked: true };
        candidate = { ...offer, amount: fresh.amount, currency: fresh.total_currency, flight: fresh };
        termsChanged = !isDeepStrictEqual(contract(toAuthorization(r.mandate, offer)), contract(toAuthorization(r.mandate, candidate)));
        book = () => duffel.book(fresh, auth.authorization_id);
        label = fresh.demo ? 'Demo-Anbieter' : 'Duffel-Test';
      } else if (offer.provider === 'liteapi') {
        say('book', `Prüfe den Preis für ${offer.title} bei LiteAPI (Sandbox) erneut …`);
        const pre = await liteapi.prebook(offer);
        if (stopped(r)) return { blocked: true };
        termsChanged = pre.amount !== offer.amount || pre.currency !== offer.currency || pre.cancellable !== offer.cancellable || pre.cancellationChanged === true;
        if (termsChanged) candidate = { ...offer, amount: pre.amount, currency: pre.currency, cancellable: pre.cancellable, items: offer.items.map((item, i) => i === 0 ? { ...item, unit_price: pre.amount, currency: pre.currency } : item) };
        book = () => liteapi.book(pre.prebookId, offer.travelers, auth.authorization_id);
        label = 'LiteAPI Sandbox';
      } else {
        book = async () => ({ provider: 'demo', booking_reference: `TRV-${Math.random().toString(36).slice(2, 7).toUpperCase()}`, demo: true });
        label = 'Demo-Anbieter';
      }
      if (termsChanged) {
        say('warn', `Preis, Währung oder Bedingungen haben sich geändert. Ich frage die Leine neu.`);
        // No booking has been submitted: this old quote can safely release its budget.
        await leash('POST', `/v1/authorizations/${auth.authorization_id}/void`, { reason: 'Preis oder Bedingungen vor Buchung geändert; noch keine Buchung übermittelt.' });
        return { requote: candidate, related: auth.authorization_id };
      }
      if (!await executionAllowed(r, candidate, auth) || stopped(r)) return { blocked: true };
      submitted = true;
      const b = await book();
      await leash('POST', `/v1/authorizations/${auth.authorization_id}/booked`, b);
      say('booked', `Gebucht: ${offer.title} · Bestätigung ${b.booking_reference} (${label})`, { authorization_id: auth.authorization_id, booking: b });
      r.booked?.add(offer.kind);
      return { booked: true, booking: b };
    } catch (e) {
      r.stopped = true;
      if (submitted) {
        r.uncertain ??= new Set(); r.uncertain.add(auth.authorization_id);
        say('warn', `Buchungsausgang oder Speicherung unbekannt: ${e.message}. Budget bleibt gebunden. Keine automatische Wiederholung; Anbieterstatus manuell abgleichen.`, { authorization_id: auth.authorization_id, booking_unknown: true });
        return { unknown: true };
      }
      say('warn', `Vor der Buchung gestoppt: ${e.message}. Keine Buchung übermittelt; die bisherige Budgetbindung bleibt bis zur Klärung bestehen.`, { authorization_id: auth.authorization_id });
      return { blocked: true };
    }
  }

  // Propose one offer; returns 'approved' | 'declined' | 'pending' plus the decision.
  async function propose(r, offer, extra) {
    ensureCategory(r, offer.kind);
    const auth = toAuthorization(r.mandate, offer, extra);
    say('propose', `Schlage vor: ${offer.title} · ${offer.currency} ${offer.amount.toFixed(2)}`, { authorization_id: auth.authorization_id, category: offer.kind });
    await wait(500);
    ensureCategory(r, offer.kind);
    const d = await leash('POST', '/v1/authorizations', auth);
    return { auth, d };
  }

  // Follow a quote all the way to a booking, decline or explicit customer wait.
  // A changed quote never counts as a completed category on its own.
  async function handleDecision(r, offer, auth, d, rest = []) {
    let requotes = 0;
    while (!stopped(r)) {
      if (d.decision === 'approve') {
        const result = await execute(r, offer, auth);
        if (result.booked) return 'booked';
        if (!result.requote || stopped(r)) return 'stopped';
        if (++requotes > 3) { blockExecution(r, 'Das Angebot ändert sich wiederholt. Bitte prüfe den Anbieter.'); return 'stopped'; }
        offer = result.requote;
        ({ auth, d } = await propose(r, offer, { related_authorization_id: result.related }));
        continue;
      }
      if (d.decision === 'step_up') {
        say('wait', 'Die Leine will deine Zustimmung. Die weitere Reiseplanung wartet auf deine Antwort.', { authorization_id: auth.authorization_id, category: offer.kind });
        r.waiting.set(auth.authorization_id, { offer, kind: offer.kind, auth, rest });
        return 'pending';
      }
      if (d.decision !== 'decline') throw new Error('Die Leine hat keine gültige Entscheidung geliefert.');
      if (d.reason_codes?.some(code => ['mandate_revoked', 'mandate_paused'].includes(code))) {
        blockExecution(r, 'Die Leine ist gestoppt. Ich höre auf.');
        return 'stopped';
      }
      (r.rejectedOffers ??= new Set()).add(offer.id);
      say('think', d.agent_hint ? `Abgelehnt. Hinweis der Leine: ${d.agent_hint}` : 'Abgelehnt. Ich suche weiter.');
      return 'declined';
    }
    return 'stopped';
  }

  async function tryOffers(r, kind, offers) {
    for (let i = 0; i < offers.length && !stopped(r); i++) {
      let offer = offers[i];
      if (r.rejectedOffers?.has(offer.id)) continue;
      let { auth, d } = await propose(r, offer);
      await wait(700);
      if (d.decision === 'decline' && d.reason_codes?.includes('addon_not_allowed') && offer.removable?.length && !stopped(r)) {
        const items = offer.items.filter(it => !offer.removable.includes(it.item_category));
        offer = { ...offer, items, amount: items.reduce((sum, item) => sum + item.unit_price * (item.quantity ?? 1), 0) };
        say('think', 'Die Leine sagt: keine Extras. Ich entferne den Reiseschutz und frage neu.');
        ({ auth, d } = await propose(r, offer));
      }
      const outcome = await handleDecision(r, offer, auth, d, offers.slice(i + 1));
      if (outcome !== 'declined') return;
      await wait(600);
    }
    if (!stopped(r)) {
      if (['flight', 'hotel'].includes(kind)) noMatchingOffer(r, kind);
      else say('warn', `Kein passendes Angebot für ${kind === 'transfer' ? 'den Transfer' : 'die Aktivität'} gefunden.`);
    }
  }

  async function handleCategory(r, kind) {
    const offers = await search(r, kind);
    if (stopped(r)) return;
    await wait(900);
    if (stopped(r)) return;
    say('found', `${offers.length} Angebote gefunden. Ich nehme das günstigste, das passt.`, { category: kind });
    await tryOffers(r, kind, offers);
  }

  async function readAnswer(r, id, waiting) {
    let answer = await leash('GET', `/v1/authorizations/${id}`);
    let w = waiting;
    // A replaced authorization is still the same dependency, not a rejection.
    if (answer.status === 'superseded' && answer.resolution?.superseded_by) {
      const nextId = answer.resolution.superseded_by;
      answer = await leash('GET', `/v1/authorizations/${nextId}`);
      r.waiting.delete(id);
      id = nextId;
      w = { ...w, auth: answer.authorization, offer: { ...w.offer, amount: answer.authorization.amount, currency: answer.authorization.currency, items: answer.authorization.items } };
      r.waiting.set(id, w);
    }
    return { answer, id, w };
  }

  // Finish the required category before searching a dependent one.
  async function settleWaiting(r, { alternatives = true } = {}) {
    const lines = [];
    while (r.waiting.size && !stopped(r)) {
      await wait(1000);
      for (const [waitingId, waiting] of [...r.waiting]) {
        if (stopped(r)) break;
        const { answer, id, w } = await readAnswer(r, waitingId, waiting);
        if (stopped(r)) break;
        if (answer.status === 'pending') continue;
        r.waiting.delete(id);
        if (answer.status === 'approved') {
          say('think', `Du hast «${w.offer.title}» freigegeben.`);
          const outcome = await handleDecision(r, w.offer, w.auth, { decision: 'approve' }, w.rest);
          lines.push(`${w.offer.title}: ${outcome}.`);
          if (outcome !== 'declined') continue;
        } else if (!['declined', 'expired', 'voided'].includes(answer.status)) {
          throw new Error(`Die Freigabe hat einen ungeklärten Status: ${answer.status}.`);
        } else {
          (r.rejectedOffers ??= new Set()).add(w.offer.id);
          say('think', `«${w.offer.title}» ist abgelehnt (${answer.resolution?.text ?? answer.status}). Ich suche eine Alternative.`);
          lines.push(`Customer DECLINED ${w.offer.title} (${w.kind}): ${answer.resolution?.text ?? answer.status}. Choose another ${w.kind}.`);
        }
        if (alternatives && !stopped(r)) await tryOffers(r, w.kind, w.rest);
      }
    }
    return `Answers from the customer: ${lines.join(' ') || 'none'}`;
  }

  const awaitAnswers = r => settleWaiting(r, { alternatives: false });

  async function runScript(r, kinds) {
    for (const kind of ORDER) {
      if (stopped(r)) break;
      if (!kinds.includes(kind) || r.booked.has(kind)) continue;
      if (![...r.waiting.values()].some(w => w.kind === kind)) await handleCategory(r, kind);
      if (r.waiting.size && !stopped(r)) await settleWaiting(r);
      if (!stopped(r) && ['flight', 'hotel'].includes(kind) && !r.booked.has(kind)) noMatchingOffer(r, kind);
      await wait(800);
    }
  }

  return {
    state() { return run ? { running: !run.done && !run.stopped, id: run.id, mandate_id: run.mandate.mandate_id, mode: run.mode, waiting: [...run.waiting.keys()], uncertain: [...(run.uncertain ?? [])], blocked: run.blocked ?? null, done: !!run.done, stopped: !!run.stopped } : { running: false }; },
    async start(mandateId, { mode = 'script' } = {}) {
      if (run && !run.done && !run.stopped) throw new Error('Der Agent läuft schon.');
      if (run?.mandate.mandate_id === mandateId && run.uncertain?.size) throw new Error('Ein Buchungsausgang ist ungeklärt. Bitte zuerst den Anbieterstatus prüfen.');
      const mandate = await leash('GET', `/v1/mandates/${mandateId}`);
      if (mandate.status !== 'active') throw new Error('Die Leine ist nicht aktiv.');
      if (!mandate.trip?.destination || !mandate.trip?.start_date) throw new Error('Ziel und Daten fehlen in der Leine.');
      const summary = await leash('GET', `/v1/mandates/${mandateId}/summary`);
      const r = run = { id: uid('RUN'), mandate, mode, stopped: false, done: false, waiting: new Map(), booked: new Set((summary.bookings ?? []).map(booking => booking.kind).filter(kind => ORDER.includes(kind))) };
      emit({ type: 'agent.started', run_id: r.id, mandate_id: mandateId, mode });
      say('start', `Hallo! Ich ${mode === 'ai' ? 'bin der KI-Agent und ' : ''}plane ${mandate.trip.destination.name} für ${mandate.trip.travelers} ${mandate.trip.travelers === 1 ? 'Person' : 'Personen'}. Bezahlen darf ich nur, was deine Leine erlaubt.`);
      (async () => {
        const kinds = mandate.trip.kinds ?? ORDER;
        try {
          if (mode === 'ai') {
            try {
              await runAiAgent(r, { search: (_mandate, kind) => search(r, kind), propose, execute, say, awaitAnswers, noMatchingOffer });
              // If the model stops early, the deterministic runner completes only missing categories.
              if (!stopped(r)) await runScript(r, kinds);
            } catch (e) {
              // Predictable fallback: the script agent books whatever is still missing.
              if (!stopped(r)) {
                say('warn', `KI-Agent nicht verfügbar (${e.message}). Der Skript-Agent übernimmt.`);
                await runScript(r, kinds);
              }
            }
            if (r.waiting.size) await settleWaiting(r);
          } else {
            await runScript(r, kinds);
          }
          if (!r.stopped) say('done', 'Fertig. Alles, was gebucht ist, findest du in der Reisekasse.');
        } catch (e) {
          if (!stopped(r)) {
            r.stopped = true;
            say('warn', `Agent wegen eines technischen Fehlers gestoppt: ${e.message}. Es wurde kein fehlendes Angebot festgestellt.`);
          }
        } finally {
          r.done = true;
          emit({ type: 'agent.finished', run_id: r.id, stopped: r.stopped, blocked: r.blocked ?? null });
        }
      })();
      return this.state();
    },
    stop(reason = 'Gestoppt.') { if (run && !run.done) { run.stopped = true; say('stop', reason); } return this.state(); },
    reset() { if (run) run.stopped = true; run = null; },
    toAuthorization,
    current: () => run,
  };
}

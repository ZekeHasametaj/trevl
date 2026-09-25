// The travel agent. It searches and proposes, but it cannot pay or change rules:
// every purchase goes to the leash engine over HTTP with the agent's own key.
// It is deliberately a "normal" agent: it likes cheap offers and learns only from the leash's answers.
import { hotelOffers, transferOffers, activityOffers } from './market.js';
import { uid } from '../leash/util.js';
import { evaluate } from '../leash/evaluate.js';
import { isDeepStrictEqual } from 'node:util';
import { runAiAgent } from './ai-agent.js';

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

  async function search(mandate, kind) {
    const trip = mandate.trip;
    if (kind === 'flight') {
      const via = trip.destination.airport ? ` – nächster Flughafen für ${trip.destination.name}, danach Transfer` : '';
      say('search', `Suche Flüge ${trip.origin.iata} → ${trip.destination.iata}${via}, ${trip.travelers} ${trip.travelers === 1 ? 'Person' : 'Personen'} (${duffel.label}) …`);
      try {
        const flights = await duffel.searchRoundTrip({ origin: trip.origin.iata, destination: trip.destination.iata, departDate: trip.start_date, returnDate: trip.end_date, adults: trip.travelers, cabin: trip.cabin ?? 'economy', direct: false });
        return flights.map(f => ({ kind: 'flight', id: f.id, title: `${f.airline.name} ${f.flight_numbers[0]}`, amount: f.amount, currency: f.total_currency, flight: f }));
      } catch (e) {
        say('warn', `Duffel antwortet nicht (${e.message}). Ich nehme Demo-Angebote.`);
        const { createDuffel } = await import('./duffel.js');
        const demo = createDuffel({ token: '' });
        const flights = await demo.searchRoundTrip({ origin: trip.origin.iata, destination: trip.destination.iata, departDate: trip.start_date, returnDate: trip.end_date, adults: trip.travelers, cabin: trip.cabin ?? 'economy' });
        return flights.map(f => ({ kind: 'flight', id: f.id, title: `${f.airline.name} ${f.flight_numbers[0]}`, amount: f.amount, currency: f.total_currency, flight: f }));
      }
    }
    const label = { hotel: 'Hotels', transfer: 'Transfers', activity: 'Aktivitäten' }[kind];
    if (kind === 'hotel' && liteapi?.on) {
      // Real sandbox hotels from LiteAPI; the market still supplies the tricky offers (fake site, no refund, unclear terms).
      say('search', `Suche Hotels in ${trip.destination.name} (LiteAPI Sandbox + Testmarkt) …`);
      const tricky = hotelOffers(trip).filter(h => ['fake', 'noncancel', 'unclear'].includes(h.key));
      try {
        const real = await liteapi.searchHotels(trip);
        if (!real.length) say('warn', 'LiteAPI hat keine freien Hotels geliefert. Ich nehme den Testmarkt.');
        return (real.length ? [...tricky, ...real] : hotelOffers(trip)).sort((a, b) => a.amount - b.amount);
      } catch (e) {
        say('warn', `LiteAPI antwortet nicht (${e.message}). Ich nehme den Testmarkt.`);
        return hotelOffers(trip).sort((a, b) => a.amount - b.amount);
      }
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
    const auth = toAuthorization(r.mandate, offer, extra);
    say('propose', `Schlage vor: ${offer.title} · ${offer.currency} ${offer.amount.toFixed(2)}`, { authorization_id: auth.authorization_id, category: offer.kind });
    await wait(500);
    const d = await leash('POST', '/v1/authorizations', auth);
    return { auth, d };
  }

  async function handleCategory(r, kind) {
    const offers = await search(r.mandate, kind);
    if (r.stopped) return;
    await wait(900);
    say('found', `${offers.length} Angebote gefunden. Ich nehme das günstigste, das passt.`, { category: kind });
    let tries = 0;
    const skip = new Set();
    for (let i = 0; i < offers.length && tries < 7; i++) {
      if (r.stopped) return;
      let offer = offers[i];
      if (skip.has(offer.key)) continue;
      tries++;
      let { auth, d } = await propose(r, offer);
      await wait(700);
      // Learn from the answer: remove extras and try the same offer again.
      if (d.decision === 'decline' && d.reason_codes.includes('addon_not_allowed') && offer.removable?.length && !r.stopped) {
        const clean = { ...offer, items: offer.items.filter(it => !offer.removable.includes(it.item_category)) };
        clean.amount = clean.items.reduce((s, it) => s + it.unit_price * (it.quantity ?? 1), 0);
        say('think', 'Die Leine sagt: keine Extras. Ich entferne den Reiseschutz und frage neu.');
        await wait(800);
        ({ auth, d } = await propose(r, clean));
        offer = clean;
        await wait(700);
      }
      if (d.decision === 'approve') {
        const res = await execute(r, offer, auth);
        if (res.requote && !r.stopped) {
          const again = await propose(r, res.requote, { related_authorization_id: res.related });
          if (again.d.decision === 'approve') await execute(r, res.requote, again.auth);
          else if (again.d.decision === 'step_up') r.waiting.set(again.auth.authorization_id, { offer: res.requote, kind, auth: again.auth, rest: offers.slice(i + 1) });
        }
        if (res.booked || res.requote) return;
        continue;
      }
      if (d.decision === 'step_up') {
        say('wait', 'Die Leine will deine Zustimmung. Ich mache inzwischen weiter.', { authorization_id: auth.authorization_id });
        r.waiting.set(auth.authorization_id, { offer, kind, auth, rest: offers.slice(i + 1) });
        return;
      }
      if (d.reason_codes.includes('mandate_revoked') || d.reason_codes.includes('mandate_paused')) { r.stopped = true; say('stop', 'Die Leine ist gestoppt. Ich höre auf.'); return; }
      say('think', d.agent_hint ? `Abgelehnt. Hinweis der Leine: ${d.agent_hint}` : 'Abgelehnt. Ich suche weiter.');
      await wait(600);
    }
    if (!r.stopped) say('warn', `Kein passendes Angebot für ${{ flight: 'den Flug', hotel: 'das Hotel', transfer: 'den Transfer', activity: 'die Aktivität' }[kind]} gefunden.`);
  }

  // Wait for the customer's answers on step_up items, then book or continue searching.
  async function settleWaiting(r) {
    while (r.waiting.size && !r.stopped) {
      await sleep(1000);
      for (const [id, w] of [...r.waiting]) {
        let a;
        try { a = await leash('GET', `/v1/authorizations/${id}`); } catch { continue; }
        if (a.status === 'pending') continue;
        r.waiting.delete(id);
        if (a.status === 'superseded' && a.resolution?.superseded_by) {
          const next = await leash('GET', `/v1/authorizations/${a.resolution.superseded_by}`).catch(() => null);
          if (next) {
            say('think', `Neues Angebot für «${w.offer.title}»: ${next.authorization.currency} ${next.authorization.amount.toFixed(2)}. Ich warte auf dich.`);
            if (next.status === 'pending') { r.waiting.set(next.authorization_id, { ...w, auth: next.authorization, offer: { ...w.offer, amount: next.authorization.amount, items: next.authorization.items } }); continue; }
            if (next.status === 'approved') { await execute(r, { ...w.offer, amount: next.authorization.amount }, next.authorization); continue; }
          }
        }
        if (a.status === 'approved') { say('think', `Du hast «${w.offer.title}» freigegeben.`); await execute(r, w.offer, w.auth); }
        else {
          say('think', `«${w.offer.title}» ist abgelehnt (${a.resolution?.text ?? a.status}). Ich suche eine Alternative.`);
          if (r.stopped) break;
          for (let i = 0; i < w.rest.length; i++) {
            if (r.stopped) break;
            const { auth, d } = await propose(r, w.rest[i]);
            await wait(700);
            if (d.decision === 'approve') { await execute(r, w.rest[i], auth); break; }
            if (d.decision === 'step_up') { r.waiting.set(auth.authorization_id, { offer: w.rest[i], kind: w.kind, auth, rest: w.rest.slice(i + 1) }); break; }
            if (d.reason_codes.includes('mandate_revoked') || d.reason_codes.includes('mandate_paused')) { r.stopped = true; break; }
            say('think', d.agent_hint ? `Abgelehnt. Hinweis der Leine: ${d.agent_hint}` : 'Abgelehnt. Ich suche weiter.');
          }
        }
      }
    }
  }

  // AI mode: wait for the customer's answers, book what was approved and tell the model the outcome.
  async function awaitAnswers(r) {
    const lines = [];
    while (r.waiting.size && !r.stopped) {
      await sleep(1000);
      for (const [id, w] of [...r.waiting]) {
        let a;
        try { a = await leash('GET', `/v1/authorizations/${id}`); } catch { continue; }
        if (a.status === 'pending') continue;
        r.waiting.delete(id);
        if (a.status === 'superseded' && a.resolution?.superseded_by) {
          const next = await leash('GET', `/v1/authorizations/${a.resolution.superseded_by}`).catch(() => null);
          if (next?.status === 'pending') {
            r.waiting.set(next.authorization_id, { ...w, auth: next.authorization, offer: { ...w.offer, amount: next.authorization.amount, items: next.authorization.items } });
            lines.push(`${w.offer.title}: the shop changed the price, the customer is asked again.`);
            continue;
          }
        }
        if (a.status === 'approved') {
          const res = await execute(r, w.offer, w.auth);
          lines.push(res.booked ? `Customer APPROVED ${w.offer.title} (${w.kind}); it is booked.` : `Customer approved ${w.offer.title}, but the booking failed. Choose another ${w.kind}.`);
        } else {
          lines.push(`Customer DECLINED ${w.offer.title} (${w.kind}): ${a.resolution?.text ?? a.status}. Choose another ${w.kind} if still needed.`);
        }
      }
    }
    return `Answers from the customer: ${lines.join(' ') || 'none'}`;
  }

  async function runScript(r, kinds) {
    for (const kind of ORDER) {
      if (r.stopped) break;
      if (!kinds.includes(kind) || r.booked.has(kind) || [...r.waiting.values()].some(w => w.kind === kind)) continue;
      await handleCategory(r, kind);
      await wait(800);
    }
    await settleWaiting(r);
  }

  return {
    state() { return run ? { running: !run.done && !run.stopped, id: run.id, mandate_id: run.mandate.mandate_id, mode: run.mode, waiting: [...run.waiting.keys()], uncertain: [...(run.uncertain ?? [])], done: !!run.done, stopped: !!run.stopped } : { running: false }; },
    async start(mandateId, { mode = 'script' } = {}) {
      if (run && !run.done && !run.stopped) throw new Error('Der Agent läuft schon.');
      const mandate = await leash('GET', `/v1/mandates/${mandateId}`);
      if (mandate.status !== 'active') throw new Error('Die Leine ist nicht aktiv.');
      if (!mandate.trip?.destination || !mandate.trip?.start_date) throw new Error('Ziel und Daten fehlen in der Leine.');
      const r = run = { id: uid('RUN'), mandate, mode, stopped: false, done: false, waiting: new Map(), booked: new Set() };
      emit({ type: 'agent.started', run_id: r.id, mandate_id: mandateId, mode });
      say('start', `Hallo! Ich ${mode === 'ai' ? 'bin der KI-Agent und ' : ''}plane ${mandate.trip.destination.name} für ${mandate.trip.travelers} ${mandate.trip.travelers === 1 ? 'Person' : 'Personen'}. Bezahlen darf ich nur, was deine Leine erlaubt.`);
      (async () => {
        const kinds = mandate.trip.kinds ?? ORDER;
        try {
          if (mode === 'ai') {
            try {
              await runAiAgent(r, { search, propose, execute, say, awaitAnswers });
            } catch (e) {
              // Predictable fallback: the script agent books whatever is still missing.
              say('warn', `KI-Agent nicht verfügbar (${e.message}). Der Skript-Agent übernimmt.`);
              await runScript(r, kinds);
            }
            if (r.waiting.size) await settleWaiting(r);
          } else {
            await runScript(r, kinds);
          }
          if (!r.stopped && mode !== 'ai') say('done', 'Fertig. Alles, was gebucht ist, findest du in der Reisekasse.');
        } catch (e) {
          say('warn', `Agent gestoppt: ${e.message}`);
        } finally {
          r.done = true;
          emit({ type: 'agent.finished', run_id: r.id, stopped: r.stopped });
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

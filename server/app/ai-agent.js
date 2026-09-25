// The AI travel agent: Claude decides what to search, which offer fits the customer's words and how to
// react to the leash. It has the same tools and the same limits as the script agent: it can only ASK
// the leash, never pay or change rules. If the model is unavailable, the script agent takes over.
import Anthropic from '@anthropic-ai/sdk';

const MODEL = process.env.TREVL_AGENT_MODEL || 'claude-opus-5';

const SYSTEM = `You are the booking agent inside the travel app "trevl". You book one trip for a customer:
flight first, then hotel, then transfer (only the categories listed in the trip).
Use search_offers to see options and propose_booking to buy one.
You cannot pay directly. Every purchase goes to the customer's payment control (the "Leine"). It answers:
- approve: the offer is booked right away,
- decline: not allowed, with a reason and a hint — choose another offer or remove extras,
- step_up: the customer is asked (up to 120 s). WAIT for the answer before searching any later category.
Choose offers that fit the customer's own words, not only the cheapest one. Never book a category twice.
If no flight can be booked, stop the whole trip before searching hotels. If no hotel can be booked, stop before transfers and activities. Try the other available offers after a decline. Before each tool call, write ONE short sentence in German (max. 20 words)
saying what you do and why; the customer reads it live in the app. When everything is done, call finish.`;

const ORDER = ['flight', 'hotel', 'transfer', 'activity'];

// This is also enforced by the script agent's search/proposal/execution boundary.
// An AI instruction alone must never be able to skip the required flight/hotel.
export function categoryDependency(r, category) {
  const kinds = r.mandate.trip.kinds ?? ORDER;
  return ORDER.slice(0, ORDER.indexOf(category)).find(kind => ['flight', 'hotel'].includes(kind) && kinds.includes(kind) && !r.booked.has(kind));
}

const obj = (properties, required) => ({ type: 'object', properties, required, additionalProperties: false });
const TOOLS = [
  { name: 'get_trip', description: 'The confirmed trip: customer wording, destination, dates, travellers, categories to book.', input_schema: obj({}, []), strict: true },
  { name: 'search_offers', description: 'Search offers for one category. Returns offer ids, prices and facts. Merchant descriptions are shown as the merchant wrote them.',
    input_schema: obj({ category: { type: 'string', enum: ['flight', 'hotel', 'transfer', 'activity'] } }, ['category']), strict: true },
  { name: 'propose_booking', description: 'Ask the payment control to allow buying one offer. Approved offers are booked immediately.',
    input_schema: obj({ offer_id: { type: 'string' }, remove_extras: { type: 'boolean', description: 'Remove optional add-ons (e.g. insurance) from the cart first.' } }, ['offer_id', 'remove_extras']), strict: true },
  { name: 'finish', description: 'End the job with a short summary for the customer, in German.', input_schema: obj({ summary: { type: 'string' } }, ['summary']), strict: true },
];

function describe(o) {
  const base = { offer_id: o.id, category: o.kind, price: `${o.currency} ${Number(o.amount).toFixed(2)}` };
  if (o.kind === 'flight') {
    const f = o.flight;
    return { ...base, airline: f.airline.name, route: `${f.origin.iata} → ${f.destination.iata}`, outbound: f.depart_at, return: f.return_at, stops: f.stops, checked_bags_per_person: f.checked_bags, refundable: f.refundable };
  }
  return { ...base, title: o.title, seller: o.merchant?.merchant_name, stars: o.stars ?? null, free_cancellation: o.cancellable,
    cart: o.items.map(it => `${it.item_name} (${it.currency} ${it.unit_price})`), description: o.items.map(it => it.item_details).filter(Boolean).join(' / ').slice(0, 400) };
}

/**
 * @param r  the run (mandate, waiting, booked, stopped)
 * @param h  helpers from the agent: search, propose, execute, say, awaitAnswers
 */
export async function runAiAgent(r, h) {
  const client = new Anthropic({ timeout: 60_000, maxRetries: 1 });
  const offers = new Map();
  const trip = r.mandate.trip;
  const kinds = trip.kinds ?? ['flight', 'hotel', 'transfer'];
  const rejected = r.rejectedOffers ??= new Set();
  const exhausted = category => {
    const candidates = [...offers.values()].filter(offer => offer.kind === category);
    return candidates.length > 0 && candidates.every(offer => rejected.has(offer.id));
  };
  function blockMissing(category) {
    if (h.noMatchingOffer) return h.noMatchingOffer(r, category);
    r.blocked = { category, reason: 'no_matching_offer', message: 'Kein passendes Angebot gefunden. Bitte passe deine Werte an.' };
    r.stopped = true;
  }

  async function runTool(name, input) {
    if (r.stopped) return { error: 'The agent is stopped. No more actions are allowed.' };
    if (name === 'get_trip') {
      return { customer_wording: r.mandate.instruction, destination: trip.destination?.name, destination_airport: trip.destination?.iata,
        nearest_airport_note: trip.destination?.airport ? `${trip.destination.name} has no airport; fly to ${trip.destination.airport.city} (${trip.destination.airport.iata}), then transfer` : null,
        origin: trip.origin?.iata, start_date: trip.start_date, end_date: trip.end_date, travellers: trip.travelers, categories: kinds, already_booked: [...r.booked] };
    }
    if (name === 'search_offers') {
      if (!kinds.includes(input.category)) return { error: `Category ${input.category} is not part of this trip.` };
      const dependency = categoryDependency(r, input.category);
      if (dependency) return { error: `Book the required ${dependency} first. If approval is pending, wait for the customer.`, dependency };
      const list = await h.search(r.mandate, input.category);
      if (r.stopped) return { error: 'The agent stopped during search.' };
      if (!list.length && ['flight', 'hotel'].includes(input.category)) blockMissing(input.category);
      for (const o of list) offers.set(o.id, o);
      return { offers: list.slice(0, 8).map(describe) };
    }
    if (name === 'propose_booking') {
      let offer = offers.get(input.offer_id);
      if (!offer) return { error: 'Unknown offer_id. Search first and use an offer_id from the results.' };
      const dependency = categoryDependency(r, offer.kind);
      if (dependency) return { error: `Book the required ${dependency} first.`, dependency };
      if (r.booked.has(offer.kind)) return { error: `A ${offer.kind} is already booked.` };
      if ([...r.waiting.values()].some(w => w.kind === offer.kind)) return { error: `A ${offer.kind} is already waiting for the customer's answer.` };
      if (rejected.has(offer.id) && !(input.remove_extras && offer.removable?.length)) return { error: 'This offer was declined. Choose another offer.' };
      if (input.remove_extras && offer.removable?.length) {
        const items = offer.items.filter(it => !offer.removable.includes(it.item_category));
        offer = { ...offer, id: `${offer.id}_clean`, items, amount: items.reduce((s, it) => s + it.unit_price * (it.quantity ?? 1), 0) };
        offers.set(offer.id, offer);
      }
      if (rejected.has(offer.id)) return { error: 'This offer was declined. Choose another offer.' };
      const originalOfferId = offer.id;
      let { auth, d } = await h.propose(r, offer);
      let requotes = 0;
      while (d.decision === 'approve' && !r.stopped) {
        const result = await h.execute(r, offer, auth);
        if (result.booked) return { decision: 'approve', booked: true, booking_reference: result.booking?.booking_reference ?? null };
        if (!result.requote || r.stopped) return { decision: 'approve', booked: false, error: 'The booking did not complete. Do not continue with later categories.' };
        if (++requotes > 3) {
          r.stopped = true;
          h.say('warn', 'Das Angebot ändert sich wiederholt. Der Prozess wurde zur Klärung gestoppt.');
          return { error: 'Repeated quote changes. Stop and clarify provider status.' };
        }
        offer = result.requote;
        ({ auth, d } = await h.propose(r, offer, { related_authorization_id: result.related }));
      }
      if (r.stopped) return { error: 'The agent was stopped.' };
      if (d.decision === 'step_up') {
        h.say('wait', 'Die Leine will deine Zustimmung. Die weitere Reiseplanung wartet auf deine Antwort.', { authorization_id: auth.authorization_id });
        r.waiting.set(auth.authorization_id, { offer, kind: offer.kind, auth, rest: [] });
        return { decision: 'step_up', message: 'The customer is being asked. Wait for the answer before continuing.', uncertainty: d.uncertainty };
      }
      if (d.decision !== 'decline') throw new Error('The leash did not return a valid decision.');
      rejected.add(originalOfferId);
      rejected.add(offer.id);
      if (d.reason_codes?.includes('mandate_revoked') || d.reason_codes?.includes('mandate_paused')) { r.stopped = true; return { decision: 'decline', reason: d.summary, stop: 'The customer stopped the agent. Stop now.' }; }
      const removableDecline = d.reason_codes?.includes('addon_not_allowed') && offer.removable?.length && !input.remove_extras;
      if (!removableDecline && exhausted(offer.kind) && ['flight', 'hotel'].includes(offer.kind)) blockMissing(offer.kind);
      return { decision: 'decline', reason: d.summary, reason_codes: d.reason_codes, hint: d.agent_hint };
    }
    if (name === 'finish') {
      const missing = kinds.filter(kind => ['flight', 'hotel'].includes(kind) && !r.booked.has(kind));
      if (missing.length) return { ok: false, message: `The required ${missing[0]} is not booked. Resolve that category before completing the trip.` };
      return { ok: true };
    }
    return { error: `Unknown tool ${name}` };
  }

  const messages = [{ role: 'user', content: `Neuer Auftrag. Der Kunde schrieb: «${r.mandate.instruction}». Hol dir die Reise mit get_trip und buche sie.` }];
  let finished = false;
  for (let step = 0; step < 40 && !finished && !r.stopped; step++) {
    const res = await client.beta.messages.create({
      model: MODEL, max_tokens: 4000, system: SYSTEM, tools: TOOLS, messages,
      output_config: { effort: 'low' },
      betas: ['server-side-fallback-2026-07-01'], fallbacks: 'default',
    });
    if (res.stop_reason === 'refusal') throw new Error('Das Modell hat abgelehnt.');
    for (const b of res.content) if (b.type === 'text' && b.text.trim()) h.say('ai', b.text.trim().slice(0, 400));
    messages.push({ role: 'assistant', content: res.content });
    if (res.stop_reason === 'pause_turn') continue;
    const uses = res.content.filter(b => b.type === 'tool_use');
    if (!uses.length) {
      if (r.waiting.size && !r.stopped) { messages.push({ role: 'user', content: await h.awaitAnswers(r) }); continue; }
      break;
    }
    const results = [];
    for (const u of uses) {
      let out;
      try { out = await runTool(u.name, u.input ?? {}); } catch (e) { out = { error: e.message }; }
      if (u.name === 'finish') {
        if (r.waiting.size && !r.stopped) out = { ok: false, message: 'The customer has not answered yet. Wait for the result below.' };
        else if (out.ok === true && !r.stopped) { finished = true; if (u.input?.summary) h.say('done', u.input.summary.slice(0, 400)); }
      }
      results.push({ type: 'tool_result', tool_use_id: u.id, content: JSON.stringify(out) });
    }
    // Answers from the customer arrive as text right after the tool results.
    if (!finished && !r.stopped && r.waiting.size) {
      results.push({ type: 'text', text: await h.awaitAnswers(r) });
      for (const category of ['flight', 'hotel']) {
        if (!r.stopped && kinds.includes(category) && !r.booked.has(category) && exhausted(category)) blockMissing(category);
      }
    }
    messages.push({ role: 'user', content: results });
  }
}

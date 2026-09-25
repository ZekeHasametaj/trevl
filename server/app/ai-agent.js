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
- step_up: the customer is asked (up to 120 s). Continue with other categories; you get the result later.
Choose offers that fit the customer's own words, not only the cheapest one. Never book a category twice.
Give up a category after 5 declines. Before each tool call, write ONE short sentence in German (max. 20 words)
saying what you do and why; the customer reads it live in the app. When everything is done, call finish.`;

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
  const declines = {};

  async function runTool(name, input) {
    if (name === 'get_trip') {
      return { customer_wording: r.mandate.instruction, destination: trip.destination?.name, destination_airport: trip.destination?.iata,
        nearest_airport_note: trip.destination?.airport ? `${trip.destination.name} has no airport; fly to ${trip.destination.airport.city} (${trip.destination.airport.iata}), then transfer` : null,
        origin: trip.origin?.iata, start_date: trip.start_date, end_date: trip.end_date, travellers: trip.travelers, categories: kinds, already_booked: [...r.booked] };
    }
    if (name === 'search_offers') {
      if (!kinds.includes(input.category)) return { error: `Category ${input.category} is not part of this trip.` };
      const list = await h.search(r.mandate, input.category);
      for (const o of list) offers.set(o.id, o);
      return { offers: list.slice(0, 8).map(describe) };
    }
    if (name === 'propose_booking') {
      let offer = offers.get(input.offer_id);
      if (!offer) return { error: 'Unknown offer_id. Search first and use an offer_id from the results.' };
      if (r.booked.has(offer.kind)) return { error: `A ${offer.kind} is already booked.` };
      if ([...r.waiting.values()].some(w => w.kind === offer.kind)) return { error: `A ${offer.kind} is already waiting for the customer's answer.` };
      if ((declines[offer.kind] ?? 0) >= 5) return { error: `Too many declines for ${offer.kind}. Give up this category.` };
      if (input.remove_extras && offer.removable?.length) {
        const items = offer.items.filter(it => !offer.removable.includes(it.item_category));
        offer = { ...offer, id: `${offer.id}_clean`, items, amount: items.reduce((s, it) => s + it.unit_price * (it.quantity ?? 1), 0) };
        offers.set(offer.id, offer);
      }
      const { auth, d } = await h.propose(r, offer);
      if (d.decision === 'approve') {
        const res = await h.execute(r, offer, auth);
        if (res.requote) {
          const again = await h.propose(r, res.requote, { related_authorization_id: res.related });
          if (again.d.decision === 'approve') { const b = await h.execute(r, res.requote, again.auth); return { decision: 'approve', booked: !!b.booked, booking_reference: b.booking?.booking_reference ?? null, note: 'Price changed before booking; the new price was approved.' }; }
          if (again.d.decision === 'step_up') { r.waiting.set(again.auth.authorization_id, { offer: res.requote, kind: offer.kind, auth: again.auth, rest: [] }); return { decision: 'step_up', message: 'Price changed; the customer is asked. Continue with other categories.' }; }
          return { decision: 'decline', reason: again.d.summary, hint: again.d.agent_hint };
        }
        return res.booked ? { decision: 'approve', booked: true, booking_reference: res.booking?.booking_reference ?? null } : { decision: 'approve', booked: false, error: 'The provider could not complete the booking. Try another offer.' };
      }
      if (d.decision === 'step_up') {
        h.say('wait', 'Die Leine will deine Zustimmung. Ich mache inzwischen weiter.', { authorization_id: auth.authorization_id });
        r.waiting.set(auth.authorization_id, { offer, kind: offer.kind, auth, rest: [] });
        return { decision: 'step_up', message: 'The customer is being asked. Continue with other categories; you will get the answer later.', uncertainty: d.uncertainty };
      }
      declines[offer.kind] = (declines[offer.kind] ?? 0) + 1;
      if (d.reason_codes.includes('mandate_revoked') || d.reason_codes.includes('mandate_paused')) { r.stopped = true; return { decision: 'decline', reason: d.summary, stop: 'The customer stopped the agent. Stop now.' }; }
      return { decision: 'decline', reason: d.summary, reason_codes: d.reason_codes, hint: d.agent_hint };
    }
    if (name === 'finish') return { ok: true };
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
        else { finished = true; if (u.input?.summary) h.say('done', u.input.summary.slice(0, 400)); }
      }
      results.push({ type: 'tool_result', tool_use_id: u.id, content: JSON.stringify(out) });
    }
    // Answers from the customer arrive as text right after the tool results.
    if (!finished && r.waiting.size && uses.some(u => u.name === 'finish')) results.push({ type: 'text', text: await h.awaitAnswers(r) });
    messages.push({ role: 'user', content: results });
  }
}

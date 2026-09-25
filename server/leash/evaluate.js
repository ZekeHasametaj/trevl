// The decision core. A pure function: same inputs → same decision.
// Order: mandate status → facts → customer rules → state (budget, duplicates, re-quotes, velocity)
// → untrusted text and merchant signals → decision → plain-language explanation.
// Nothing here looks at scenario names, IDs or sequence positions.
import { toChf, round2, fmtMoney, fmtDate, canonCity, rangesOverlap, FX_TO_CHF, FX_DATE } from './util.js';
import { scanUntrusted, extractClaims, extractProductFacts } from './untrusted.js';
import { assessMerchant, DEFAULT_REGISTRY } from './merchants.js';
import { UNC_LABEL } from './policy.js';

export const ENGINE_VERSION = 'trevl-leash/1.1-jev';

export const KIND_LABEL = { flight: 'Flug', hotel: 'Hotel', transfer: 'Transfer', activity: 'Aktivität' };
export const ITEM_LABEL = {
  flight_fare: 'Flugticket', hotel_room: 'Hotelzimmer', transfer: 'Transfer', activity: 'Aktivität',
  baggage: 'Aufgabegepäck', seat: 'Sitzplatzwahl', insurance: 'Reiseversicherung', priority: 'Priority Boarding',
  breakfast: 'Frühstück', upgrade: 'Upgrade', fee: 'Gebühr', lounge: 'Lounge-Zugang', meal: 'Mahlzeit',
};
const FACT_LABEL = {
  'authorization.billing_amount_chf': 'Betrag', 'authorization.order_cancellable': 'Kostenlos stornierbar',
  'authorization.order_returnable': 'Rückgabe möglich', 'authorization.timestamp': 'Buchungszeitpunkt',
  'travel.destination_city': 'Reiseziel', 'travel.origin_city': 'Abflugort', 'travel.start_date': 'Beginn',
  'travel.destination_iata': 'Zielflughafen', 'travel.origin_iata': 'Abflughafen',
  'travel.end_date': 'Ende', 'travel.travelers': 'Reisende', 'travel.stops': 'Umstiege', 'travel.cabin_class': 'Klasse',
  'travel.checked_bags': 'Aufgabegepäck pro Person', 'travel.stars': 'Hotel-Sterne', 'travel.price_per_night_chf': 'Preis pro Nacht',
  'merchant.trust_level': 'Anbieter', 'travel.kind': 'Buchungsart', 'items.item_category': 'Positionen',
  'merchant.merchant_category': 'Händlerkategorie', 'items.item_name': 'Produkt', 'items.size': 'Grösse', 'items.return_days': 'Rückgabefrist (Tage)',
};
const TRUST_LABEL = { verified: 'geprüft', known: 'schon genutzt', unknown: 'unbekannt', lookalike: 'Imitation' };
const REASON_BY_KIND = {
  budget_total: ['trip_budget_exceeded', 'budget_reserved'], budget_purchase: ['per_booking_limit', 'amount_unknown'],
  per_night: ['hotel_price_per_night', 'amount_unknown'], destination: ['wrong_destination', 'destination_unknown'],
  airport_destination: ['wrong_destination_airport', 'destination_airport_unknown'], airport_origin: ['wrong_origin_airport', 'origin_airport_unknown'],
  dates_start: ['dates_outside_window', 'dates_unknown'], dates_end: ['dates_outside_window', 'dates_unknown'],
  travelers: ['travelers_mismatch', 'travelers_unknown'], cancellable: ['not_cancellable', 'cancellation_unknown'],
  no_extras: ['addon_not_allowed', 'items_unknown'], categories: ['category_not_allowed', 'category_unknown'],
  merchant_trust: ['merchant_not_trusted', 'merchant_unverified'], direct: ['not_direct', 'stops_unknown'],
  bags: ['baggage_missing', 'baggage_unknown'], stars: ['hotel_stars', 'stars_unknown'], cabin: ['cabin_class', 'cabin_unknown'],
  valid_until: ['mandate_expired', 'time_unknown'], item: ['item_mismatch', 'item_unknown'], size: ['wrong_size', 'size_unknown'],
  returns: ['return_terms', 'return_terms_unknown'], merchant_category: ['merchant_category', 'merchant_category_unknown'],
};
export const AGENT_HINT = {
  not_cancellable: 'Nur kostenlos stornierbare Angebote vorschlagen.', cancellation_unknown: 'Angebote mit klaren Stornobedingungen bevorzugen.',
  addon_not_allowed: 'Extras aus dem Warenkorb entfernen.', lookalike_merchant: 'Nur geprüfte Anbieter nutzen.',
  prompt_injection: 'Diesen Anbieter meiden.', merchant_not_trusted: 'Nur geprüfte Anbieter nutzen.', merchant_unverified: 'Geprüfte Anbieter bevorzugen.',
  trip_budget_exceeded: 'Günstigeres Angebot suchen.', per_booking_limit: 'Günstigeres Angebot suchen.', hotel_price_per_night: 'Günstigeres Hotel suchen.',
  duplicate_booking: 'Nicht erneut buchen.', wrong_destination: 'Ziel einhalten.', dates_outside_window: 'Reisedaten einhalten.',
  wrong_destination_airport: 'Den bestätigten Zielflughafen einhalten.', wrong_origin_airport: 'Den bestätigten Abflughafen einhalten.',
  travelers_mismatch: 'Anzahl Reisende einhalten.', not_direct: 'Nur Direktflüge.', baggage_missing: 'Tarif mit Aufgabegepäck wählen.',
  mandate_revoked: 'Sofort aufhören.', mandate_paused: 'Warten, bis der Kunde fortsetzt.',
};

const fmtFact = (field, v, ctx) => {
  if (v == null) return 'nicht angegeben';
  if (field.endsWith('_chf') || field === 'authorization.billing_amount_chf') return fmtMoney(v);
  if (field === 'authorization.order_cancellable' || field === 'authorization.order_returnable') return { true: 'ja', false: 'nein', unknown: 'nicht angegeben', not_applicable: 'nicht anwendbar' }[v] ?? v;
  if (field === 'merchant.trust_level') return TRUST_LABEL[v] ?? v;
  if (field.endsWith('_date') || field === 'authorization.timestamp') return fmtDate(v);
  if (field === 'travel.destination_city') return ctx?.destinationDisplay ?? v;
  if (field === 'travel.kind') return KIND_LABEL[v] ?? v;
  if (Array.isArray(v)) return v.map(x => ITEM_LABEL[x] ?? KIND_LABEL[x] ?? x).join(', ');
  return String(v);
};
const fmtVal = (rule) => {
  const v = rule.value;
  if (rule.field.includes('amount') || rule.field.endsWith('_chf')) return fmtMoney(v, rule.currency ?? 'CHF');
  if (rule.field.endsWith('_date') || rule.field === 'authorization.timestamp') return fmtDate(v);
  if (rule.field === 'merchant.trust_level') return Array.isArray(v) ? v.map(x => TRUST_LABEL[x] ?? x).join(' oder ') : TRUST_LABEL[v] ?? v;
  if (rule.field === 'authorization.order_cancellable') return { true: 'ja', false: 'nein' }[v] ?? v;
  if (Array.isArray(v)) return v.map(x => ITEM_LABEL[x] ?? KIND_LABEL[x] ?? x).join(', ');
  return String(v);
};
const OP_TEXT = { '<': 'unter', '<=': 'höchstens', '=': 'genau', '!=': 'nicht', '>': 'über', '>=': 'mindestens', in: 'eines von', not_in: 'keines von' };

export function buildFacts(a) {
  const t = a.travel ?? {};
  const chf = typeof a.billing_amount_chf === 'number' ? a.billing_amount_chf : toChf(a.amount, a.currency);
  let nights = t.nights ?? null;
  if (nights == null && t.start_date && t.end_date) nights = Math.round((Date.parse(t.end_date) - Date.parse(t.start_date)) / 864e5);
  return {
    'travel.kind': t.kind ?? null,
    'authorization.amount': a.amount ?? null,
    'authorization.currency': a.currency ?? null,
    'authorization.billing_amount_chf': chf,
    'authorization.order_cancellable': a.order_cancellable ?? null,
    'authorization.order_returnable': a.order_returnable ?? null,
    'authorization.timestamp': a.timestamp ?? null,
    'merchant.merchant_id': a.merchant?.merchant_id ?? null,
    'merchant.merchant_name': a.merchant?.merchant_name ?? null,
    'merchant.merchant_country': a.merchant?.merchant_country ?? null,
    'merchant.merchant_category': a.merchant?.merchant_category ?? null,
    'travel.destination_city': t.destination_city ?? null,
    'travel.destination_iata': t.destination_iata ?? null,
    'travel.origin_city': t.origin_city ?? null,
    'travel.origin_iata': t.origin_iata ?? null,
    'travel.start_date': t.start_date ?? null,
    'travel.end_date': t.end_date ?? null,
    'travel.travelers': t.travelers ?? null,
    'travel.stops': t.stops ?? null,
    'travel.cabin_class': t.cabin_class ?? null,
    'travel.checked_bags': t.checked_bags ?? null,
    'travel.stars': t.stars ?? null,
    'travel.nights': nights,
    // Keep precision for the rule comparison: rounding a three-night average
    // could conceal a one-cent overrun of the confirmed nightly ceiling.
    'travel.price_per_night_chf': t.kind === 'hotel' && chf != null && nights > 0 ? chf / nights : null,
  };
}

function compare(op, fact, val) {
  if (typeof val === 'number' && typeof fact === 'string' && fact.trim() !== '' && !Number.isNaN(Number(fact))) fact = Number(fact);
  switch (op) {
    case '<': return fact < val;
    case '<=': return fact <= val;
    case '>': return fact > val;
    case '>=': return fact >= val;
    case '=': return fact === val;
    case '!=': return fact !== val;
    case 'in': return val.includes(fact);
    case 'not_in': return !val.includes(fact);
    default: return false;
  }
}
const isMissing = (v) => v == null || v === 'unknown' || v === '';

function budgetCheck(rule, ctx) {
  const limit = rule.currency && rule.currency !== 'CHF' ? toChf(rule.value, rule.currency) : rule.value;
  const amount = ctx.facts['authorization.billing_amount_chf'];
  const ts = Date.parse(ctx.auth.timestamp ?? '') || ctx.now;
  const inWindow = (e) => !rule.period_days || (Date.parse(e.timestamp) > ts - rule.period_days * 864e5 && Date.parse(e.timestamp) <= ts);
  const entries = ctx.prior.filter(inWindow);
  const approved = round2(entries.filter(e => e.status === 'approved').reduce((s, e) => s + e.amount_chf, 0));
  const pending = round2(entries.filter(e => e.status === 'pending').reduce((s, e) => s + e.amount_chf, 0));
  const scopeText = rule.period_days ? `in ${rule.period_days} Tagen` : 'für die ganze Reise';
  const budget = { limit, approved, pending, this: amount, after: amount == null ? null : round2(limit - approved - amount), scope: scopeText };
  ctx.budget = budget;
  if (amount == null) return { status: 'unknown', detail: 'Betrag in CHF unbekannt (Währung ohne festen Kurs).', budget };
  if (approved + amount > limit + 1e-9) {
    return { status: 'fail', budget, detail: `Schon gebucht ${fmtMoney(approved)} + diese Buchung ${fmtMoney(amount)} = ${fmtMoney(round2(approved + amount))}, erlaubt ${scopeText}: ${fmtMoney(limit)}.`,
      sentence: `${rule.period_days ? `Dein Limit für ${rule.period_days} Tage reicht nicht` : 'Die Reisekasse reicht nicht'}: Es sind nur noch ${fmtMoney(Math.max(0, round2(limit - approved)))} frei, der Kauf kostet ${fmtMoney(amount)}.` };
  }
  if (approved + pending + amount > limit + 1e-9) {
    return { status: 'unknown', budget, detail: `Gebucht ${fmtMoney(approved)} + wartet auf dich ${fmtMoney(pending)} + diese ${fmtMoney(amount)} = ${fmtMoney(round2(approved + pending + amount))} > ${fmtMoney(limit)}.`,
      sentence: `Zusammen mit Käufen, die noch auf deine Antwort warten (${fmtMoney(pending)}), wäre ${rule.period_days ? 'dein Limit' : 'die Reisekasse'} überzogen.` };
  }
  return { status: 'pass', budget, detail: `${fmtMoney(amount)} von ${fmtMoney(limit)} ${scopeText}; danach frei: ${fmtMoney(round2(limit - approved - amount))}${pending ? ` (davon ${fmtMoney(pending)} reserviert)` : ''}.` };
}

function ruleCheck(rule, ctx) {
  const { facts, auth } = ctx;
  const kind = facts['travel.kind'];
  // A category price ceiling needs a category; applying every ceiling to an
  // unclassified purchase would invent a restriction and could also approve it.
  if (rule.applies_to?.length && ['budget_purchase', 'per_night'].includes(rule.kind) && isMissing(kind)) {
    return { status: 'unknown', reason_code: 'category_unknown', detail: `Buchungsart fehlt; ${rule.label} kann noch nicht geprüft werden.`,
      sentence: 'Die Buchungsart fehlt. Erst klären, welches Preislimit für diesen Kauf gilt.' };
  }
  if (rule.applies_to && kind && !rule.applies_to.includes(kind)) return { status: 'na', detail: `Gilt nur für ${rule.applies_to.map(k => KIND_LABEL[k] ?? k).join(', ')}.` };
  if (rule.field === 'authorization.billing_amount_chf' && rule.scope === 'period') return budgetCheck(rule, ctx);

  // Basket rules: every cart line must pass.
  if (rule.field.startsWith('items.')) {
    const key = rule.field.slice(6);
    const items = Array.isArray(auth.items) ? auth.items : [];
    if (!items.length) return { status: 'unknown', detail: 'Keine Positionen übermittelt.' };
    const bad = [], missing = [];
    let fromText = false;
    items.forEach((it, i) => {
      let v = it[key];
      if (v == null && ctx.itemFacts?.[i]?.[key] != null) { v = ctx.itemFacts[i][key]; fromText = true; }
      if (typeof rule.value === 'string' && typeof v === 'string' && v.toUpperCase() === rule.value.toUpperCase()) v = rule.value;
      if (isMissing(v)) missing.push(it); else if (!compare(rule.operator, v, rule.value)) bad.push(it);
    });
    const via = fromText ? ' (laut Händlertext)' : '';
    const names = (arr) => arr.map(it => `${it.item_name ?? ITEM_LABEL[it[key]] ?? it[key]}${typeof it.unit_price === 'number' ? ` (${fmtMoney(it.unit_price * (it.quantity ?? 1), it.currency ?? auth.currency)})` : ''}`).join(', ');
    if (bad.length) return { status: 'fail', detail: `Nicht erlaubt${via}: ${names(bad)}.`, sentence: rule.kind === 'no_extras' ? `Im Warenkorb sind Extras, die du nicht wolltest: ${names(bad)}.` : `${rule.label}: ${names(bad)} passt nicht${via}.` };
    if (missing.length) return { status: 'unknown', detail: `Unklar bei: ${names(missing)}.`, sentence: `${rule.label}: bei ${names(missing)} nicht angegeben.` };
    return { status: 'pass', detail: `Alle ${items.length} Positionen ok${via}: ${items.map((it, i) => ITEM_LABEL[it[key]] ?? it[key] ?? ctx.itemFacts?.[i]?.[key]).join(', ')}.` };
  }

  let fact = facts[rule.field];
  let val = rule.value;
  // A destination matches by name or by airport code (Pristina = Prishtina = PRN).
  const altFact = rule.field === 'travel.destination_city' ? canonCity(facts['travel.destination_iata']) : null;
  if (rule.field.endsWith('_city')) { fact = canonCity(fact) ?? altFact; val = Array.isArray(val) ? val.map(canonCity) : canonCity(val); }
  if ((rule.field.includes('amount') || rule.field.endsWith('_chf')) && rule.currency && rule.currency !== 'CHF' && typeof val === 'number') val = toChf(val, rule.currency);
  const shown = fmtFact(rule.field, facts[rule.field], ctx);
  const allowed = rule.field === 'travel.destination_city' && ctx.trip?.destination?.name ? ctx.trip.destination.name : `${OP_TEXT[rule.operator]} ${fmtVal(rule)}`;
  if (isMissing(fact) || (rule.field === 'authorization.order_cancellable' && fact === 'not_applicable')) {
    return { status: 'unknown', detail: `${FACT_LABEL[rule.field] ?? rule.field}: ${shown} · verlangt: ${allowed}.`,
      sentence: rule.kind === 'cancellable' ? 'Der Anbieter sagt nicht, ob die Buchung kostenlos stornierbar ist.'
        : rule.kind === 'merchant_trust' ? `${auth.merchant?.merchant_name ?? 'Der Anbieter'} ist nicht geprüft, und du hast dort noch nie gebucht.`
        : `${FACT_LABEL[rule.field] ?? rule.field} ist nicht angegeben.` };
  }
  const ok = compare(rule.operator, fact, val) || (altFact != null && compare(rule.operator, altFact, val));
  const detail = `${FACT_LABEL[rule.field] ?? rule.field}: ${shown} · verlangt: ${allowed}.`;
  if (ok) return { status: 'pass', detail };
  const sentences = {
    budget_purchase: `Teurer als dein Limit pro Buchung (${fmtVal(rule)}).`,
    per_night: `Mehr als ${fmtVal(rule)} pro Nacht (${shown}).`,
    cancellable: 'Nicht kostenlos stornierbar – du wolltest nur stornierbare Buchungen.',
    destination: `Falsches Ziel: ${shown} statt ${ctx.trip?.destination?.name ?? fmtVal(rule)}.`,
    dates_start: `Beginnt vor deinem Reisezeitraum (${shown}).`, dates_end: `Endet nach deinem Reisezeitraum (${shown}).`,
    travelers: `Für ${shown} statt ${fmtVal(rule)} Reisende.`, direct: 'Kein Direktflug.', bags: 'Ohne Aufgabegepäck.',
    stars: `Nur ${shown} Sterne.`, cabin: `Falsche Klasse (${shown}).`, valid_until: 'Deine Leine ist für diesen Zeitpunkt nicht mehr gültig.',
    merchant_trust: `Anbieter ist ${shown} – verlangt: ${fmtVal(rule)}.`, categories: `${KIND_LABEL[fact] ?? fact} ist nicht freigegeben.`,
    returns: 'Keine Rückgabe möglich – du wolltest zurückgeben können.', merchant_category: `Händlerkategorie «${shown}» ist nicht erlaubt (${rule.label}).`,
  };
  return { status: 'fail', detail, sentence: sentences[rule.kind] ?? `${rule.label} nicht erfüllt (${shown}).` };
}

/**
 * @param {object} p
 * @param {object} p.auth       proposed purchase (Viseca-like authorization + travel facts)
 * @param {object} p.mandate    active mandate
 * @param {Array}  p.ledger     earlier decisions (all mandates); only this mandate's entries count
 * @param {Array}  [p.registry] issuer merchant registry
 * @param {Set}    [p.familiar] merchant IDs the customer has used before
 * @param {number} [p.now]      real clock (ms), used for velocity only
 */
export function evaluate({ auth, mandate, ledger = [], registry = DEFAULT_REGISTRY, familiar = new Set(), familiarMerchants = [], familiarDevices = new Set(), now = Date.now(), config = {} }) {
  const t0 = performance.now();
  const velocityMax = config.velocityMax ?? 12;
  const checks = [], signals = [], evidence = [], uncertainty = [];
  const facts = buildFacts(auth);
  const kind = facts['travel.kind'];
  const ctx = { auth, facts, now, trip: mandate?.trip, destinationDisplay: auth.travel?.destination_city,
    itemFacts: (auth.items ?? []).map(i => extractProductFacts(i.item_details)),
    prior: ledger.filter(e => e.mandate_id === mandate?.mandate_id && e.authorization_id !== auth.authorization_id) };

  // 1. Mandate status. Anything but an active, confirmed leash stops the purchase.
  if (!mandate || mandate.status !== 'active') {
    const st = mandate?.status ?? 'missing';
    const code = { revoked: 'mandate_revoked', paused: 'mandate_paused', draft: 'mandate_not_confirmed', expired: 'mandate_expired' }[st] ?? 'mandate_missing';
    const text = { revoked: 'Du hast die Leine gekappt. Der Agent darf nichts mehr kaufen.', paused: 'Du hast den Agenten pausiert.', draft: 'Die Leine ist noch nicht bestätigt.', expired: 'Die Leine ist abgelaufen.' }[st] ?? 'Es gibt keine gültige Leine.';
    return finish({ decision: 'decline', reason_codes: [code], headline: `${KIND_LABEL[kind] ?? 'Kauf'} gestoppt`, summary: text, checks, signals: [{ code, severity: 'block', text }], evidence, uncertainty, facts, ctx, mandate, auth, t0 });
  }

  // 2. Merchant: issuer registry + customer history. Never from merchant text.
  const merchant = assessMerchant(auth.merchant, registry, familiar, familiarMerchants);
  facts['merchant.trust_level'] = merchant.trust_level;

  // 3. Customer rules.
  for (const rule of mandate.hard_rules) {
    const r = ruleCheck(rule, ctx);
    if (r.status === 'na') continue;
    const codes = REASON_BY_KIND[rule.kind] ?? ['rule_failed', 'rule_unknown'];
    checks.push({ rule_id: rule.id, kind: rule.kind, label: rule.label, status: r.status, detail: r.detail, sentence: r.sentence ?? null,
      reason_code: r.reason_code ?? (r.status === 'fail' ? codes[0] : r.status === 'unknown' ? codes[1] : null), source: rule.source ?? null });
  }

  // 4. Untrusted merchant text: flag instructions, report claims, never use them as evidence.
  const texts = [auth.purchase_description, auth.merchant?.description, auth.travel?.description, ...(auth.items ?? []).map(i => i.item_details)].filter(Boolean);
  const scan = scanUntrusted(texts.join('\n'));
  if (scan.detected) {
    signals.push({ code: 'prompt_injection', severity: 'block', text: `Im Händlertext steckt eine versteckte Anweisung an den Agenten («${scan.findings[0].label}»). Ignoriert – wer manipuliert, ist kein vertrauenswürdiger Anbieter.`, findings: scan.findings });
  }
  for (const c of extractClaims(texts.join('\n'))) {
    evidence.push({ fact: 'Behauptung im Händlertext', value: `${c.label} (unbestätigt, zählt nicht)`, source: 'Händlertext · nicht vertrauenswürdig' });
  }
  if (merchant.trust_level === 'lookalike') {
    signals.push({ code: 'lookalike_merchant', severity: 'block', text: `«${auth.merchant?.merchant_name}» (${auth.merchant?.domain ?? 'ohne Domain'}) ${merchant.label}. Typisches Muster gefälschter Buchungsseiten.` });
  } else if (merchant.trust_level === 'unknown' && !mandate.hard_rules.some(r => ['merchant_trust', 'merchant_category'].includes(r.kind))) {
    signals.push({ code: 'merchant_unverified', severity: 'warn', text: `${auth.merchant?.merchant_name} ist weder geprüft noch hast du dort schon gebucht.` });
  }

  // 5. State over time.
  const chf = facts['authorization.billing_amount_chf'];
  if (chf == null) signals.push({ code: 'currency_unknown', severity: 'warn', text: `Für ${auth.currency} gibt es keinen festen Kurs – Betrag in CHF unklar.` });

  const related = auth.related_authorization_id ? ledger.find(e => e.authorization_id === auth.related_authorization_id && e.mandate_id === mandate.mandate_id) : null;
  const sameRoute = (e) => kind === 'hotel' ? canonCity(e.destination_city) === canonCity(facts['travel.destination_city'])
    : canonCity(e.destination_city) === canonCity(facts['travel.destination_city']) && canonCity(e.origin_city) === canonCity(facts['travel.origin_city']);
  const dup = ctx.prior.find(e => ['approved', 'pending'].includes(e.status) && e.kind === kind && e.authorization_id !== auth.related_authorization_id
    && sameRoute(e) && rangesOverlap(e.start_date, e.end_date, facts['travel.start_date'], facts['travel.end_date']));
  if (dup) {
    signals.push({ code: 'duplicate_booking', severity: 'block', text: `Doppelbuchung: Für ${fmtDate(dup.start_date)}–${fmtDate(dup.end_date)} ist schon «${dup.title}» ${dup.status === 'approved' ? 'gebucht' : 'angefragt'} (${fmtMoney(dup.amount_chf)}).` });
  }
  if (auth.related_authorization_id) {
    if (!related) signals.push({ code: 'related_unknown', severity: 'warn', text: 'Bezieht sich auf eine frühere Anfrage, die trevl nicht kennt.' });
    else if (chf != null && related.amount_chf > 0) {
      const change = (chf - related.amount_chf) / related.amount_chf;
      if (change > 0.05) signals.push({ code: 'price_increase', severity: 'warn', text: `Neuer Preis: ${fmtMoney(related.amount_chf)} → ${fmtMoney(chf)} (+${Math.round(change * 100)} %).` });
      else evidence.push({ fact: 'Neues Angebot', value: `ersetzt ${related.authorization_id}: ${fmtMoney(related.amount_chf)} → ${fmtMoney(chf)}`, source: 'Verlauf der Leine' });
    }
  }
  // Session integrity: purchase time (simulated time in replays), device and bursts of attempts.
  const ts = Date.parse(auth.timestamp ?? '') || now;
  const within = (e, ms) => { const et = Date.parse(e.timestamp); return et <= ts && ts - et < ms; };
  const recent = Math.max(ctx.prior.filter(e => within(e, 10 * 60e3)).length, Number(auth.recent_attempt_count_10m) || 0);
  const device = auth.customer_device_id;
  const newDevice = !!device && familiarDevices.size > 0 && !familiarDevices.has(device);
  if (newDevice) signals.push({ code: 'new_device', severity: 'warn', text: `Gekauft wird von einem Gerät (${device}), das bei dir noch nie genutzt wurde.` });
  if (recent >= velocityMax || (newDevice && recent >= 1)) signals.push({ code: 'velocity', severity: 'warn', text: `Ungewöhnlich viele Kaufversuche: ${recent + 1} in 10 Minuten${newDevice ? ' vom neuen Gerät' : ''}.` });

  // Ordinary shopping (no travel facts): same shop + same items again, or one order split in two.
  if (!kind && Array.isArray(auth.items)) {
    const itemsKey = auth.items.map(i => i.item_name).sort().join('|');
    const same = ctx.prior.filter(e => ['approved', 'pending'].includes(e.status) && e.items_key === itemsKey && e.authorization_id !== auth.related_authorization_id);
    const twin = same.find(e => e.merchant_id === auth.merchant?.merchant_id && within(e, 48 * 3600e3));
    const other = same.find(e => e.merchant_id !== auth.merchant?.merchant_id && within(e, 7 * 864e5));
    if (twin) signals.push({ code: 'duplicate_booking', severity: 'block', text: `Doppelte Bestellung: dieselben Artikel bei ${twin.merchant_name} wurden am ${fmtDate(twin.timestamp)} schon ${twin.status === 'approved' ? 'gekauft' : 'angefragt'} (${fmtMoney(twin.amount_chf)}).` });
    else if (other) evidence.push({ fact: 'Ähnlicher Kauf', source: 'Verlauf der Leine', value: `Dasselbe wurde am ${fmtDate(other.timestamp)} schon bei ${other.merchant_name} gekauft (${fmtMoney(other.amount_chf)}).` });
    const perOrder = mandate.hard_rules.find(r => r.kind === 'budget_purchase' && !r.applies_to?.length);
    const split = perOrder && chf != null && ctx.prior.find(e => e.status === 'approved' && e.merchant_id === auth.merchant?.merchant_id && within(e, 15 * 60e3) && e.amount_chf + chf > perOrder.value);
    if (split) signals.push({ code: 'split_order', severity: 'warn', text: `Zusammen mit der Bestellung von ${Math.round((ts - Date.parse(split.timestamp)) / 60e3)} Minuten zuvor (${fmtMoney(split.amount_chf)}) über deinem Limit pro Bestellung – aufgeteilte Bestellung?` });
  }

  // Hidden fees: the lines must add up to the charged amount.
  if (Array.isArray(auth.items) && auth.items.length && typeof auth.amount === 'number' && auth.items.every(i => typeof i.unit_price === 'number' && (!i.currency || i.currency === auth.currency))) {
    const sum = round2(auth.items.reduce((s, i) => s + i.unit_price * (i.quantity ?? 1), 0) + (auth.fees ?? auth.delivery_fee ?? 0));
    if (Math.abs(sum - auth.amount) > Math.max(1, auth.amount * 0.01)) {
      signals.push({ code: 'amount_mismatch', severity: 'warn', text: `Die Positionen ergeben ${fmtMoney(sum, auth.currency)}, verlangt werden ${fmtMoney(auth.amount, auth.currency)}.` });
    }
  }

  // 6. Evidence the customer and the jury can check.
  const rate = FX_TO_CHF[auth.currency];
  evidence.unshift(
    { fact: 'Betrag', value: auth.currency === 'CHF' || chf == null ? fmtMoney(auth.amount, auth.currency) : `${fmtMoney(auth.amount, auth.currency)} → ${fmtMoney(chf)} (fester Kurs ${rate}, Stand ${fmtDate(FX_DATE)})`, source: 'Anbieter · strukturiert' },
    { fact: 'Anbieter', value: `${auth.merchant?.merchant_name ?? '?'}${auth.merchant?.domain ? ` · ${auth.merchant.domain}` : ''} · ${merchant.label}`, source: 'Händlerregister + dein Verlauf' },
  );
  if (kind) evidence.push({ fact: 'Buchung', value: [KIND_LABEL[kind], auth.travel?.destination_city, facts['travel.start_date'] && `${fmtDate(facts['travel.start_date'])}${facts['travel.end_date'] && facts['travel.end_date'] !== facts['travel.start_date'] ? `–${fmtDate(facts['travel.end_date'])}` : ''}`, facts['travel.travelers'] && `${facts['travel.travelers']} Reisende`].filter(Boolean).join(' · '), source: 'Anbieter · strukturiert' });
  if (Array.isArray(auth.items)) evidence.push({ fact: 'Positionen', value: auth.items.map(i => `${i.quantity ?? 1}× ${i.item_name}`).join(', '), source: 'Warenkorb' });
  if (kind === 'hotel' || auth.order_cancellable) evidence.push({ fact: 'Stornierbar', value: fmtFact('authorization.order_cancellable', auth.order_cancellable ?? null), source: 'Anbieter · strukturiert' });
  if (scan.detected) evidence.push({ fact: 'Händlertext', value: `«${scan.findings[0].excerpt}»`, source: 'Händlertext · nicht vertrauenswürdig · ignoriert' });

  // 7. Decide.
  const fails = checks.filter(c => c.status === 'fail');
  const blocks = signals.filter(s => s.severity === 'block');
  const unknowns = checks.filter(c => c.status === 'unknown');
  const warns = signals.filter(s => s.severity === 'warn');
  // Fresh warnings (price jump, burst, hidden fee) first, then missing facts.
  for (const w of warns) uncertainty.push(w.text);
  for (const u of unknowns) uncertainty.push(u.sentence || `${u.label}: ${u.detail}`);

  const K = KIND_LABEL[kind] ?? 'Kauf';
  let decision, headline, summary;
  const reason_codes = [...fails.map(c => c.reason_code), ...blocks.map(s => s.code)];
  if (fails.length || blocks.length) {
    decision = 'decline';
    headline = `${K} abgelehnt`;
    // Most important first: manipulation, then the customer's own rules, then state (duplicates, ...).
    const reasons = [
      ...blocks.filter(s => ['prompt_injection', 'lookalike_merchant', 'mandate_revoked', 'mandate_paused'].includes(s.code)).map(s => s.text),
      ...fails.filter(c => c.kind !== 'merchant_trust' || !blocks.length).map(c => c.sentence ?? `${c.label} nicht erfüllt.`),
      ...blocks.filter(s => !['prompt_injection', 'lookalike_merchant'].includes(s.code)).map(s => s.text),
    ];
    summary = reasons[0] + (reasons[1] ? ` Ausserdem: ${reasons[1]}` : '');
  } else if (unknowns.length || warns.length) {
    reason_codes.push(...unknowns.map(c => c.reason_code), ...warns.map(s => s.code));
    const policy = mandate.uncertainty_policy;
    const missingPriceCategory = unknowns.some(c => c.reason_code === 'category_unknown' && ['budget_purchase', 'per_night'].includes(c.kind));
    decision = missingPriceCategory && policy === 'approve' ? 'step_up' : policy === 'ask' ? 'step_up' : policy;
    headline = decision === 'step_up' ? 'trevl fragt dich' : decision === 'decline' ? `${K} abgelehnt` : `${K} freigegeben – mit Vorbehalt`;
    summary = missingPriceCategory && policy === 'approve'
      ? `${uncertainty[0]} Ohne Buchungsart kann dein Preislimit nicht geprüft werden; dafür braucht es deine Rückfrage.`
      : `${uncertainty[0]} Deine Regel für Unsicherheit: ${UNC_LABEL[policy]}.`;
    if (decision === 'step_up') reason_codes.push('customer_confirmation');
  } else {
    decision = 'approve';
    reason_codes.push('within_policy');
    headline = `${K} freigegeben`;
    const passed = checks.filter(c => c.status === 'pass').length;
    summary = `Passt zu deiner Leine: ${passed} ${passed === 1 ? 'Regel' : 'Regeln'} erfüllt${ctx.budget ? `, danach noch ${fmtMoney(ctx.budget.after)} frei` : ''}.`;
  }
  return finish({ decision, reason_codes: [...new Set(reason_codes.filter(Boolean))], headline, summary, checks, signals, evidence, uncertainty, facts, ctx, mandate, auth, t0, merchant });
}

function finish({ decision, reason_codes, headline, summary, checks, signals, evidence, uncertainty, facts, ctx, mandate, auth, t0, merchant }) {
  const hints = [...new Set(reason_codes.map(c => AGENT_HINT[c]).filter(Boolean))];
  return {
    authorization_id: auth.authorization_id,
    decision,
    headline,
    summary,
    reason_codes,
    customer_message: summary,
    checks,
    signals,
    uncertainty,
    evidence,
    budget: ctx.budget ?? null,
    merchant_trust: merchant?.trust_level ?? null,
    agent_hint: hints.join(' ') || null,
    facts: { kind: facts['travel.kind'], amount_chf: facts['authorization.billing_amount_chf'], start_date: facts['travel.start_date'], end_date: facts['travel.end_date'] },
    mandate_id: mandate?.mandate_id ?? null,
    mandate_version: mandate?.version ?? null,
    engine_version: ENGINE_VERSION,
    latency_ms: Math.round((performance.now() - t0) * 100) / 100,
  };
}

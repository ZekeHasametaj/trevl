// Frontend side of the leash: turns the customer's own words into executable rules.
// Step 1 (understand): a deterministic parser, optionally improved by a small language model.
// Step 2 (build): code turns the understood intent into rules. The model never writes rules itself,
// and every number or quote it returns must appear in the customer's original text.
import { fold, fmtMoney, fmtDate } from '../leash/util.js';
import { findPlaces, resolvePlace, byCity, PLACES } from './places.js';

const MONTHS = [
  ['januar', 'jan', 'january'], ['februar', 'feb', 'february'], ['märz', 'maerz', 'mrz', 'march', 'mar'], ['april', 'apr'],
  ['mai', 'may'], ['juni', 'jun', 'june'], ['juli', 'jul', 'july'], ['august', 'aug'], ['september', 'sep', 'sept'],
  ['oktober', 'okt', 'october', 'oct'], ['november', 'nov'], ['dezember', 'dez', 'december', 'dec'],
];
const monthOf = (w) => { const f = fold(w).replace(/\.$/, ''); const i = MONTHS.findIndex(ms => ms.some(m => fold(m) === f)); return i >= 0 ? i + 1 : null; };
const MONTH_RE = MONTHS.flat().sort((a, b) => b.length - a.length).join('|');
const MONTH_NAME = ['Januar', 'Februar', 'März', 'April', 'Mai', 'Juni', 'Juli', 'August', 'September', 'Oktober', 'November', 'Dezember'];
const WEEKDAY = ['So', 'Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa'];
export const EXTRAS = ['insurance', 'seat', 'priority', 'upgrade', 'lounge', 'meal'];

const pad = (n) => String(n).padStart(2, '0');
const regionName = (cc) => { try { return cc ? new Intl.DisplayNames(['de'], { type: 'region' }).of(cc) : null; } catch { return null; } };

// Country names in German and English → code, to notice "Bali Thailand" (a country that doesn't match the destination).
// Words that are also something else ("island", "Georgia" the US state) are left out: no hint beats a wrong hint.
const normWords = (s) => fold(s).replace(/ß/g, 'ss').replace(/[^a-z ]+/g, ' ').replace(/\s+/g, ' ').trim();
const COUNTRIES = (() => {
  const idx = new Map();
  const skip = new Set(['island', 'georgia', 'jersey', 'chad', 'jordan']);
  try {
    const names = [new Intl.DisplayNames(['de'], { type: 'region' }), new Intl.DisplayNames(['en'], { type: 'region' })];
    for (let i = 0; i < 26 * 26; i++) {
      const cc = String.fromCharCode(65 + Math.floor(i / 26), 65 + (i % 26));
      for (const dn of names) { const n = dn.of(cc); const k = n && n !== cc ? normWords(n) : ''; if (k.length >= 4 && !skip.has(k)) idx.set(k, cc); }
    }
  } catch { /* no region names in this runtime: no hint */ }
  const extra = { usa: 'US', amerika: 'US', america: 'US', england: 'GB', grossbritannien: 'GB', 'great britain': 'GB', schottland: 'GB', scotland: 'GB',
    holland: 'NL', turkei: 'TR', turkey: 'TR', mazedonien: 'MK', bosnien: 'BA', emirate: 'AE', vae: 'AE', uae: 'AE' };
  for (const [n, cc] of Object.entries(extra)) idx.set(n, cc);
  return idx;
})();
export function mentionedCountries(text) {
  const words = [...String(text ?? '').matchAll(/\p{L}+/gu)].map(m => m[0]);
  const keys = words.map(normWords);
  const out = [];
  for (let i = 0; i < words.length; i++) {
    for (let n = Math.min(4, words.length - i); n >= 1; n--) {
      const cc = COUNTRIES.get(keys.slice(i, i + n).join(' '));
      if (cc) { out.push({ cc, quote: words.slice(i, i + n).join(' ') }); i += n - 1; break; }
    }
  }
  return out;
}
// "in Indonesien", but "in der Türkei", "auf den Malediven".
const IN_COUNTRY = { TR: 'in der Türkei', US: 'in den USA', GB: 'in Grossbritannien', NL: 'in den Niederlanden', AE: 'in den Emiraten', PH: 'auf den Philippinen',
  MV: 'auf den Malediven', SC: 'auf den Seychellen', DO: 'in der Dominikanischen Republik', XK: 'im Kosovo', IR: 'im Iran', IQ: 'im Irak', LB: 'im Libanon', SK: 'in der Slowakei', CH: 'in der Schweiz' };
const iso = (y, m, d) => `${y}-${pad(m)}-${pad(d)}`;
function inferYear(month, day, today) {
  const y = today.getUTCFullYear();
  const candidate = Date.UTC(y, month - 1, day ?? 28);
  return candidate < Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate()) ? y + 1 : y;
}
const fullYear = (y) => (y == null ? null : y < 100 ? 2000 + y : y);
const addDays = (isoDate, n) => { const d = new Date(`${isoDate}T12:00:00Z`); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };

export function parseAmount(raw, kilo) {
  let s = String(raw).replace(/[’']/g, '').replace(/\.-$/, '').replace(/-$/, '');
  if (/^\d{1,3}([.,]\d{3})+$/.test(s)) s = s.replace(/[.,]/g, '');
  else s = s.replace(',', '.');
  const n = Number(s);
  if (!Number.isFinite(n)) return null;
  return kilo ? n * 1000 : n;
}
const CUR = (s) => { const f = fold(s ?? ''); if (!f) return null; if (/^(eur|euro|€)/.test(f)) return 'EUR'; if (/^(usd|\$|dollar)/.test(f)) return 'USD'; if (/^(gbp|£|pfund)/.test(f)) return 'GBP'; return 'CHF'; };

const PRICE_CATEGORY = /\b(flugs?|fluge|fluege|flights?|hotels?|unterkunft|unterkunfte|transfers?|taxi|aktivitaten?|aktivit[aä]t|activities|activity|ausfluge?|ausflug)\b/g;
const PRICE_LABEL = { flight: 'Flug', hotel: 'Hotel', transfer: 'Transfer', activity: 'Aktivität' };
const priceKind = (word) => /^(flug|flueg|flight)/.test(word) ? 'flight' : /^(hotel|unterkunft)/.test(word) ? 'hotel' : /^(transfer|taxi)/.test(word) ? 'transfer' : 'activity';

// Prices keep their category and unit. A hotel price without "per night" or
// "total" needs a customer answer; it must never become the whole trip budget.
export function parseMoneyIntent(text) {
  const t = String(text ?? '');
  const intent = { category_limits: [], money_issues: [] };
  const moneyRe = /(max(?:imal)?\.?|höchstens|hoechstens|bis zu|bis|budget(?: von)?|insgesamt|total|zusammen|nicht mehr als|up to|under|unter|limit)?\s*(chf|sfr\.?|fr\.|franken|eur|euro|€|usd|\$|gbp|£)?\s*(-?\d[\d'’.,]*\d|-?\d)\s*(k\b)?\s*(\.-|-)?\s*(chf|sfr\.?|fr\.|franken|eur|euro|€|usd|\$|gbp|£)?/gi;
  const matches = [...t.matchAll(moneyRe)].filter(mm => {
    const [, keyword, cur1, num, , , cur2] = mm;
    if (!cur1 && !cur2 && (!keyword || /^(bis|unter|under)$/i.test(keyword))) return false;
    const after = t.slice(mm.index + mm[0].length).trimStart();
    if (!cur1 && !cur2 && (new RegExp(`^(${MONTH_RE})\\b`, 'i').test(after) || /^\.?\s*\d|^(personen|sterne|stars|people|tage|days)\b/i.test(after))) return false;
    return !/\d\.\d{1,2}\.$|^\d{1,2}\.$/.test(num);
  });
  let consumedCategoryEnd = 0;
  for (let i = 0; i < matches.length; i++) {
    const mm = matches[i];
    const [whole, , cur1, num, kilo, , cur2] = mm;
    const end = mm.index + whole.length;
    // Bound context by other prices and clause separators, so adjacent limits
    // cannot borrow another category or its "pro Nacht" unit.
    const clauseBreak = /[,;!?\n]|\.(?=\s|$)|\bund\b|\band\b/i;
    const beforeRaw = t.slice(Math.max(consumedCategoryEnd, i ? matches[i - 1].index + matches[i - 1][0].length : 0), mm.index).split(clauseBreak).at(-1);
    let afterRaw = t.slice(end, matches[i + 1]?.index ?? t.length).split(clauseBreak)[0];
    const before = fold(beforeRaw), after = fold(afterRaw);
    const preceding = [...before.matchAll(PRICE_CATEGORY)].at(-1);
    const following = [...after.matchAll(PRICE_CATEGORY)][0];
    // "CHF 900 Hotel stornierbar" still describes a total, not a hotel price.
    const followsPrice = following && /^\s*(?:(?:fur|for)\s+(?:(?:den|das|die|a|the)\s+)?)?$/.test(after.slice(0, following.index))
      && !/^\s*(?:kostenlos\s+)?(?:stornierbar|refundable|cancellable)/.test(after.slice(following.index + following[0].length));
    const explicitTrip = /\b(gesamtbudget|reisebudget|trip budget|overall budget|alles zusammen|alle ausgaben zusammen|ganze reise)\b/.test(before + fold(whole));
    const category = explicitTrip ? null : preceding ? priceKind(preceding[0]) : followsPrice ? priceKind(following[0]) : null;
    if (category && !preceding && followsPrice) consumedCategoryEnd = end + following.index + following[0].length;
    // In "Flug 200 CHF Hotel pro Nacht 150 CHF", Hotel belongs to the next
    // amount. Its nightly unit must not leak into the flight allowance.
    if (preceding && following) afterRaw = afterRaw.slice(0, following.index);
    const context = `${category && preceding ? before.slice(preceding.index) : before} ${fold(whole)} ${fold(afterRaw)}`;
    const amount = parseAmount(num, kilo);
    const quoteStart = preceding && !explicitTrip ? mm.index - beforeRaw.length + preceding.index : mm.index;
    const quoteEnd = category || /\b(nacht|night|person|buchung|booking)\b/.test(after) ? end + afterRaw.length : end;
    const entry = { amount, currency: CUR(cur1 || cur2) ?? 'CHF', quote: t.slice(quoteStart, quoteEnd).trim(), hasCur: !!(cur1 || cur2) };
    if (amount == null || amount < 0 || !Number.isSafeInteger(Math.round(amount * 100)) || /-\s*$/.test(beforeRaw) || /-\s*$/.test(whole.slice(0, whole.indexOf(num)))) {
      intent.money_issues.push({ quote: entry.quote, text: `Der Betrag «${entry.quote}» ist ungültig. Bitte im Suchwunsch korrigieren.` });
      continue;
    }
    const nightly = /\b(?:pro|je|per)\s*(?:nacht|night|ubernachtung)|\/\s*(?:nacht|night)\b/.test(context);
    const perPerson = /\b(?:pro|je|per)\s*(?:person|kopf|pers|travell?er)|\bp\.?\s*p\.?\b/.test(context);
    const perBooking = /\b(?:pro|je|per)\s*(?:buchung|booking|kauf|einkauf)\b/.test(context);
    const total = /\b(insgesamt|gesamt|total|ganzen? aufenthalt|gesamten? aufenthalt|whole stay)\b/.test(context);
    if (category && ['activity', 'transfer'].includes(category) && total && !perBooking) {
      intent.money_issues.push({ quote: entry.quote, text: `«${entry.quote}»: Ein gemeinsames Limit für mehrere ${category === 'activity' ? 'Aktivitäten' : 'Transfers'} ist noch nicht unterstützt. Bitte ein Gesamtbudget für die Reise oder ein Limit pro Buchung angeben.` });
      continue;
    }
    if (category) {
      intent.category_limits.push({ ...entry, category, unit: nightly ? 'night' : category === 'hotel' && !total && !perBooking ? 'unclear' : 'booking', per_person: perPerson });
    } else if (nightly) intent.per_night = entry;
    else if (perBooking) intent.budget_per_booking = entry;
    else if (perPerson) intent.budget_per_person = entry;
    else if (!intent.budget_total || (!intent.budget_total.hasCur && entry.hasCur)) intent.budget_total = entry;
  }
  return intent;
}

// Step 1a: deterministic understanding. Returns an "intent" with verbatim quotes from the text.
export function parseIntent(text, today = new Date()) {
  const t = String(text ?? '');
  const f = fold(t);
  const intent = { other_requests: [] };
  const quote = (m) => (m ? m[0].trim() : null);

  // Places: "ab/von X" is the origin, the first other place is the destination.
  const places = findPlaces(t);
  const originM = t.match(/\b(ab|von|from|departing)\s+([A-Za-zÀ-ÿ ]{3,20})/i);
  const originPlace = originM ? resolvePlace(originM[2].trim().split(/\s+/).slice(0, 2).join(' ')) ?? resolvePlace(originM[2].trim().split(/\s+/)[0]) : null;
  if (originPlace) { intent.origin = originPlace.city; intent.origin_quote = originM[0].trim(); }
  else if (originM && /^\p{Lu}/u.test(originM[2].trim())) { intent.origin_text = originM[2].trim().split(/\s+/)[0]; intent.origin_quote = originM[0].trim(); }
  // A Swiss home airport named without "ab" is the origin, never the destination ("Zürich nach Ohrid").
  const home = places.find(p => p.place.home);
  if (!intent.origin && !intent.origin_text && home) { intent.origin = home.place.city; intent.origin_quote = home.alias; }
  const dest = places.find(p => p.place.city !== intent.origin && !p.place.home);
  if (dest) { intent.destination = dest.place.city; intent.destination_quote = t.match(new RegExp(dest.alias.replace(/[^\p{L} ]/gu, '.'), 'iu'))?.[0] ?? dest.alias; }

  // Dates.
  let m;
  // "bis", "bis zum", "bis am", "-", "to", "until" all separate two dates.
  const TO = '(?:[-–—]|bis(?:\\s+(?:zum|zur|am|und\\s+mit|einschliesslich|inkl\\.?))?|to|until|till)';
  const M = `(${MONTH_RE})`;
  // 25. Oktober bis zum 4. November (2026) – a range across two months, month named on both sides.
  const range0 = new RegExp(`(\\d{1,2})\\.?\\s*${M}\\.?(?:\\s*(\\d{4}))?\\s*${TO}\\s*(\\d{1,2})\\.?\\s*${M}\\.?(?:\\s*(\\d{4}))?`, 'i');
  // October 25 to November 4
  const range5 = new RegExp(`${M}\\.?\\s+(\\d{1,2})(?:st|nd|rd|th)?\\s*${TO}\\s*${M}\\.?\\s+(\\d{1,2})(?:st|nd|rd|th)?(?:,?\\s*(\\d{4}))?`, 'i');
  const range1 = new RegExp(`(\\d{1,2})\\.?\\s*${TO}\\s*(\\d{1,2})\\.?\\s*${M}\\.?(?:\\s*(\\d{4}))?`, 'i');
  const range2 = new RegExp(`(\\d{1,2})\\.(\\d{1,2})\\.?(\\d{2,4})?\\s*${TO}\\s*(\\d{1,2})\\.(\\d{1,2})\\.?(\\d{2,4})?`, 'i');
  const range3 = new RegExp(`(\\d{1,2})\\.?\\s*${TO}\\s*(\\d{1,2})\\.(\\d{1,2})\\.?(\\d{2,4})?`, 'i');
  const range4 = new RegExp(`${M}\\.?\\s+(\\d{1,2})(?:st|nd|rd|th)?\\s*${TO}\\s*(\\d{1,2})`, 'i');
  const crossMonth = (d1, m1, y1, d2, m2, y2) => {
    const y = y1 ?? inferYear(m1, d1, today);
    intent.start_date = iso(y, m1, d1);
    intent.end_date = iso(y2 ?? (m2 < m1 ? y + 1 : y), m2, d2);
    intent.dates_quote = quote(m);
  };
  if ((m = t.match(range0))) {
    crossMonth(Number(m[1]), monthOf(m[2]), m[3] ? Number(m[3]) : null, Number(m[4]), monthOf(m[5]), m[6] ? Number(m[6]) : null);
  } else if ((m = t.match(range5))) {
    crossMonth(Number(m[2]), monthOf(m[1]), m[5] ? Number(m[5]) : null, Number(m[4]), monthOf(m[3]), m[5] ? Number(m[5]) : null);
  } else if ((m = t.match(range2))) {
    const [, d1, m1, y1, d2, m2, y2] = m.map(x => (x == null ? x : Number(x)));
    const y = fullYear(y1 ?? y2) ?? inferYear(m1, d1, today);
    intent.start_date = iso(y, m1, d1); intent.end_date = iso(fullYear(y2) ?? (m2 < m1 ? y + 1 : y), m2, d2); intent.dates_quote = quote(m);
  } else if ((m = t.match(range3))) {
    const d1 = Number(m[1]), d2 = Number(m[2]), mo = Number(m[3]);
    const y = fullYear(m[4] ? Number(m[4]) : null) ?? inferYear(mo, d1, today);
    intent.start_date = iso(y, mo, d1); intent.end_date = iso(y, mo, d2); intent.dates_quote = quote(m);
  } else if ((m = t.match(range1))) {
    const d1 = Number(m[1]), d2 = Number(m[2]), mo = monthOf(m[3]);
    const y = m[4] ? Number(m[4]) : inferYear(mo, d1, today);
    intent.start_date = iso(y, mo, d1); intent.end_date = iso(y, mo, d2); intent.dates_quote = quote(m);
  } else if ((m = t.match(range4))) {
    const mo = monthOf(m[1]), d1 = Number(m[2]), d2 = Number(m[3]);
    const y = inferYear(mo, d1, today);
    intent.start_date = iso(y, mo, d1); intent.end_date = iso(y, mo, d2); intent.dates_quote = quote(m);
  } else if ((m = t.match(new RegExp(`\\b(?:im|in|anfang|mitte|ende|early|mid|late)?\\s*(${MONTH_RE})\\b`, 'i')))) {
    const mo = monthOf(m[1]);
    if (mo && !/^(mar|may|mai)$/i.test(m[1]) || /\b(im|in)\s+(märz|mai|may|march)/i.test(m[0])) { intent.month = mo; intent.year = inferYear(mo, 28, today); intent.dates_quote = quote(m); }
  }
  if ((m = f.match(/(\d+)\s*(nachte|nächte|naechte|nights?|ubernachtungen|übernachtungen)/))) intent.nights = Number(m[1]);
  else if ((m = f.match(/(\d+)\s*(tage|days)/))) intent.nights = Math.max(1, Number(m[1]) - 1);
  if (/langes wochenende|long weekend|verlangertes wochenende/.test(f)) intent.weekend = 'long';
  else if (/wochenende|weekend/.test(f)) intent.weekend = 'short';

  // Travellers.
  const WORDS = { zweit: 2, dritt: 3, viert: 4, funft: 5 };
  const COUNTS = { ein: 1, eine: 1, zwei: 2, drei: 3, vier: 4, fünf: 5, fuenf: 5, sechs: 6 };
  if ((m = f.match(/zu (zweit|dritt|viert|funft)/))) { intent.travelers = WORDS[m[1]]; intent.travelers_quote = t.match(/zu\s+(zweit|dritt|viert|fünft)/i)?.[0]; }
  else if ((m = t.match(/\b(ein|eine|zwei|drei|vier|fünf|fuenf|sechs)\s+(personen|person|leute|erwachsene|reisende)\b/i))) { intent.travelers = COUNTS[m[1].toLowerCase()]; intent.travelers_quote = m[0]; }
  else if ((m = t.match(/\b(\d+)\s*(personen|person|leute|erwachsene|reisende|people|adults|travell?ers|pax)\b/i))) { intent.travelers = Number(m[1]); intent.travelers_quote = m[0]; }
  else if ((m = t.match(/\b(mit meiner|mit meinem|mit (?:der|dem) )\s*(frau|mann|freundin|freund|partnerin|partner|schwester|bruder|mutter|vater|kollegin|kollege)\b/i))) { intent.travelers = 2; intent.travelers_quote = m[0]; }
  else if ((m = t.match(/\b(allein|alleine|solo|nur ich|just me)\b/i))) { intent.travelers = 1; intent.travelers_quote = m[0]; }
  else if ((m = t.match(/\bfür\s+(\d)\b/i))) { intent.travelers = Number(m[1]); intent.travelers_quote = m[0]; }

  Object.assign(intent, parseMoneyIntent(t));

  // Conditions.
  if ((m = t.match(/[^.,;]*\b(stornierbar\w*|stornier\w*|storno\w*|refundable|free cancell?ation|cancell?able)\b[^.,;]*/i))) {
    intent.cancellable = { quote: m[0].trim(), scope: /\b(alles|alle buchungen|auch (der )?flug|everything|all bookings)\b/i.test(m[0]) ? 'all' : 'hotel' };
  }
  if ((m = t.match(/\b(keine|ohne|no|without|nichts)\s+(extras?|zusatz\w*|add-?ons?|zusatzleistungen|versicherung\w*|insurance)\b[^.,;]*/i))) intent.no_extras = { quote: m[0].trim() };
  if ((m = t.match(/\b(?:(?:mit|inkl\.?|inklusive|with)\s+(?:\d\s*)?(?:gepäck|koffer|aufgabegepäck|checked bags?|luggage|baggage)|checked bags?|aufgabegepäck)\b/i))) intent.baggage = { quote: m[0].trim() };
  if ((m = t.match(/\b(direktflug|direktflüge|direkt|nonstop|non-stop|ohne umsteigen|direct flights?)\b/i))) intent.direct = { quote: m[0].trim() };
  if ((m = t.match(/\b(?:mind(?:estens|\.)?\s*)?(\d)\s*(?:-\s*)?(sterne?|stern|\*|stars?)/i))) intent.min_stars = { value: Number(m[1]), quote: m[0].trim() };
  if ((m = t.match(/\b(business|first class|premium economy)\b/i))) intent.cabin = { value: fold(m[1]).replace(' class', '').replace(' ', '_'), quote: m[0] };
  if ((m = t.match(/\b(aktivität\w*|ausflüg\w*|ausflug|touren?|führung\w*|museum\w*|tickets? für|activities|tours?)\b/i))) intent.activities = { quote: m[0] };
  if ((m = t.match(/\b(kein|ohne|no)\s+(transfer|taxi)\b/i))) intent.no_transfer = { quote: m[0] };
  if ((m = t.match(/\bnur\s+(den\s+|einen\s+)?(flug|flüge)\b/i))) intent.only = { value: ['flight'], quote: m[0] };
  else if ((m = t.match(/\bnur\s+(ein\s+|das\s+)?(hotel|unterkunft)\b/i))) intent.only = { value: ['hotel'], quote: m[0] };

  // Uncertainty.
  if ((m = t.match(/[^.,;]*\b(im zweifel|wenn (du )?unsicher|bei unsicherheit|if unsure|when (in doubt|uncertain))\b[^.,;]*/i))) {
    const q = m[0];
    if (/ablehn|lehn\w* ab|nicht buchen|lass es|decline|don'?t book|skip/i.test(q)) intent.uncertainty = { value: 'decline', quote: q.trim() };
    else if (/entscheid|selbst|buch einfach|just book|go ahead/i.test(q)) intent.uncertainty = { value: 'approve', quote: q.trim() };
    else intent.uncertainty = { value: 'ask', quote: q.trim() };
  } else if ((m = t.match(/\b(frag mich|frag nach|nachfragen|rückfrage|ask me|check with me)\b/i))) intent.uncertainty = { value: 'ask', quote: m[0] };
  else if ((m = t.match(/\b(entscheide selbst|du entscheidest|freie hand)\b/i))) intent.uncertainty = { value: 'approve', quote: m[0] };
  return intent;
}

// Weekend suggestions inside a month (Fri–Mon for a long weekend, Fri–Sun otherwise).
function weekendOptions(month, year, nights, weekend, today) {
  const opts = [];
  const len = nights ?? (weekend === 'short' ? 2 : 3);
  for (let d = 1; d <= 31 && opts.length < 3; d++) {
    const dt = new Date(Date.UTC(year, month - 1, d));
    if (dt.getUTCMonth() !== month - 1) break;
    if (dt.getUTCDay() !== 5 || dt < today) continue;
    const start = dt.toISOString().slice(0, 10), end = addDays(start, len);
    opts.push({ value: `${start}|${end}`, label: `${WEEKDAY[5]} ${d}. – ${WEEKDAY[new Date(`${end}T12:00:00Z`).getUTCDay()]} ${fmtDate(end).replace(/\.\d{4}$/, '.')}` });
  }
  return opts;
}

const DEFAULT_SRC = { type: 'default', quote: null };
const src = (q) => (q ? { type: 'customer', quote: q } : DEFAULT_SRC);

// Step 2: build the draft mandate from an intent plus the customer's answers to open questions.
export function buildDraft(text, intent, answers = {}, today = new Date()) {
  const a = answers ?? {};
  const rules = [], guidance = [], questions = [], notes = [];
  const I = { ...intent };

  // Apply answers to open questions.
  // A chip answer names a built-in city; a typed answer was resolved by the server into destination_place.
  if (a.destination && byCity(a.destination)) { I.destination = a.destination; I.destination_place = null; I.destination_quote = null; }
  if (a.origin && byCity(a.origin)) { I.origin = a.origin; I.origin_place = null; }
  if (a.dates) { const [s, e] = String(a.dates).split('|'); I.start_date = s; I.end_date = e; I.dates_answered = true; }
  if (a.travelers) I.travelers = Number(a.travelers);
  if (a.budget) I.budget_total = { amount: Number(a.budget), currency: 'CHF', quote: null, answered: true };
  if (a.extras === 'none') I.no_extras = { quote: null, answered: true };
  if (a.extras === 'bags') { I.no_extras = { quote: null, answered: true }; I.baggage = { quote: null, answered: true }; }
  if (a.cancellable === 'yes') I.cancellable = { quote: null, scope: 'hotel', answered: true };

  const dest = I.destination_place ?? byCity(I.destination);
  const origin = I.origin_place ?? byCity(I.origin) ?? byCity('zurich');
  const where = (p) => { const cn = p.country_name ?? regionName(p.country); return cn && p.country !== 'CH' ? `${p.name} (${cn})` : p.name; };
  const travelers = I.travelers ?? 1;

  // Dates: exact range, or a month + suggested weekends.
  let start = I.start_date, end = I.end_date;
  if (!start && I.month) {
    const opts = weekendOptions(I.month, I.year ?? inferYear(I.month, 28, today), I.nights, I.weekend, today);
    questions.push({ id: 'dates', required: true, text: `Welche Tage im ${MONTH_NAME[I.month - 1]}?`, options: opts, why: 'Ohne genaue Daten kann der Agent keine Flüge suchen.' });
  } else if (!start) {
    const base = new Date(today); base.setUTCDate(base.getUTCDate() + 14);
    const opts = weekendOptions(base.getUTCMonth() + 1, base.getUTCFullYear(), I.nights, I.weekend ?? 'long', base);
    questions.push({ id: 'dates', required: true, text: 'Wann soll es losgehen?', options: opts, why: 'Ohne Daten kann der Agent nichts suchen.' });
  }
  if (!dest && I.destination_choices?.length) {
    // Same name, different places (Kochi in India and Kōchi in Japan): ask instead of guessing.
    const name = I.destination_choices[0].name;
    questions.push({ id: 'destination', required: true, input: 'Oder anderes Ziel eingeben', text: `Welches ${name} meinst du?`,
      options: I.destination_choices.map(p => ({ value: `iata:${p.iata}`, label: `${p.name} · ${p.country_name ?? p.country} (${p.iata})` })), why: 'Den Namen gibt es mehrmals. trevl rät nicht.' });
  } else if (!dest) {
    const suggested = (I.destination_alternatives ?? []).map(p => ({ value: `iata:${p.iata}`, label: `${p.name} (${p.iata})${p.country_name ? ` · ${p.country_name}` : ''}` }));
    questions.push({ id: 'destination', required: true, input: 'Stadt oder Flughafen eingeben', text: I.destination_not_found ? `«${I.destination_not_found}» kenne ich nicht. Wohin soll es gehen?` : 'Wohin soll es gehen?',
      options: suggested.length ? suggested : ['lisbon', 'barcelona', 'rome', 'paris'].map(c => ({ value: c, label: byCity(c).name })), why: 'Das Ziel begrenzt, was der Agent buchen darf.' });
  }
  // "Bali Thailand": the text names a country the destination is not in. Plan the named place, but say so openly.
  if (dest?.country) {
    const named = mentionedCountries(text).filter(c => c.cc !== 'CH' && c.cc !== origin.country);
    if (named.length && !named.some(c => c.cc === dest.country)) {
      const cn = dest.country_name ?? regionName(dest.country);
      notes.push(`Du schreibst «${named[0].quote}», aber ${dest.name} liegt ${IN_COUNTRY[dest.country] ?? `in ${cn}`}. trevl plant ${where(dest)} – passe den Text an, falls du ein anderes Ziel meinst.`);
    }
  }
  if (dest?.airport) {
    const all = [dest.airport, ...(dest.airport_alternatives ?? [])];
    questions.push({ id: 'airport', required: false, default: dest.airport.iata, text: `${dest.name} hat keinen eigenen Flughafen. Über welchen fliegen?`,
      options: all.map(a => ({ value: a.iata, label: `${a.city} (${a.iata}) · ${a.distance_km} km` })), why: 'trevl hat den nächsten genommen und bucht einen Transfer ins Hotel.' });
  }
  if (!I.budget_total && !I.budget_per_person) questions.push({ id: 'budget', required: true, text: 'Wie viel darf die ganze Reise kosten?', options: [800, 1200, 1500, 2000].map(v => ({ value: v, label: fmtMoney(v).replace('.00', '') })), why: 'Ohne Limit gibt trevl dem Agenten keine Karte.' });
  if (I.travelers == null) questions.push({ id: 'travelers', required: false, text: 'Wie viele reisen mit?', options: [1, 2, 3, 4].map(v => ({ value: v, label: v === 1 ? 'Nur ich' : `${v} Personen` })), why: 'trevl hat 1 Person angenommen.', default: 1 });
  if (!I.no_extras) questions.push({ id: 'extras', required: false, text: 'Darf der Agent Extras dazubuchen (Sitzplatz, Versicherung …)?', options: [{ value: 'none', label: 'Nein, keine Extras' }, { value: 'bags', label: 'Nur Gepäck' }, { value: 'any', label: 'Ja, egal' }], why: 'Extras sind die häufigste versteckte Kostenfalle.' });
  if (!I.cancellable) questions.push({ id: 'cancellable', required: false, text: 'Nur Hotels, die man kostenlos stornieren kann?', options: [{ value: 'yes', label: 'Ja, nur stornierbar' }, { value: 'any', label: 'Egal' }], why: 'Schützt dich, falls sich Pläne ändern.' });

  for (const [i, issue] of (I.money_issues ?? []).entries()) questions.push({ id: `price_invalid_${i}`, required: true, text: issue.text, options: [], why: 'Über „Text ändern“ kannst du den Betrag korrigieren. Daraus wird keine Freigabe abgeleitet.' });
  for (const [i, cap] of (I.category_limits ?? []).entries()) {
    let unit = cap.unit;
    if (unit === 'unclear') {
      const answer = a[`price_scope_${i}`];
      if (['night', 'booking'].includes(answer)) unit = answer;
      else {
        questions.push({ id: `price_scope_${i}`, required: true, text: `Hotel: ${fmtMoney(cap.amount, cap.currency)}${cap.per_person ? ' pro Person' : ''} – pro Nacht oder für den ganzen Aufenthalt?`,
          options: [{ value: 'night', label: 'Pro Nacht' }, { value: 'booking', label: 'Ganzer Aufenthalt' }], why: `Du schreibst «${cap.quote}». Die Leine übernimmt das erst nach deiner Antwort.` });
        continue;
      }
    }
    if (unit === 'night' && cap.category !== 'hotel') {
      questions.push({ id: `price_scope_${i}`, required: true, text: `«${cap.quote}»: Ein Nachtlimit ist nur für Hotels verfügbar.`, options: [], why: 'Bitte den Suchwunsch über „Text ändern“ präzisieren.' });
      continue;
    }
    const value = cap.amount * (cap.per_person ? travelers : 1);
    const nightly = unit === 'night';
    const baseId = nightly ? 'per_night' : `budget_${cap.category}`;
    const id = rules.some(r => r.id === baseId) ? `${baseId}_${i}` : baseId;
    rules.push({ id, kind: nightly ? 'per_night' : 'budget_purchase',
      label: `${PRICE_LABEL[cap.category]} höchstens ${fmtMoney(value, cap.currency).replace('.00', '')} ${nightly ? 'pro Nacht' : cap.category === 'hotel' ? 'für den ganzen Aufenthalt' : 'pro Buchung'} (alle Reisenden)`,
      field: nightly ? 'travel.price_per_night_chf' : 'authorization.billing_amount_chf', operator: '<=', value, currency: cap.currency,
      ...(nightly ? {} : { scope: 'purchase' }), applies_to: [cap.category], source: cap.unit === 'unclear' ? { type: 'answer', quote: cap.quote } : src(cap.quote) });
    if (cap.per_person) guidance.push(`${PRICE_LABEL[cap.category]}: ${fmtMoney(cap.amount, cap.currency)} pro Person × ${travelers} Reisende = ${fmtMoney(value, cap.currency)}${nightly ? ' pro Nacht' : ' pro Buchung'}.`);
  }

  // Rules.
  if (I.budget_total || I.budget_per_person) {
    const b = I.budget_total ?? I.budget_per_person;
    const total = I.budget_total ? b.amount : b.amount * travelers;
    rules.push({ id: 'budget_total', kind: 'budget_total', label: `Reisekasse ${fmtMoney(total, b.currency).replace('.00', '')} gesamt`, field: 'authorization.billing_amount_chf', operator: '<=', value: total, currency: b.currency, scope: 'period', source: src(b.quote) });
    if (!I.budget_total) guidance.push(`«${b.quote}» pro Person × ${travelers} Reisende = ${fmtMoney(total, b.currency)} Reisekasse.`);
    if (b.currency !== 'CHF') guidance.push(`Dein Limit ist in ${b.currency}. trevl rechnet alle Preise mit festem Kurs um.`);
  }
  if (I.budget_per_booking) rules.push({ id: 'budget_purchase', kind: 'budget_purchase', label: `Pro Buchung höchstens ${fmtMoney(I.budget_per_booking.amount, I.budget_per_booking.currency).replace('.00', '')}`, field: 'authorization.billing_amount_chf', operator: '<=', value: I.budget_per_booking.amount, currency: I.budget_per_booking.currency, scope: 'purchase', source: src(I.budget_per_booking.quote) });
  if (I.per_night) rules.push({ id: 'per_night', kind: 'per_night', label: `Hotel höchstens ${fmtMoney(I.per_night.amount, I.per_night.currency).replace('.00', '')} pro Nacht`, field: 'travel.price_per_night_chf', operator: '<=', value: I.per_night.amount, currency: I.per_night.currency, applies_to: ['hotel'], source: src(I.per_night.quote) });
  // All names and airport codes of the destination count as the same place (Pristina = Prishtina = PRN).
  if (dest) rules.push({ id: 'destination', kind: 'destination', label: `Nur ${where(dest)}${dest.airport ? `, Flughafen ${dest.airport.iata}` : ''}`, field: 'travel.destination_city', operator: 'in',
    value: [...new Set([dest.city, dest.name, dest.en, dest.iata, dest.city_iata, ...(dest.aliases ?? [])].filter(Boolean).map(String))], source: src(I.destination_quote) });
  if (start && end) {
    rules.push({ id: 'dates_start', kind: 'dates_start', label: `Nicht vor ${fmtDate(start)}`, field: 'travel.start_date', operator: '>=', value: start, source: src(I.dates_quote) });
    rules.push({ id: 'dates_end', kind: 'dates_end', label: `Nicht nach ${fmtDate(end)}`, field: 'travel.end_date', operator: '<=', value: end, source: src(I.dates_quote) });
  }
  rules.push({ id: 'travelers', kind: 'travelers', label: travelers === 1 ? 'Für 1 Person' : `Für ${travelers} Personen`, field: 'travel.travelers', operator: '=', value: travelers, source: I.travelers != null ? src(I.travelers_quote) : { type: 'default', quote: null } });
  if (I.cancellable) {
    const all = I.cancellable.scope === 'all';
    rules.push({ id: 'cancellable', kind: 'cancellable', label: all ? 'Alles kostenlos stornierbar' : 'Hotel kostenlos stornierbar', field: 'authorization.order_cancellable', operator: '=', value: 'true', ...(all ? {} : { applies_to: ['hotel'] }), source: src(I.cancellable.quote) });
  }
  if (I.no_extras) rules.push({ id: 'no_extras', kind: 'no_extras', label: I.baggage ? 'Keine Extras ausser Gepäck' : 'Keine Extras', field: 'items.item_category', operator: 'not_in', value: I.baggage ? EXTRAS : [...EXTRAS, 'baggage'], source: src(I.no_extras.quote) });
  if (I.baggage) rules.push({ id: 'bags', kind: 'bags', label: 'Flug mit Aufgabegepäck', field: 'travel.checked_bags', operator: '>=', value: 1, applies_to: ['flight'], source: src(I.baggage.quote) });
  if (I.direct) rules.push({ id: 'direct', kind: 'direct', label: 'Nur Direktflüge', field: 'travel.stops', operator: '<=', value: 0, applies_to: ['flight'], source: src(I.direct.quote) });
  if (I.min_stars) rules.push({ id: 'stars', kind: 'stars', label: `Hotel mindestens ${I.min_stars.value} Sterne`, field: 'travel.stars', operator: '>=', value: I.min_stars.value, applies_to: ['hotel'], source: src(I.min_stars.quote) });
  if (I.cabin) rules.push({ id: 'cabin', kind: 'cabin', label: `Klasse: ${I.cabin.value}`, field: 'travel.cabin_class', operator: '=', value: I.cabin.value, applies_to: ['flight'], source: src(I.cabin.quote) });
  let kinds = I.only?.value ?? ['flight', 'hotel', 'transfer', ...(I.activities || I.category_limits?.some(c => c.category === 'activity') ? ['activity'] : [])];
  if (I.no_transfer) kinds = kinds.filter(k => k !== 'transfer');
  const KL = { flight: 'Flug', hotel: 'Hotel', transfer: 'Transfer', activity: 'Aktivitäten' };
  rules.push({ id: 'categories', kind: 'categories', label: `Nur ${kinds.map(k => KL[k]).join(', ')}`, field: 'travel.kind', operator: 'in', value: kinds, source: I.only ? src(I.only.quote) : { type: 'default', quote: null } });
  rules.push({ id: 'merchant_trust', kind: 'merchant_trust', label: 'Nur geprüfte oder bekannte Anbieter', field: 'merchant.trust_level', operator: 'in', value: ['verified', 'known'], source: { type: 'default', quote: null } });

  guidance.push('Die Reisekasse zählt nur, was wirklich gebucht ist. Was auf deine Antwort wartet, ist reserviert.');
  guidance.push(`Abflug ab ${origin.name} (${origin.iata}).`);
  if (dest?.airport) {
    guidance.push(`${dest.name} hat keinen eigenen Flughafen: Flug nach ${dest.airport.city} (${dest.airport.iata}, ca. ${dest.airport.distance_km} km Luftlinie), dann Transfer ins Hotel.`);
    if (I.no_transfer || (I.only && !I.only.value.includes('transfer'))) notes.push(`Ohne Transfer musst du selbst von ${dest.airport.city} nach ${dest.name} kommen (ca. ${dest.airport.distance_km} km).`);
  }
  guidance.push('Preise in Euro, Pfund oder Dollar rechnet trevl mit festem Kurs in CHF um.');
  guidance.push('Unbekannte Anbieter: trevl fragt dich. Gefälschte Seiten: trevl lehnt ab.');
  guidance.push('Was ein Händler in seine Beschreibung schreibt, ändert nie deine Regeln.');

  const uncertainty = I.uncertainty?.value ?? 'ask';
  if (!I.uncertainty) notes.push('Bei Unsicherheit fragt trevl dich – das kannst du unten ändern.');
  if (Array.isArray(I.other_requests)) for (const r of I.other_requests) notes.push(`Nicht als feste Regel prüfbar: «${r.text}». trevl gibt es dem Agenten als Wunsch mit und fragt dich, wenn ein Angebot unklar ist.`);

  const valid_until = start ?? null;
  if (valid_until) rules.push({ id: 'valid_until', kind: 'valid_until', label: `Buchen nur bis zur Abreise (${fmtDate(valid_until)})`, field: 'authorization.timestamp', operator: '<=', value: valid_until, source: { type: 'default', quote: null } });

  const trip = {
    destination: dest ? { city: dest.city, name: dest.name, en: dest.en, iata: dest.iata, country: dest.country, country_name: dest.country_name ?? regionName(dest.country), source: dest.source ?? 'list',
      lat: dest.lat ?? null, lng: dest.lng ?? null, airport: dest.airport ?? null, is_region: !!dest.is_region } : null,
    origin: { city: origin.city, name: origin.name, en: origin.en, iata: origin.iata },
    start_date: start ?? null, end_date: end ?? null, travelers,
    cabin: I.cabin?.value ?? 'economy', direct: !!I.direct, bags: !!I.baggage, kinds,
  };
  const missing = questions.filter(q => q.required).map(q => q.id);
  return { instruction: text, trip, hard_rules: rules, uncertainty_policy: uncertainty, guidance, open_questions: questions, notes, ready: missing.length === 0, missing };
}

export function compileLocal(text, answers, today = new Date()) {
  const intent = parseIntent(text, today);
  return { ...buildDraft(text, intent, answers, today), understood_by: 'parser', intent };
}

export { PLACES };

// Small shared helpers for the leash engine. No external dependencies.

// Fixed synthetic rates, identical to Viseca's data pack (fx_rates.csv, 2026-08-01).
export const FX_TO_CHF = { CHF: 1, EUR: 0.95, GBP: 1.12, USD: 0.87 };
export const FX_DATE = '2026-08-01';

export function toChf(amount, currency) {
  if (typeof amount !== 'number' || !Number.isFinite(amount)) return null;
  const rate = FX_TO_CHF[currency];
  if (rate == null) return null;
  return round2(amount * rate);
}

export const round2 = (n) => Math.round(n * 100) / 100;

// Swiss number format: CHF 1'234.50
export function fmtMoney(amount, currency = 'CHF') {
  if (amount == null || !Number.isFinite(amount)) return `${currency} ?`;
  const [whole, frac] = Math.abs(amount).toFixed(2).split('.');
  const grouped = whole.replace(/\B(?=(\d{3})+(?!\d))/g, "'");
  return `${amount < 0 ? '-' : ''}${currency} ${grouped}.${frac}`;
}

export function fmtDate(iso) {
  if (!iso) return '?';
  const d = new Date(iso.length === 10 ? `${iso}T12:00:00Z` : iso);
  if (Number.isNaN(d.getTime())) return iso;
  return `${d.getUTCDate()}.${d.getUTCMonth() + 1}.${d.getUTCFullYear()}`;
}

// Canonical city names so "Lissabon", "Lisboa", "Lisbon" and "LIS" compare equal.
const CITY_ALIASES = {
  lisbon: ['lisbon', 'lissabon', 'lisboa', 'lisbonne', 'lis'],
  porto: ['porto', 'oporto', 'opo'],
  barcelona: ['barcelona', 'bcn'],
  madrid: ['madrid', 'mad'],
  rome: ['rome', 'rom', 'roma', 'fco'],
  milan: ['milan', 'mailand', 'milano', 'mxp', 'lin'],
  paris: ['paris', 'cdg', 'ory'],
  london: ['london', 'londres', 'lhr', 'lgw', 'lcy', 'stn'],
  berlin: ['berlin', 'ber'],
  amsterdam: ['amsterdam', 'ams'],
  vienna: ['vienna', 'wien', 'vie'],
  athens: ['athens', 'athen', 'ath'],
  copenhagen: ['copenhagen', 'kopenhagen', 'cph'],
  prague: ['prague', 'prag', 'prg'],
  new_york: ['new york', 'new york city', 'nyc', 'jfk', 'ewr', 'lga'],
  zurich: ['zurich', 'zürich', 'zrh'],
  geneva: ['geneva', 'genf', 'genève', 'geneve', 'gva'],
  basel: ['basel', 'bâle', 'bsl'],
  palma: ['palma', 'palma de mallorca', 'mallorca', 'pmi'],
  nice: ['nice', 'nizza', 'nce'],
  dublin: ['dublin', 'dub'],
  edinburgh: ['edinburgh', 'edi'],
  stockholm: ['stockholm', 'arn'],
  valencia: ['valencia', 'vlc'],
  seville: ['seville', 'sevilla', 'svq'],
};
const ALIAS_INDEX = new Map();
for (const [canon, list] of Object.entries(CITY_ALIASES)) for (const a of list) ALIAS_INDEX.set(fold(a), canon);

export function fold(s) {
  return String(s ?? '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/\s+/g, ' ').trim();
}
export function canonCity(s) {
  if (s == null || s === '') return null;
  const f = fold(s);
  return ALIAS_INDEX.get(f) ?? f.replace(/ /g, '_');
}

export function levenshtein(a, b) {
  a = String(a); b = String(b);
  if (a === b) return 0;
  const dp = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    let prev = dp[0]; dp[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const tmp = dp[j];
      dp[j] = Math.min(dp[j] + 1, dp[j - 1] + 1, prev + (a[i - 1] === b[j - 1] ? 0 : 1));
      prev = tmp;
    }
  }
  return dp[b.length];
}

export const nowIso = () => new Date().toISOString();

export function uid(prefix) {
  const rnd = Math.random().toString(36).slice(2, 8).toUpperCase();
  return `${prefix}-${Date.now().toString(36).slice(-4).toUpperCase()}${rnd}`;
}

export function dateOnly(iso) {
  return typeof iso === 'string' && iso.length >= 10 ? iso.slice(0, 10) : null;
}

// Two closed date ranges overlap (nights: end is checkout, so use < on the end).
export function rangesOverlap(aStart, aEnd, bStart, bEnd) {
  if (!aStart || !bStart) return false;
  const ae = aEnd ?? aStart, be = bEnd ?? bStart;
  if (aStart === ae || bStart === be) return aStart <= be && bStart <= ae; // single-day items
  return aStart < be && bStart < ae;
}

// Merchant assessment from the issuer's point of view: a registry of verified travel
// merchants (issuer data, trusted) plus the customer's own booking history.
import { fold, levenshtein } from './util.js';

// Fictional merchants. Duffel Airways is Duffel's official test airline.
export const DEFAULT_REGISTRY = [
  { merchant_id: 'ME-DUFFEL', merchant_name: 'Duffel Airways', domain: 'duffel.com', merchant_category: 'airline', merchant_mcc: '4511', merchant_country: 'GB', trust: 'verified' },
  { merchant_id: 'ME-STAYFINDER', merchant_name: 'Stayfinder', domain: 'stayfinder.ch', merchant_category: 'lodging', merchant_mcc: '7011', merchant_country: 'CH', trust: 'verified' },
  { merchant_id: 'ME-RIDELINK', merchant_name: 'RideLink Transfers', domain: 'ridelink.eu', merchant_category: 'transport', merchant_mcc: '4121', merchant_country: 'PT', trust: 'verified' },
  { merchant_id: 'ME-CITYPASS', merchant_name: 'CityPass Tours', domain: 'citypass-tours.eu', merchant_category: 'tourism', merchant_mcc: '4722', merchant_country: 'DE', trust: 'verified' },
  { merchant_id: 'ME-LITEAPI', merchant_name: 'Nuitée (LiteAPI)', domain: 'liteapi.travel', merchant_category: 'lodging', merchant_mcc: '7011', merchant_country: 'FR', trust: 'verified' },
];

const LEET = [[/0/g, 'o'], [/1/g, 'i'], [/3/g, 'e'], [/4/g, 'a'], [/5/g, 's'], [/7/g, 't'], [/rn/g, 'm'], [/vv/g, 'w']];
const STOP = /\b(deals?|official|offiziell|booking|buchung|online|secure|sicher|travel|reisen|store|shop|express|sale|rabatt|discount|best|price|cheap|24|com|ch|eu|net|org|pt|www)\b/g;

function core(s) {
  let f = fold(s).replace(/https?:\/\//, '').replace(/\.[a-z]{2,}(\/.*)?$/, '');
  f = f.replace(/[-_.]/g, ' ');
  for (const [re, to] of LEET) f = f.replace(re, to);
  return f.replace(STOP, ' ').replace(/[^a-z]/g, '');
}

export function assessMerchant(merchant, registry = DEFAULT_REGISTRY, familiarIds = new Set(), familiarMerchants = []) {
  const m = merchant ?? {};
  const entry = registry.find(r => r.merchant_id === m.merchant_id);
  if (entry && entry.trust === 'verified' && (!m.domain || fold(m.domain) === fold(entry.domain))) {
    return { trust_level: 'verified', label: 'geprüfter Anbieter', registry_entry: entry, lookalike_of: null };
  }
  if (entry && entry.trust === 'verified') {
    return { trust_level: 'lookalike', label: `Domain ${m.domain} gehört nicht zu «${entry.merchant_name}»`, registry_entry: null, lookalike_of: entry };
  }
  // Brand impersonation: looks like a verified merchant but is not that merchant.
  const nameCore = core(m.merchant_name), domainCore = core(m.domain ?? '');
  // Also shops the customer knows: «PixelHarbour» pretending to be the familiar «PixelHarbor».
  const candidates = [...registry.filter(r => r.trust === 'verified'), ...familiarMerchants.map(f => ({ ...f, domain: f.domain ?? '' }))];
  for (const v of candidates) {
    if (v.merchant_id === m.merchant_id) continue;
    const vc = core(v.merchant_name), vd = v.domain ? core(v.domain) : '';
    const similar = (a, b) => a && b && b.length >= 5 && (a === b || a.includes(b) || (Math.abs(a.length - b.length) <= 2 && levenshtein(a, b) <= 2));
    if (similar(nameCore, vc) || similar(domainCore, vd) || similar(nameCore, vd) || similar(domainCore, vc)) {
      return { trust_level: 'lookalike', label: `imitiert «${v.merchant_name}»`, registry_entry: null, lookalike_of: v };
    }
  }
  // Airlines are identified by network data (MCC 4511 + IATA designator), not by their own text.
  if (!entry && m.merchant_mcc === '4511' && /^[A-Z0-9]{2}$/.test(m.iata_code ?? '')) {
    return { trust_level: 'verified', label: `Airline ${m.iata_code} (IATA)`, registry_entry: null, lookalike_of: null };
  }
  if (familiarIds.has(m.merchant_id)) return { trust_level: 'known', label: 'schon früher genutzt', registry_entry: entry ?? null, lookalike_of: null };
  return { trust_level: 'unknown', label: 'unbekannter Anbieter', registry_entry: entry ?? null, lookalike_of: null };
}

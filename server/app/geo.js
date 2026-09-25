// Finds destinations the built-in list does not know.
// 1. Duffel's worldwide airport search: a candidate word only counts when an airport's city (or country) matches it,
//    so words like "Hotel" or "Oktober" never become a destination. Two cities with the same name → ask, don't guess.
// 2. Towns without an airport (Zermatt, Positano …): geocode the town (Open-Meteo, no key), then take the nearest
//    airports from Duffel. The trip then flies to that airport and adds a transfer into town.
import { fold, levenshtein } from '../leash/util.js';
import { resolvePlace } from './places.js';

const MONTHS = 'januar jan january februar feb february märz maerz march mar april apr mai may juni jun june juli jul july august aug september sep sept oktober okt october oct november nov dezember dez december dec';
const WORDS = `${MONTHS} hotel hotels flug fluege flüge flight flights reise trip ferien urlaub budget chf eur euro franken fr sfr usd gbp extras extra transfer transfers
  person personen people adults erwachsene reisende zweit dritt viert wochenende langes weekend sterne stern stars direktflug direkt nonstop gepäck gepaeck koffer bags
  frau mann freundin freund partner partnerin familie kinder kind max maximal höchstens hoechstens alles zusammen insgesamt total keine kein ohne mit und oder vom von bis ab
  nach im in am an zum zur für fur frag fragen mich mir wenn du unsicher bist stornierbar kostenlos gratis nur ich wir uns möchte moechte will wollen gerne bitte buch buche buchen
  the and to from for with at nights night nächte naechte tage days pro nacht no ask me when uncertain zweifel ablehnen lehn entscheide selbst business economy first class
  günstig guenstig billig teuer schön schoen city stadt land meer strand berge irgendwo irgendwohin warm sonne`.split(/\s+/).filter(Boolean);
const STOP = new Set(WORDS.map(fold));

const regionDe = (() => { try { const dn = new Intl.DisplayNames(['de'], { type: 'region' }); return (cc) => { try { return cc ? dn.of(cc) : null; } catch { return null; } }; } catch { return () => null; } })();
const regionEn = (() => { try { const dn = new Intl.DisplayNames(['en'], { type: 'region' }); return (cc) => { try { return cc ? dn.of(cc) : null; } catch { return null; } }; } catch { return () => null; } })();

export function distanceKm(a, b) {
  const r = (d) => (d * Math.PI) / 180;
  const h = Math.sin(r(b.lat - a.lat) / 2) ** 2 + Math.cos(r(a.lat)) * Math.cos(r(b.lat)) * Math.sin(r(b.lng - a.lng) / 2) ** 2;
  return Math.round(12742 * Math.asin(Math.sqrt(h)));
}

// Candidate place words, most likely first: after "nach/in/to", the opening words, other capitalised words.
export function placeCandidates(text) {
  const t = String(text ?? '');
  const out = [];
  const add = (s) => {
    const words = String(s).replace(/[.,;:!?()«»"]+/g, ' ').trim().split(/\s+/).filter(w => w && !/\d/.test(w) && !STOP.has(fold(w)));
    if (!words.length) return;
    const phrase = words.slice(0, 3).join(' ');
    if (phrase.length >= 3 && !out.some(o => fold(o) === fold(phrase))) out.push(phrase);
  };
  for (const m of t.matchAll(/(?:^|\s)(?:nach|to|in|richtung)\s+(\p{L}[\p{L}'’-]+(?:\s+\p{Lu}[\p{L}'’-]+)?)/gu)) add(m[1]);
  const lead = t.trim().match(/^(\p{L}[\p{L}'’-]+)(?:\s+(\p{L}[\p{L}'’-]+))?/u);
  if (lead) { add(lead[1]); if (lead[2] && /^\p{Lu}/u.test(lead[2])) add(`${lead[1]} ${lead[2]}`); }
  for (const m of t.matchAll(/(?:^|[\s,.;:(])(\p{Lu}[\p{L}'’-]{2,})/gu)) add(m[1]);
  return out.slice(0, 5);
}

// How well an airport search result fits the word the customer wrote:
//   3 exact city · 2 whole word in city or airport name ("Rio" → Rio de Janeiro, "Santorini" → Thira airport)
//   1 small typo in a longer name · 0.5 the word is the country ("Kosovo") · 0 no match.
// Never a mere prefix: "Bali" must not become "Balikpapan".
export function matchClass(candidate, p) {
  const c = fold(candidate);
  const city = fold(p.city_name ?? (p.type === 'city' ? p.name : '') ?? '');
  const airport = fold(p.name ?? '');
  const words = (s) => ` ${s.replace(/[^a-z0-9]+/g, ' ').trim()} `;
  if (city && city === c) return 3;
  if ((city && words(city).includes(` ${c} `)) || (p.type === 'airport' && words(airport).includes(` ${c} `))) return 2;
  if (city && c.length >= 6 && Math.abs(city.length - c.length) <= 2 && levenshtein(city, c) <= 2) return 1;
  if (c === fold(regionDe(p.country) ?? '-') || c === fold(regionEn(p.country) ?? '-')) return 0.5;
  return 0;
}

const mentionsCountry = (text, cc) => {
  const f = ` ${fold(text).replace(/[^a-z ]/g, ' ')} `;
  return [regionDe(cc), regionEn(cc)].filter(Boolean).some(n => f.includes(` ${fold(n)} `));
};

export function placeFromDuffel(p, candidate, cls = 3) {
  const cityName = p.city_name ?? p.name;
  const known = resolvePlace(cityName);
  if (known && (!p.country || known.country === p.country)) return { ...known, source: 'list' };
  const iata = p.type === 'airport' ? p.iata_code : (p.airports?.[0] ?? p.iata_code);
  // Found through the airport's name (Santorini → airport in Thira): keep the customer's word as the name.
  const viaAirport = cls === 2 && candidate && !` ${fold(cityName).replace(/[^a-z0-9]+/g, ' ')} `.includes(` ${fold(candidate)} `) && /^[\p{L} '-]+$/u.test(candidate);
  const name = viaAirport ? candidate.replace(/^\p{Ll}/u, (ch) => ch.toUpperCase()) : cityName;
  const aliases = [...new Set([name, cityName, candidate, p.iata_code, p.iata_city_code, iata].filter(Boolean))];
  return { city: fold(name).replace(/ /g, '_'), name, en: name, iata, city_iata: p.iata_city_code ?? (p.type === 'city' ? p.iata_code : null),
    country: p.country, country_name: regionDe(p.country), aliases, lat: p.lat ?? null, lng: p.lng ?? null, source: 'duffel', is_region: viaAirport || undefined };
}

const cache = new Map();
const cached = (key, fn) => { if (!cache.has(key)) cache.set(key, fn().catch(() => null)); return cache.get(key); };
const suggestions = (duffel, q) => cached(`q:${fold(q)}`, async () => (duffel?.placeSuggestions ? duffel.placeSuggestions(q) : []));

// Town → coordinates (Open-Meteo geocoding: free, no key). Only real settlements count.
async function geocode(name) {
  return cached(`g:${fold(name)}`, async () => {
    const res = await fetch(`https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(name)}&count=5&language=de&format=json`, { signal: AbortSignal.timeout(4000) });
    if (!res.ok) return [];
    const json = await res.json();
    return (json.results ?? []).filter(r => /^PPL/.test(r.feature_code ?? 'PPL') && fold(r.name).startsWith(fold(name).slice(0, 4)))
      .map(r => ({ name: r.name, lat: r.latitude, lng: r.longitude, country: r.country_code, country_name: r.country ?? regionDe(r.country_code), region: r.admin1 ?? null, population: r.population ?? 0 }));
  });
}

// The airports around a point, nearest first.
export async function nearestAirports(duffel, point, max = 3) {
  const list = await cached(`n:${point.lat.toFixed(2)},${point.lng.toFixed(2)}`, async () => (duffel?.placeSuggestions ? duffel.placeSuggestions(null, { lat: point.lat, lng: point.lng, radius: 150000 }) : []));
  const seen = new Set();
  return (list ?? []).filter(p => p.type === 'airport' && p.lat != null && !seen.has(p.iata_code) && seen.add(p.iata_code))
    .map(p => ({ iata: p.iata_code, name: p.name, city: resolvePlace(p.city_name ?? '')?.name ?? p.city_name ?? p.name, country: p.country, distance_km: distanceKm(point, { lat: p.lat, lng: p.lng }) }))
    .sort((a, b) => a.distance_km - b.distance_km).slice(0, max);
}

function townPlace(town, airports, candidate) {
  const [a, ...rest] = airports;
  return { city: fold(town.name).replace(/ /g, '_'), name: town.name, en: town.name, iata: a.iata, country: town.country, country_name: town.country_name,
    lat: town.lat, lng: town.lng, region: town.region, airport: a, airport_alternatives: rest,
    aliases: [...new Set([town.name, candidate, a.iata, a.city].filter(Boolean))], source: 'geocode' };
}

// Best place for free text. Returns one of:
//   { place, alternatives, quote }          – found (airport city, or town + nearest airport)
//   { choices, quote }                      – several places share the name: ask the customer
//   null                                    – nothing found
export async function findPlace(text, duffel, { exclude = [], context = '' } = {}) {
  const direct = resolvePlace(text);
  if (direct) return { place: { ...direct, source: 'list' }, alternatives: [] };
  const skip = new Set(exclude.filter(Boolean).map(fold));
  const cands = placeCandidates(text).filter(c => !skip.has(fold(c)));
  const results = await Promise.all(cands.map(c => suggestions(duffel, c).then(list => ({ c, list: list ?? [] }))));
  const hint = `${text} ${context}`;
  for (const { c, list } of results) {
    // A typed airport code ("PRN") matches that airport directly.
    // Only the best kind of match counts: an exact city beats a word match beats a typo (Kochi ≠ Sochi).
    const scored = /^[A-Z]{3}$/.test(c) ? list.filter(p => p.iata_code === c).map(p => ({ p, s: 3 })) : list.map(p => ({ p, s: matchClass(c, p) }));
    const best = Math.max(0, ...scored.map(x => x.s));
    if (!best) continue;
    const hits = scored.filter(x => x.s === best).map(x => x.p);
    const groups = new Map();
    for (const p of hits) { const k = `${fold(p.city_name ?? p.name)}|${p.country}`; if (!groups.has(k)) groups.set(k, p); }
    let options = [...groups.values()];
    if (best === 0.5) options = options.slice(0, 1); // a country name: take its main airport, don't ask
    if (options.length > 1) {
      const named = options.filter(p => mentionsCountry(hint, p.country));
      if (named.length === 1) options = named;
      else return { choices: options.slice(0, 4).map(p => placeFromDuffel(p, c, best)), quote: c };
    }
    return { place: placeFromDuffel(options[0], c, best), alternatives: [], quote: c };
  }
  // No airport by that name: a town without airport? Geocode it and fly to the nearest airport.
  for (const c of cands.slice(0, 3)) {
    const towns = await geocode(c);
    if (!towns?.length) continue;
    const named = towns.filter(t => mentionsCountry(hint, t.country));
    const town = (named.length ? named : towns).sort((a, b) => b.population - a.population)[0];
    const airports = await nearestAirports(duffel, town);
    if (airports.length) return { place: townPlace(town, airports, c), alternatives: [], quote: c };
  }
  return null;
}

// Finds destinations the built-in list does not know.
// 1. Duffel's worldwide airport search: a candidate word only counts when an airport's city (or country) matches it,
//    so words like "Hotel" or "Oktober" never become a destination. Two cities with the same name → ask, don't guess.
// 2. Towns without an airport (Zermatt, Positano …): geocode the town (Open-Meteo, no key), then take the nearest
//    airports from Duffel. The trip then flies to that airport and adds a transfer into town.
import { fold, levenshtein } from '../leash/util.js';
import { byIata, resolvePlace } from './places.js';
import { lookupAirports } from './airport-catalog.js';

const MONTHS = 'januar jan january februar feb february märz maerz march mar april apr mai may juni jun june juli jul july august aug september sep sept oktober okt october oct november nov dezember dez december dec';
const WORDS = `${MONTHS} hotel hotels flug fluege flüge flight flights reise trip ferien urlaub budget chf eur euro franken fr sfr usd gbp extras extra transfer transfers
  person personen people adults erwachsene reisende zweit dritt viert wochenende langes weekend sterne stern stars direktflug direkt nonstop gepäck gepaeck koffer bags
  frau mann freundin freund partner partnerin familie kinder kind max maximal höchstens hoechstens alles zusammen insgesamt total keine kein ohne mit und oder vom von bis ab
  nach im in am an zum zur für fur frag fragen mich mir wenn du unsicher bist stornierbar kostenlos gratis nur ich wir uns möchte moechte will wollen gerne bitte buch buche buchen
  the and to from for with at nights night nächte naechte tage days pro nacht no ask me when uncertain zweifel ablehnen lehn entscheide selbst business economy first class
  günstig guenstig billig teuer schön schoen city stadt land meer strand berge irgendwo irgendwohin warm sonne ist sind mein meine unser unsere bitte maximum mindestens departure departing richtung`.split(/\s+/).filter(Boolean);
const STOP = new Set(WORDS.map(fold));

const regionDe = (() => { try { const dn = new Intl.DisplayNames(['de'], { type: 'region' }); return (cc) => { try { return cc ? dn.of(cc) : null; } catch { return null; } }; } catch { return () => null; } })();
const regionEn = (() => { try { const dn = new Intl.DisplayNames(['en'], { type: 'region' }); return (cc) => { try { return cc ? dn.of(cc) : null; } catch { return null; } }; } catch { return () => null; } })();

export function distanceKm(a, b) {
  const r = (d) => (d * Math.PI) / 180;
  const h = Math.sin(r(b.lat - a.lat) / 2) ** 2 + Math.cos(r(a.lat)) * Math.cos(r(b.lat)) * Math.sin(r(b.lng - a.lng) / 2) ** 2;
  return Math.round(12742 * Math.asin(Math.sqrt(h)));
}

// Keep multiword place names together, regardless of their capitalisation.
// A travel parameter (date, budget, "Hotel", ...) ends the place phrase.
function placePhrase(raw, explicit = false) {
  const words = String(raw).trim().split(/\s+/);
  const kept = [];
  for (const word of words) {
    const w = word.replace(/^[«"(]+|[»").!?]+$/g, '');
    if (!w || /\d|[,;:\n]/.test(w)) break;
    const explicitCode = explicit && kept.length === 0 && /^[a-z]{3}$/i.test(w) &&
      lookupAirports(w).some(p => p.iata_code === w.toUpperCase());
    if (STOP.has(fold(w)) && !explicitCode) break;
    if (!/^[\p{L}'’–-]+$/u.test(w)) break;
    kept.push(w);
    if (kept.length === 7) break;
  }
  return kept.join(' ') || null;
}

export function placeQuery(text, role = 'destination') {
  const t = String(text ?? '');
  const marker = role === 'origin' ? '(?:ab|von|from|departing)' : '(?:nach|to|richtung)';
  const m = t.match(new RegExp(`(?:^|\\s)${marker}\\s+([^,;:\\n]+)`, 'iu'));
  if (m) return placePhrase(m[1], true);
  return role === 'origin' ? null : placePhrase(t.split(/[,;:\n]/)[0]);
}

// Most specific phrase first. Avoid fragments of a known origin in destination lookup.
export function placeCandidates(text) {
  const t = String(text ?? '');
  const out = [];
  const add = (s) => {
    if (!s) return;
    const words = s.split(/\s+/);
    for (let n = words.length; n > 0; n--) {
      const phrase = words.slice(0, n).join(' ');
      if (phrase.length >= 3 && !STOP.has(fold(phrase)) && !out.some(o => fold(o) === fold(phrase))) out.push(phrase);
    }
  };
  const primary = placeQuery(t);
  if (primary && /^[A-Za-z]{3}$/.test(primary) && /(?:^|\s)(?:nach|to|richtung)\s+/i.test(t)) out.push(primary);
  add(primary);
  for (const m of t.matchAll(/(?:^|\s)in\s+([^,;:\n]+)/giu)) add(placePhrase(m[1]));
  for (const m of t.matchAll(/(?:^|[\s,.;:(])(\p{Lu}[\p{L}'’-]{2,}(?:\s+[\p{L}'’-]+){0,5})/gu)) add(placePhrase(m[1]));
  return out.slice(0, 12);
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
  const known = byIata(p.iata_code) ?? resolvePlace(cityName);
  const iata = p.type === 'airport' ? p.iata_code : (p.airports?.[0] ?? p.iata_code);
  // Knowing "London" must never replace an explicitly selected LGW with LHR.
  if (known && (!p.country || known.country === p.country)) return { ...known, iata,
    aliases: [...new Set([...known.aliases, p.name, iata])], airport_name: p.name,
    lat: p.lat ?? null, lng: p.lng ?? null, source: p.source ?? 'duffel' };
  // Found through the airport's name (Santorini → airport in Thira): keep the customer's word as the name.
  const viaAirport = cls === 2 && candidate && !` ${fold(cityName).replace(/[^a-z0-9]+/g, ' ')} `.includes(` ${fold(candidate)} `) && /^[\p{L} '-]+$/u.test(candidate);
  const name = viaAirport ? candidate.replace(/^\p{Ll}/u, (ch) => ch.toUpperCase()) : cityName;
  const aliases = [...new Set([name, cityName, candidate, p.iata_code, p.iata_city_code, iata].filter(Boolean))];
  return { city: fold(name).replace(/ /g, '_'), name, en: name, iata, city_iata: p.iata_city_code ?? (p.type === 'city' ? p.iata_code : null),
    country: p.country, country_name: regionDe(p.country), aliases, airport_name: p.type === 'airport' ? p.name : null,
    lat: p.lat ?? null, lng: p.lng ?? null, source: p.source ?? 'duffel', is_region: viaAirport || undefined };
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
export async function findPlace(text, duffel, { exclude = [], context = '', catalogLookup = lookupAirports } = {}) {
  const skip = new Set(exclude.filter(Boolean).map(fold));
  const exactCode = /^[a-z]{3}$/i.test(String(text).trim()) ? String(text).trim() : null;
  const cands = [...new Set([exactCode, ...placeCandidates(text)].filter(Boolean))].filter(c => !skip.has(fold(c)));
  const hint = `${text} ${context}`;
  const choose = (hits, c, best = 3) => {
    const groups = new Map();
    for (const p of hits) {
      if (skip.has(fold(p.iata_code)) || skip.has(fold(p.city_name)) || skip.has(fold(p.name))) continue;
      const k = p.type === 'airport' ? p.iata_code : `${fold(p.name)}|${p.country}`;
      if (!groups.has(k)) groups.set(k, p);
    }
    let options = [...groups.values()];
    if (!options.length) return null;
    if (best === 0.5) options = options.slice(0, 1);
    const named = options.filter(p => mentionsCountry(hint, p.country));
    if (named.length) options = named;
    if (options.length > 1) return { choices: options.slice(0, 8).map(p => placeFromDuffel(p, c, best)), quote: c };
    return { place: placeFromDuffel(options[0], c, best), alternatives: [], quote: c };
  };
  // The bundled world directory is independent of provider credentials and inventory.
  for (const c of cands) {
    const known = resolvePlace(c);
    let list = catalogLookup(c);
    if (known) {
      list = list.filter(p => p.country === known.country);
      if (!list.length) list = catalogLookup(known.en).filter(p => p.country === known.country);
      if (!list.length) list = catalogLookup(known.iata);
    }
    // A fragment such as "san" in "san unknown" is not the airport code SAN.
    const isCode = exactCode === c || fold(placeQuery(text)) === fold(c) || /^[A-Z]{3}$/.test(c);
    if (!isCode && /^[a-z]{3}$/i.test(c)) list = list.filter(p => p.iata_code !== c.toUpperCase());
    if (list.some(p => p.scheduled_service === true)) list = list.filter(p => p.scheduled_service === true);
    const found = choose(list, c);
    if (found) return found;
    if (known && !skip.has(fold(known.iata)) && !skip.has(fold(known.name))) return { place: { ...known, source: 'list' }, alternatives: [], quote: c };
  }
  const direct = resolvePlace(text);
  if (direct && !skip.has(fold(direct.iata)) && !skip.has(fold(direct.name))) return { place: { ...direct, source: 'list' }, alternatives: [] };
  // Without an airport provider, geocoding alone cannot establish a bookable airport.
  if (!duffel?.placeSuggestions || duffel.mode === 'off') return null;
  const results = await Promise.all(cands.map(c => suggestions(duffel, c).then(list => ({ c, list: list ?? [] }))));
  for (const { c, list } of results) {
    // A typed airport code ("PRN") matches that airport directly.
    // Only the best kind of match counts: an exact city beats a word match beats a typo (Kochi ≠ Sochi).
    const codeHits = /^[a-z]{3}$/i.test(c) ? list.filter(p => p.iata_code === c.toUpperCase()) : [];
    const scored = codeHits.length ? codeHits.map(p => ({ p, s: 3 })) : list.map(p => ({ p, s: matchClass(c, p) }));
    const best = Math.max(0, ...scored.map(x => x.s));
    if (!best) continue;
    const hits = scored.filter(x => x.s === best).map(x => x.p);
    const found = choose(hits, c, best);
    if (found) return found;
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

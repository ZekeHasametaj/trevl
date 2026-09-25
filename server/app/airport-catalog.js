// Offline airport identity lookup. Availability and permission to book are separate checks.
import { readFileSync } from 'node:fs';

const catalog = JSON.parse(readFileSync(new URL('./data/airports.json', import.meta.url), 'utf8'));
export const AIRPORT_CATALOG_INFO = Object.freeze({ ...catalog.info, byType: Object.freeze({ ...catalog.info.byType }) });

const normalize = value => String(value ?? '').normalize('NFKD').replace(/\p{M}/gu, '')
  .toLowerCase().replace(/ß/g, 'ss').replace(/[^\p{L}\p{N}]+/gu, ' ').trim();
const withoutWrappers = value => normalize(value)
  .replace(/^(?:(?:international(?:er|en)? )?(?:airports?|flughafen) )+/, '')
  .replace(/(?: (?:international(?:er|en)?|airports?|flughafen))+$/, '');
const withoutAirportWord = value => normalize(value)
  .replace(/^(?:airports?|flughafen) /, '').replace(/ (?:airports?|flughafen)$/, '');
const codeIndex = new Map(), nameIndex = new Map();
const typePriority = { large_airport: 0, medium_airport: 1, small_airport: 2, seaplane_base: 3, heliport: 4, balloonport: 5 };

for (const row of catalog.airports) {
  const [iata_code, name, city_name, country, lat, lng, airport_type, scheduled_service, aliases = []] = row;
  const airport = Object.freeze({ type: 'airport', name, iata_code, city_name: city_name || name, country, lat, lng,
    airport_type, scheduled_service, source: 'ourairports' });
  codeIndex.set(iata_code, airport);
  // Parenthetical districts ("Sydney (Mascot)") keep the documented city searchable.
  const names = [name, city_name, city_name?.replace(/\s*\([^)]*\)/g, ''), ...aliases].filter(Boolean);
  for (const key of new Set(names.flatMap(value => [normalize(value), withoutAirportWord(value), withoutWrappers(value)]))) {
    if (key.length < 3) continue;
    const matches = nameIndex.get(key) ?? [];
    if (!matches.includes(airport)) matches.push(airport);
    nameIndex.set(key, matches);
  }
}

/** Exact candidate lookup, never a substring/fuzzy search over a user's full sentence.
 * Three-letter inputs are explicit IATA codes, regardless of case. The prose parser
 * must discard stop words before calling: e.g. FOR is also Fortaleza's real code.
 * Ambiguous city names return all matches; callers must not silently choose one.
 */
export function lookupAirports(query) {
  if (typeof query !== 'string' || query.length > 250) return [];
  const key = normalize(query);
  if (key.length < 3) return [];
  const stripped = withoutWrappers(query);
  const code = /^[a-z]{3}$/.test(stripped) ? codeIndex.get(stripped.toUpperCase()) : null;
  if (code) return [code];
  const matches = nameIndex.get(key) ?? nameIndex.get(stripped) ?? [];
  return [...matches].sort((a, b) => Number(b.scheduled_service) - Number(a.scheduled_service) ||
    typePriority[a.airport_type] - typePriority[b.airport_type] || a.iata_code.localeCompare(b.iata_code));
}

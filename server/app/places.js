// Destinations trevl knows by name (German + English + local spelling), with the main airport.
import { fold } from '../leash/util.js';

export const PLACES = [
  { city: 'lisbon', name: 'Lissabon', en: 'Lisbon', iata: 'LIS', country: 'PT', aliases: ['lissabon', 'lisbon', 'lisboa', 'lisbonne'] },
  { city: 'porto', name: 'Porto', en: 'Porto', iata: 'OPO', country: 'PT', aliases: ['porto', 'oporto'] },
  { city: 'barcelona', name: 'Barcelona', en: 'Barcelona', iata: 'BCN', country: 'ES', aliases: ['barcelona'] },
  { city: 'madrid', name: 'Madrid', en: 'Madrid', iata: 'MAD', country: 'ES', aliases: ['madrid'] },
  { city: 'valencia', name: 'Valencia', en: 'Valencia', iata: 'VLC', country: 'ES', aliases: ['valencia'] },
  { city: 'seville', name: 'Sevilla', en: 'Seville', iata: 'SVQ', country: 'ES', aliases: ['sevilla', 'seville'] },
  { city: 'palma', name: 'Palma', en: 'Palma', iata: 'PMI', country: 'ES', aliases: ['palma de mallorca', 'mallorca', 'palma'] },
  { city: 'rome', name: 'Rom', en: 'Rome', iata: 'FCO', country: 'IT', aliases: ['rom', 'rome', 'roma'] },
  { city: 'milan', name: 'Mailand', en: 'Milan', iata: 'MXP', country: 'IT', aliases: ['mailand', 'milan', 'milano'] },
  { city: 'paris', name: 'Paris', en: 'Paris', iata: 'CDG', country: 'FR', aliases: ['paris'] },
  { city: 'nice', name: 'Nizza', en: 'Nice', iata: 'NCE', country: 'FR', aliases: ['nizza', 'nice'] },
  { city: 'london', name: 'London', en: 'London', iata: 'LHR', country: 'GB', aliases: ['london'] },
  { city: 'edinburgh', name: 'Edinburgh', en: 'Edinburgh', iata: 'EDI', country: 'GB', aliases: ['edinburgh'] },
  { city: 'dublin', name: 'Dublin', en: 'Dublin', iata: 'DUB', country: 'IE', aliases: ['dublin'] },
  { city: 'berlin', name: 'Berlin', en: 'Berlin', iata: 'BER', country: 'DE', aliases: ['berlin'] },
  { city: 'amsterdam', name: 'Amsterdam', en: 'Amsterdam', iata: 'AMS', country: 'NL', aliases: ['amsterdam'] },
  { city: 'vienna', name: 'Wien', en: 'Vienna', iata: 'VIE', country: 'AT', aliases: ['wien', 'vienna'] },
  { city: 'prague', name: 'Prag', en: 'Prague', iata: 'PRG', country: 'CZ', aliases: ['prag', 'prague', 'praha'] },
  { city: 'copenhagen', name: 'Kopenhagen', en: 'Copenhagen', iata: 'CPH', country: 'DK', aliases: ['kopenhagen', 'copenhagen'] },
  { city: 'stockholm', name: 'Stockholm', en: 'Stockholm', iata: 'ARN', country: 'SE', aliases: ['stockholm'] },
  { city: 'athens', name: 'Athen', en: 'Athens', iata: 'ATH', country: 'GR', aliases: ['athen', 'athens'] },
  { city: 'new_york', name: 'New York', en: 'New York', iata: 'JFK', country: 'US', aliases: ['new york', 'nyc'] },
  { city: 'pristina', name: 'Pristina', en: 'Pristina', iata: 'PRN', country: 'XK', aliases: ['pristina', 'prishtina', 'priština', 'prishtinë'] },
  { city: 'skopje', name: 'Skopje', en: 'Skopje', iata: 'SKP', country: 'MK', aliases: ['skopje'] },
  { city: 'tirana', name: 'Tirana', en: 'Tirana', iata: 'TIA', country: 'AL', aliases: ['tirana', 'tiranë'] },
  { city: 'belgrade', name: 'Belgrad', en: 'Belgrade', iata: 'BEG', country: 'RS', aliases: ['belgrad', 'belgrade', 'beograd'] },
  { city: 'sarajevo', name: 'Sarajevo', en: 'Sarajevo', iata: 'SJJ', country: 'BA', aliases: ['sarajevo'] },
  { city: 'podgorica', name: 'Podgorica', en: 'Podgorica', iata: 'TGD', country: 'ME', aliases: ['podgorica'] },
  { city: 'zagreb', name: 'Zagreb', en: 'Zagreb', iata: 'ZAG', country: 'HR', aliases: ['zagreb'] },
  { city: 'split', name: 'Split', en: 'Split', iata: 'SPU', country: 'HR', aliases: ['split'] },
  { city: 'dubrovnik', name: 'Dubrovnik', en: 'Dubrovnik', iata: 'DBV', country: 'HR', aliases: ['dubrovnik'] },
  { city: 'ljubljana', name: 'Ljubljana', en: 'Ljubljana', iata: 'LJU', country: 'SI', aliases: ['ljubljana', 'laibach'] },
  { city: 'budapest', name: 'Budapest', en: 'Budapest', iata: 'BUD', country: 'HU', aliases: ['budapest'] },
  { city: 'warsaw', name: 'Warschau', en: 'Warsaw', iata: 'WAW', country: 'PL', aliases: ['warschau', 'warsaw', 'warszawa'] },
  { city: 'krakow', name: 'Krakau', en: 'Krakow', iata: 'KRK', country: 'PL', aliases: ['krakau', 'krakow', 'kraków'] },
  { city: 'bucharest', name: 'Bukarest', en: 'Bucharest', iata: 'OTP', country: 'RO', aliases: ['bukarest', 'bucharest', 'bucuresti', 'bucurești'] },
  { city: 'sofia', name: 'Sofia', en: 'Sofia', iata: 'SOF', country: 'BG', aliases: ['sofia'] },
  { city: 'istanbul', name: 'Istanbul', en: 'Istanbul', iata: 'IST', country: 'TR', aliases: ['istanbul'] },
  { city: 'antalya', name: 'Antalya', en: 'Antalya', iata: 'AYT', country: 'TR', aliases: ['antalya'] },
  { city: 'thessaloniki', name: 'Thessaloniki', en: 'Thessaloniki', iata: 'SKG', country: 'GR', aliases: ['thessaloniki', 'saloniki'] },
  { city: 'oslo', name: 'Oslo', en: 'Oslo', iata: 'OSL', country: 'NO', aliases: ['oslo'] },
  { city: 'helsinki', name: 'Helsinki', en: 'Helsinki', iata: 'HEL', country: 'FI', aliases: ['helsinki'] },
  { city: 'brussels', name: 'Brüssel', en: 'Brussels', iata: 'BRU', country: 'BE', aliases: ['brüssel', 'bruessel', 'brussels', 'bruxelles'] },
  { city: 'munich', name: 'München', en: 'Munich', iata: 'MUC', country: 'DE', aliases: ['münchen', 'muenchen', 'munich'] },
  { city: 'hamburg', name: 'Hamburg', en: 'Hamburg', iata: 'HAM', country: 'DE', aliases: ['hamburg'] },
  { city: 'malaga', name: 'Málaga', en: 'Malaga', iata: 'AGP', country: 'ES', aliases: ['malaga', 'málaga'] },
  { city: 'naples', name: 'Neapel', en: 'Naples', iata: 'NAP', country: 'IT', aliases: ['neapel', 'naples', 'napoli'] },
  { city: 'venice', name: 'Venedig', en: 'Venice', iata: 'VCE', country: 'IT', aliases: ['venedig', 'venice', 'venezia'] },
  { city: 'florence', name: 'Florenz', en: 'Florence', iata: 'FLR', country: 'IT', aliases: ['florenz', 'florence', 'firenze'] },
  { city: 'marrakesh', name: 'Marrakesch', en: 'Marrakesh', iata: 'RAK', country: 'MA', aliases: ['marrakesch', 'marrakesh', 'marrakech'] },
  { city: 'dubai', name: 'Dubai', en: 'Dubai', iata: 'DXB', country: 'AE', aliases: ['dubai'] },
  { city: 'reykjavik', name: 'Reykjavík', en: 'Reykjavik', iata: 'KEF', country: 'IS', aliases: ['reykjavik', 'reykjavík'] },
  { city: 'bangkok', name: 'Bangkok', en: 'Bangkok', iata: 'BKK', country: 'TH', aliases: ['bangkok'] },
  { city: 'tokyo', name: 'Tokio', en: 'Tokyo', iata: 'HND', country: 'JP', aliases: ['tokio', 'tokyo'] },
  // Islands and regions whose airport has another name (Bali → Denpasar). region: hotels are searched around the airport.
  { city: 'bali', name: 'Bali', en: 'Bali', iata: 'DPS', country: 'ID', aliases: ['bali', 'denpasar'], is_region: true },
  { city: 'crete', name: 'Kreta', en: 'Crete', iata: 'HER', country: 'GR', aliases: ['kreta', 'crete', 'heraklion', 'iraklion'], is_region: true },
  { city: 'sicily', name: 'Sizilien', en: 'Sicily', iata: 'CTA', country: 'IT', aliases: ['sizilien', 'sicily', 'sicilia', 'catania'], is_region: true },
  { city: 'sardinia', name: 'Sardinien', en: 'Sardinia', iata: 'CAG', country: 'IT', aliases: ['sardinien', 'sardinia', 'sardegna', 'cagliari'], is_region: true },
  { city: 'tenerife', name: 'Teneriffa', en: 'Tenerife', iata: 'TFS', country: 'ES', aliases: ['teneriffa', 'tenerife'], is_region: true },
  { city: 'gran_canaria', name: 'Gran Canaria', en: 'Gran Canaria', iata: 'LPA', country: 'ES', aliases: ['gran canaria', 'las palmas'], is_region: true },
  { city: 'ibiza', name: 'Ibiza', en: 'Ibiza', iata: 'IBZ', country: 'ES', aliases: ['ibiza'], is_region: true },
  { city: 'santorini', name: 'Santorini', en: 'Santorini', iata: 'JTR', country: 'GR', aliases: ['santorini', 'thira', 'fira'], is_region: true },
  { city: 'mykonos', name: 'Mykonos', en: 'Mykonos', iata: 'JMK', country: 'GR', aliases: ['mykonos'], is_region: true },
  { city: 'rhodes', name: 'Rhodos', en: 'Rhodes', iata: 'RHO', country: 'GR', aliases: ['rhodos', 'rhodes'], is_region: true },
  { city: 'corsica', name: 'Korsika', en: 'Corsica', iata: 'AJA', country: 'FR', aliases: ['korsika', 'corsica', 'ajaccio'], is_region: true },
  { city: 'madeira', name: 'Madeira', en: 'Madeira', iata: 'FNC', country: 'PT', aliases: ['madeira', 'funchal'], is_region: true },
  { city: 'algarve', name: 'Algarve', en: 'Algarve', iata: 'FAO', country: 'PT', aliases: ['algarve', 'faro'], is_region: true },
  { city: 'malta', name: 'Malta', en: 'Malta', iata: 'MLA', country: 'MT', aliases: ['malta', 'valletta'], is_region: true },
  { city: 'cyprus', name: 'Zypern', en: 'Cyprus', iata: 'LCA', country: 'CY', aliases: ['zypern', 'cyprus', 'larnaca'], is_region: true },
  { city: 'maldives', name: 'Malediven', en: 'Maldives', iata: 'MLE', country: 'MV', aliases: ['malediven', 'maldives'], is_region: true },
  { city: 'mauritius', name: 'Mauritius', en: 'Mauritius', iata: 'MRU', country: 'MU', aliases: ['mauritius'], is_region: true },
  { city: 'zanzibar', name: 'Sansibar', en: 'Zanzibar', iata: 'ZNZ', country: 'TZ', aliases: ['sansibar', 'zanzibar'], is_region: true },
  { city: 'phuket', name: 'Phuket', en: 'Phuket', iata: 'HKT', country: 'TH', aliases: ['phuket'] },
  { city: 'zurich', name: 'Zürich', en: 'Zurich', iata: 'ZRH', country: 'CH', aliases: ['zürich', 'zurich', 'zuerich'], home: true },
  { city: 'geneva', name: 'Genf', en: 'Geneva', iata: 'GVA', country: 'CH', aliases: ['genf', 'geneva', 'geneve', 'genève'], home: true },
  { city: 'basel', name: 'Basel', en: 'Basel', iata: 'BSL', country: 'CH', aliases: ['basel'], home: true },
];

export const byCity = (c) => PLACES.find(p => p.city === c) ?? null;
export const byIata = (i) => PLACES.find(p => p.iata === i) ?? null;

// All place mentions in order of appearance.
export function findPlaces(text) {
  const f = ` ${fold(text).replace(/[^a-z0-9 ]/g, ' ')} `;
  const hits = [];
  for (const p of PLACES) {
    for (const a of p.aliases) {
      const idx = f.indexOf(` ${fold(a)} `);
      if (idx >= 0) { hits.push({ place: p, index: idx, alias: a }); break; }
    }
  }
  return hits.sort((x, y) => x.index - y.index);
}

export function resolvePlace(name) {
  if (!name) return null;
  const f = fold(name);
  return PLACES.find(p => p.aliases.some(a => fold(a) === f) || fold(p.en) === f || p.iata.toLowerCase() === f) ?? null;
}

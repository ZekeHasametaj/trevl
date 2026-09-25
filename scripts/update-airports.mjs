// Rebuild the bundled, key-free airport directory from OurAirports' public-domain data.
import { createHash, randomUUID } from 'node:crypto';
import { mkdir, readFile, rename, unlink, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';

export const SOURCE_URL = 'https://davidmegginson.github.io/ourairports-data/airports.csv';
const TARGET = new URL('../server/app/data/airports.json', import.meta.url);
const TYPES = new Set(['small_airport', 'medium_airport', 'large_airport', 'heliport', 'seaplane_base', 'balloonport']);
const FIELDS = ['iata_code', 'name', 'city_name', 'country', 'lat', 'lng', 'airport_type', 'scheduled_service', 'aliases'];

// Source keywords mix alternative names with identifiers and historical commentary.
// Keep bounded, exact name aliases; never interpret keywords as executable instructions.
const keywordAliases = value => [...new Set(value.split(/[,;]/).map(s => s.trim()).filter(s =>
  s.length >= 4 && s.length <= 100 && /\p{L}/u.test(s) && !/\d/.test(s) &&
  !/^[A-Z]{2,4}$/.test(s) && /^[\p{L}\p{M}\s.'’()\-/–]+$/u.test(s) &&
  s.split(/\s+/).length <= 8 && !/\b(?:formerly|closed|replaced|renamed|abandoned|demolished|obsolete|since|until)\b/i.test(s)
))];

// CSV parsing includes quoted commas, escaped quotes and embedded newlines.
export function parseCsv(text) {
  const rows = [];
  let row = [], cell = '', quoted = false, endedQuote = false;
  const input = text.replace(/^\uFEFF/, '');
  for (let i = 0; i < input.length; i++) {
    const ch = input[i];
    if (quoted) {
      if (ch === '"' && input[i + 1] === '"') { cell += '"'; i++; }
      else if (ch === '"') { quoted = false; endedQuote = true; }
      else cell += ch;
    } else if (ch === '"' && !cell && !endedQuote) quoted = true;
    else if (ch === ',' || ch === '\n' || ch === '\r') {
      row.push(cell); cell = ''; endedQuote = false;
      if (ch !== ',') {
        if (ch === '\r' && input[i + 1] === '\n') i++;
        if (row.some(Boolean)) rows.push(row);
        row = [];
      }
    } else {
      if (endedQuote || ch === '"') throw new Error('Invalid CSV quoting; catalog was not replaced.');
      cell += ch;
    }
  }
  if (quoted) throw new Error('Unclosed CSV quote; catalog was not replaced.');
  if (cell || row.length || endedQuote) { row.push(cell); rows.push(row); }
  return rows;
}

export function buildCatalog(csv, fetchedAt = new Date().toISOString()) {
  const [header, ...rows] = parseCsv(csv);
  const required = ['type', 'name', 'latitude_deg', 'longitude_deg', 'iso_country', 'municipality', 'scheduled_service', 'iata_code', 'keywords'];
  if (!header || required.some(name => !header.includes(name)) || new Set(header).size !== header.length) {
    throw new Error('Unexpected OurAirports CSV header; catalog was not replaced.');
  }
  const indices = Object.fromEntries(required.map(name => [name, header.indexOf(name)]));
  const seen = new Set(), airports = [], byType = {};
  for (const row of rows) {
    if (row.length !== header.length) throw new Error('Unexpected CSV row length; catalog was not replaced.');
    const get = name => row[indices[name]].trim();
    const type = get('type'), iata = get('iata_code');
    if (type === 'closed' || !/^[A-Z]{3}$/.test(iata)) continue;
    const name = get('name'), city = get('municipality'), country = get('iso_country');
    const rawLat = get('latitude_deg'), rawLng = get('longitude_deg');
    const lat = Number(rawLat), lng = Number(rawLng), scheduled = get('scheduled_service');
    if (!TYPES.has(type) || !name || !/^[A-Z]{2}$/.test(country) || !rawLat || !rawLng ||
      !Number.isFinite(lat) || Math.abs(lat) > 90 || !Number.isFinite(lng) || Math.abs(lng) > 180 ||
      !['yes', 'no'].includes(scheduled) || seen.has(iata)) {
      throw new Error(`Invalid or duplicate airport ${iata}; catalog was not replaced.`);
    }
    seen.add(iata);
    byType[type] = (byType[type] ?? 0) + 1;
    airports.push([iata, name, city || null, country, lat, lng, type, scheduled === 'yes', keywordAliases(get('keywords'))]);
  }
  // Catch partial/error downloads and unexpected upstream schema changes before writing.
  if (airports.length < 5000 || airports.length > 20000 || ['BNX', 'LGW', 'LHR', 'ZRH', 'JFK', 'HND', 'SYD'].some(code => !seen.has(code))) {
    throw new Error('Airport catalog coverage check failed; catalog was not replaced.');
  }
  airports.sort((a, b) => a[0].localeCompare(b[0], 'en'));
  return {
    info: {
      schemaVersion: 2, source: SOURCE_URL, license: 'Public domain', licenseUrl: 'https://ourairports.com/data/',
      fetchedAt, sourceSha256: createHash('sha256').update(csv).digest('hex'), count: airports.length,
      scheduledCount: airports.filter(a => a[7]).length, aliasCount: airports.reduce((sum, a) => sum + a[8].length, 0), byType,
      coverage: 'All non-closed OurAirports records with an uppercase three-letter IATA code, including heliports and seaplane bases.',
    },
    fields: FIELDS,
    airports,
  };
}

async function main() {
  const args = process.argv.slice(2);
  if (args.length && (args.length !== 2 || args[0] !== '--csv')) throw new Error('Usage: node scripts/update-airports.mjs [--csv /path/to/airports.csv]');
  let csv;
  if (args.length) csv = await readFile(args[1], 'utf8');
  else {
    const response = await fetch(SOURCE_URL, { signal: AbortSignal.timeout(60000) });
    if (!response.ok) throw new Error(`OurAirports download failed (${response.status}); catalog was not replaced.`);
    csv = await response.text();
  }
  if (Buffer.byteLength(csv) > 50000000) throw new Error('Unexpected download size; catalog was not replaced.');
  const catalog = buildCatalog(csv);
  const target = fileURLToPath(TARGET), temporary = `${target}.${randomUUID()}.tmp`;
  await mkdir(fileURLToPath(new URL('.', TARGET)), { recursive: true });
  const output = `{"info":${JSON.stringify(catalog.info)},"fields":${JSON.stringify(catalog.fields)},"airports":[\n${catalog.airports.map(row => JSON.stringify(row)).join(',\n')}\n]}\n`;
  try {
    await writeFile(temporary, output, { flag: 'wx' });
    await rename(temporary, target); // Atomic replacement: a failed refresh preserves the existing catalog.
  } finally { await unlink(temporary).catch(error => { if (error.code !== 'ENOENT') throw error; }); }
  console.log(`Updated ${catalog.info.count} IATA airports (${catalog.info.scheduledCount} with scheduled service). Source SHA-256: ${catalog.info.sourceSha256}`);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch(error => { console.error(error.message); process.exitCode = 1; });
}

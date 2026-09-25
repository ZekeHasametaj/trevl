import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { AIRPORT_CATALOG_INFO, lookupAirports } from '../server/app/airport-catalog.js';
import { parseCsv, buildCatalog } from '../scripts/update-airports.mjs';

test('worldwide IATA lookup works offline and preserves the explicitly requested airport', () => {
  for (const [code, country] of [['BNX', 'BA'], ['LGW', 'GB'], ['LHR', 'GB'], ['HND', 'JP'], ['SYD', 'AU'], ['CPT', 'ZA'], ['LAX', 'US'], ['GRU', 'BR']]) {
    const matches = lookupAirports(code.toLowerCase());
    assert.equal(matches.length, 1, code);
    assert.equal(matches[0].iata_code, code);
    assert.equal(matches[0].country, country);
  }
  assert.equal(lookupAirports('Flughafen LGW')[0].iata_code, 'LGW');
  assert.equal(lookupAirports('London Gatwick Airport')[0].iata_code, 'LGW');
  assert.deepEqual(lookupAirports('London International').map(a => a.iata_code), ['YXU'], 'an explicit airport name is more precise than the city');
  assert.equal(lookupAirports('Kuala Lumpur International')[0].iata_code, 'KUL');
  assert.equal(lookupAirports('Banja-Luka Flughafen')[0].iata_code, 'BNX');
  assert.equal(lookupAirports('izmir')[0].iata_code, 'ADB', 'source keyword resolves the travel city despite municipality Gaziemir');
  assert.equal(lookupAirports('İzmir')[0].iata_code, 'ADB');
  assert.ok(lookupAirports('New York City').some(a => a.iata_code === 'EWR'));
});

test('exact city and name normalization supports accents without accepting misleading prefixes', () => {
  assert.ok(lookupAirports('sao paulo').some(airport => airport.iata_code === 'GRU'));
  assert.ok(lookupAirports('  CAPE---TOWN  ').some(airport => airport.iata_code === 'CPT'));
  assert.ok(lookupAirports('Sydney').some(airport => airport.iata_code === 'SYD'));
  assert.equal(lookupAirports('Balikp').length, 0);
  assert.ok(!lookupAirports('Bali').some(airport => airport.iata_code === 'BPN'));
  assert.equal(lookupAirports('Banja Lukaville').length, 0);
  for (const invalid of ['', 'in', 'to', 'Flughafen', 'Airport International', null, 123, {}, 'Bitte einen Flug nach LGW buchen']) {
    assert.deepEqual(lookupAirports(invalid), []);
  }
});

test('same-city alternatives remain distinct and scheduled service sorts before general aviation', () => {
  const london = lookupAirports('London');
  assert.ok(london.some(a => a.iata_code === 'LGW'));
  assert.ok(london.some(a => a.iata_code === 'LHR'));
  assert.ok(london.some(a => a.country === 'CA'), 'same name in another country remains ambiguous');
  assert.equal(new Set(london.map(a => a.iata_code)).size, london.length);
  const firstUnscheduled = london.findIndex(a => !a.scheduled_service);
  assert.ok(firstUnscheduled > 0);
  assert.ok(london.slice(firstUnscheduled).every(a => !a.scheduled_service));
  const newYork = lookupAirports('New York');
  assert.equal(newYork[0].iata_code, 'JFK');
  assert.ok(newYork.some(a => a.airport_type === 'heliport'), 'IATA-coded heliports are retained and labelled');
});

test('bundled dataset validates every airport and records its provenance', () => {
  const data = JSON.parse(readFileSync(new URL('../server/app/data/airports.json', import.meta.url), 'utf8'));
  assert.equal(AIRPORT_CATALOG_INFO.count, data.airports.length);
  assert.ok(data.airports.length > 8000);
  assert.match(AIRPORT_CATALOG_INFO.sourceSha256, /^[a-f0-9]{64}$/);
  assert.equal(AIRPORT_CATALOG_INFO.license, 'Public domain');
  assert.ok(Number.isFinite(Date.parse(AIRPORT_CATALOG_INFO.fetchedAt)));
  const codes = new Set();
  for (const [iata, name, city, country, lat, lng, type, scheduled, aliases] of data.airports) {
    assert.match(iata, /^[A-Z]{3}$/);
    assert.ok(!codes.has(iata)); codes.add(iata);
    assert.equal(typeof name, 'string'); assert.ok(name.length > 0);
    assert.ok(city === null || typeof city === 'string');
    assert.match(country, /^[A-Z]{2}$/);
    assert.ok(Number.isFinite(lat) && Math.abs(lat) <= 90);
    assert.ok(Number.isFinite(lng) && Math.abs(lng) <= 180);
    assert.ok(['small_airport', 'medium_airport', 'large_airport', 'heliport', 'seaplane_base', 'balloonport'].includes(type));
    assert.equal(typeof scheduled, 'boolean');
    assert.ok(Array.isArray(aliases) && aliases.every(alias => typeof alias === 'string' && alias.length >= 4 && alias.length <= 100));
  }
  assert.equal(AIRPORT_CATALOG_INFO.scheduledCount, data.airports.filter(a => a[7]).length);
});

test('updater handles real CSV quoting and rejects partial or malformed downloads', () => {
  assert.deepEqual(parseCsv('iata,name\r\nBNX,"Airport, with ""quotes""\nand newline"\r\n'), [['iata', 'name'], ['BNX', 'Airport, with "quotes"\nand newline']]);
  assert.throws(() => parseCsv('iata,name\nBNX,"unfinished'), /Unclosed CSV quote/);
  assert.throws(() => buildCatalog('<html>provider error</html>'), /header/);
  const header = 'type,name,latitude_deg,longitude_deg,iso_country,municipality,scheduled_service,iata_code,keywords\n';
  const row = 'large_airport,Test,1,2,CH,Town,yes,BNX,\n';
  assert.throws(() => buildCatalog(header + row), /coverage check/);
  assert.throws(() => buildCatalog(header + row + row), /Invalid or duplicate airport BNX/);
  assert.throws(() => buildCatalog(header + 'large_airport,Test,99,2,CH,Town,yes,BNX,\n'), /Invalid or duplicate airport BNX/);
});

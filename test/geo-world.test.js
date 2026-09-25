import test from 'node:test';
import assert from 'node:assert/strict';
import { findPlace, placeCandidates, placeQuery } from '../server/app/geo.js';

const offline = { mode: 'off', placeSuggestions: async () => { throw new Error('Unexpected provider lookup'); } };

test('world directory works without flight-provider access and keeps requested airports', async () => {
  for (const iata of ['BNX', 'LGW', 'NRT', 'HND', 'EZE', 'SJO', 'ADB', 'KUL', 'SFO', 'CPT', 'AKL', 'JFK']) {
    for (const query of [iata, iata.toLowerCase(), `Flughafen ${iata}`]) {
      const r = await findPlace(query, offline);
      assert.equal(r?.place?.iata, iata, query);
      assert.equal(r.place.source, 'ourairports');
    }
  }
  assert.equal((await findPlace('London Gatwick', offline)).place.iata, 'LGW');
  assert.equal((await findPlace('Flughafen Banja Luka', offline)).place.name, 'Banja Luka');
});

test('multiword lowercase places and explicit airport codes survive parsing; prose does not become a route', async () => {
  assert.equal(placeQuery('ab rio de janeiro nach san jose 5.-8. Oktober', 'origin'), 'rio de janeiro');
  assert.equal(placeQuery('ab rio de janeiro nach san jose 5.-8. Oktober'), 'san jose');
  assert.equal(placeCandidates('flug nach rio de janeiro 5.-8. Oktober')[0], 'rio de janeiro');
  assert.equal(placeQuery('Ab Zürich', 'destination'), null);
  assert.equal(placeQuery('nach ist 5.-8. Oktober'), 'ist');
  assert.equal((await findPlace('nach ist 5.-8. Oktober', offline)).place.iata, 'IST');
  assert.deepEqual(placeCandidates('mein budget IST BIS MAX 500 CHF'), []);
  assert.equal(await findPlace('mein budget IST BIS MAX 500 CHF', offline), null);
  assert.equal(await findPlace('nach san xyzunbekannt', offline), null, 'a word fragment cannot turn into SAN');
  assert.equal(await findPlace('Banja Lukaville', offline), null);
});

test('same-city airports remain distinct and country hints narrow ambiguity without guessing', async () => {
  const rio = await findPlace('rio de janeiro', offline);
  assert.ok(rio.choices.some(p => p.iata === 'GIG'));
  assert.ok(rio.choices.some(p => p.iata === 'SDU'));
  const london = await findPlace('London', offline, { context: 'London in Grossbritannien' });
  assert.ok(london.choices.some(p => p.iata === 'LHR'));
  assert.ok(london.choices.some(p => p.iata === 'LGW'));
  // Intl.DisplayNames supplies "Vereinigtes Königreich"; use the actual supported country hint.
  const uk = await findPlace('London', offline, { context: 'United Kingdom' });
  assert.ok(uk.choices.every(p => p.country === 'GB'));
  assert.equal((await findPlace('London International', offline)).place.iata, 'YXU');
});

test('unknown destination cannot fall back to the named origin while provider is off', async () => {
  const found = await findPlace('Ab Zürich nach Nirgendwohausen', offline, { exclude: ['Zürich', 'Zurich', 'ZRH'] });
  assert.equal(found, null);
});

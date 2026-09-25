import test from 'node:test';
import assert from 'node:assert/strict';
import { buildTripResult, bookingEnvironment } from '../web/trip-result.js';

const mandate = { mandate_id: 'M', version: 2, status: 'active', trip: { kinds: ['flight', 'hotel', 'transfer'] } };
const feed = [
  { type: 'agent.started', run_id: 'R', mandate_id: 'M' },
  { type: 'agent.finished', run_id: 'R', stopped: false },
];
function auth(id, kind, status, chf, extra = {}) {
  return { authorization_id: id, status, authorization: { mandate_id: 'M', travel: { kind, title: `${kind} offer` } },
    decision: { mandate_version: 2, facts: { amount_chf: chf }, summary: 'Das bestätigte Preislimit wurde überschritten.' }, ...extra };
}
const booked = (id, kind, chf, extra = {}) => auth(id, kind, 'approved', chf, {
  booking: { provider: 'demo', booking_reference: `REF-${id}` }, ...extra,
});
const view = overrides => buildTripResult({ mandate, feed, summary: { mandate_id: 'M', free_after_pending: 600 }, ...overrides });

test('final result shows confirmed bookings, providers, reference data and actual booked total', () => {
  const bookings = [booked('f', 'flight', 200), booked('h', 'hotel', 170), booked('t', 'transfer', 30)];
  const r = view({ auths: [...bookings, auth('rejected', 'flight', 'declined', 550)] });
  assert.equal(r.title, 'Alles gebucht');
  assert.equal(r.bookedCount, 3);
  assert.equal(r.bookedAmount, 400);
  assert.equal(r.rejectedCount, 1);
  assert.equal(r.freeAmount, 600);
  assert.equal(r.rows[0].bookings[0].booking.booking_reference, 'REF-f');
  assert.equal(bookingEnvironment(r.rows[0].bookings[0].booking), 'Demo-Buchung');
  assert.match(bookingEnvironment({ provider: 'duffel' }), /kein echtes Ticket/);
  assert.match(bookingEnvironment({ provider: 'liteapi' }), /kein echter Aufenthalt/);
});

test('declined flight summary includes reason and downstream categories remain unsearched', () => {
  const r = view({ auths: [auth('one', 'flight', 'declined', 350), auth('two', 'flight', 'expired', 370)],
    block: { category: 'flight', message: 'Kein passender Flug gefunden.' } });
  assert.equal(r.title, 'Keine Buchung – Angebote abgelehnt');
  assert.equal(r.bookedAmount, 0);
  assert.equal(r.rows[0].state, 'declined');
  assert.match(r.rows[0].reason, /Preislimit/);
  assert.equal(r.rows[0].lastAttempt.authorization_id, 'two');
  assert.equal(r.rows[1].state, 'skipped');
  assert.match(r.rows[1].reason, /Flug/);
  assert.equal(r.rows[2].state, 'skipped');
  assert.equal(r.canAdjust, true);
});

test('a previous confirmed flight survives an adjusted hotel search; old rejections and other trips stay out', () => {
  const r = view({ auths: [booked('flight', 'flight', 200, { decision: { mandate_version: 1, facts: { amount_chf: 200 } } }),
    auth('old', 'hotel', 'declined', 300, { decision: { mandate_version: 1 } }), auth('new', 'hotel', 'declined', 400),
    booked('unrelated', 'hotel', 999, { authorization: { mandate_id: 'OTHER', travel: { kind: 'hotel' } } })],
    block: { category: 'hotel', message: 'Kein Hotel gefunden.' } });
  assert.equal(r.title, 'Teilweise gebucht');
  assert.equal(r.bookedAmount, 200);
  assert.equal(r.bookedCount, 1);
  assert.equal(r.rejectedCount, 1);
  assert.equal(r.rows[1].lastAttempt.authorization_id, 'new');
  assert.equal(r.rows[2].state, 'skipped');
});

test('permission alone is never shown as a booking and its money stays separately bound', () => {
  const r = view({ auths: [auth('approved', 'flight', 'approved', 200)], block: { category: 'flight' } });
  assert.equal(r.title, 'Buchung noch nicht bestätigt');
  assert.equal(r.bookedCount, 0);
  assert.equal(r.bookedAmount, 0);
  assert.equal(r.boundAmount, 200);
  assert.equal(r.rows[0].state, 'unconfirmed');
  assert.equal(r.canAdjust, false);
});

test('uncertain booking survives a server restart and late confirmation replaces the warning truthfully', () => {
  const stoppedFeed = [feed[0], { type: 'agent.say', kind: 'warn', authorization_id: 'u', booking_unknown: true, text: 'Anbieterstatus unbekannt.' },
    { ...feed[1], stopped: true }];
  const r = view({ auths: [auth('u', 'flight', 'approved', 200)], feed: stoppedFeed });
  assert.equal(r.title, 'Buchungsausgang unklar');
  assert.equal(r.canAdjust, false);
  const resolved = view({ auths: [booked('u', 'flight', 200)], feed: stoppedFeed });
  assert.equal(resolved.bookedAmount, 200);
  assert.equal(resolved.rows[0].state, 'booked');
  assert.equal(resolved.uncertain.length, 0);
  assert.equal(resolved.explanation, undefined);
});

test('a running retry hides the stale final summary, a stop in flight remains provisional', () => {
  const fresh = [...feed, { type: 'agent.started', run_id: 'R2', mandate_id: 'M' }];
  assert.equal(view({ feed: fresh, agent: { mandate_id: 'M', id: 'R2', running: true }, auths: [booked('f', 'flight', 200)] }), null);
  const r = view({ feed: fresh, agent: { mandate_id: 'M', id: 'R2', stopped: true, done: false } });
  assert.equal(r.title, 'Agent stoppt – Zwischenstand');
  assert.equal(r.settling, true);
  assert.equal(r.canAdjust, false);
});

test('pending, empty search and technical failures do not masquerade as declines', () => {
  const waiting = view({ auths: [auth('p', 'flight', 'pending', 250)] });
  assert.equal(waiting.title, 'Freigabe noch offen');
  assert.equal(waiting.rows[0].state, 'pending');
  assert.equal(waiting.boundAmount, 250);
  assert.equal(waiting.rejectedCount, 0);
  const empty = view({ block: { category: 'flight', message: 'Keine Angebote gefunden.' } });
  assert.equal(empty.rows[0].state, 'not_found');
  assert.equal(empty.rejectedCount, 0);
  const failed = view({ feed: [feed[0], { type: 'agent.say', kind: 'warn', text: 'Anbieter nicht erreichbar.' }, { ...feed[1], stopped: true }] });
  assert.equal(failed.title, 'Durchlauf gestoppt');
  assert.equal(failed.explanation, 'Anbieter nicht erreichbar.');
  assert.ok(failed.rows.every(r => r.state === 'not_booked'));
});

test('duplicate data never doubles money; unknown booking amounts remain unknown', () => {
  const a = booked('f', 'flight', 200);
  assert.equal(view({ auths: [a, a] }).bookedAmount, 200);
  const unknown = view({ auths: [booked('f', 'flight', null)] });
  assert.equal(unknown.bookedAmount, null);
});

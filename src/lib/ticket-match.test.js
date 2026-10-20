import test from 'node:test';
import assert from 'node:assert/strict';
import { similarity, matchEvent, matchTier, detectMismatch } from './ticket-match.js';

const HOUR = 3600000;
const now = new Date('2026-10-20T12:00:00Z');
const at = (h) => new Date(now.getTime() + h * HOUR).toISOString();
const events = [
  {
    id: 'a',
    title: 'Neon Rewind: Noughties Night',
    venue: 'The Foundry Rooms',
    startsAt: at(5),
    endsAt: at(12),
    tiers: [
      { id: 'a1', name: 'General release', faceValuePence: 1200 },
      { id: 'a2', name: 'Fast track', faceValuePence: 1800 },
    ],
  },
  {
    id: 'b',
    title: 'Bassline Sessions',
    venue: 'Warehouse Nine',
    startsAt: at(54),
    endsAt: at(61),
    tiers: [{ id: 'b1', name: 'General release', faceValuePence: 1500 }],
  },
];
const x = (o) => ({
  eventName: null,
  venue: null,
  startsAt: null,
  ticketType: null,
  faceValuePence: null,
  ticketRef: null,
  confidence: {},
  ...o,
});

test('similarity ignores case, punctuation and filler words', () => {
  assert.equal(similarity('NEON REWIND: noughties night!', 'Neon Rewind: Noughties Night'), 1);
  assert.equal(similarity('Totally different', 'Neon Rewind'), 0);
});

test('matchEvent picks the right event from a messy name + venue', () => {
  const m = matchEvent(x({ eventName: 'Neon Rewind Noughties', venue: 'Foundry Rooms' }), events);
  assert.equal(m?.event.id, 'a');
});

test('matchEvent returns null for an event we do not list', () => {
  assert.equal(matchEvent(x({ eventName: 'Cosmic Carnival', venue: 'Elsewhere Hall' }), events), null);
});

test('matchTier finds the ticket type by name', () => {
  assert.equal(matchTier('Fast Track entry', events[0])?.id, 'a2');
  assert.equal(matchTier('mystery', events[0]), null);
  assert.equal(matchTier(null, events[0]), null);
});

test('clean ticket raises no flags', () => {
  assert.deepEqual(
    detectMismatch({
      extracted: x({
        eventName: 'Neon Rewind Noughties Night',
        venue: 'The Foundry Rooms',
        startsAt: events[0].startsAt,
        faceValuePence: 1200,
      }),
      event: events[0],
      tier: events[0].tiers[0],
      now,
    }),
    [],
  );
});

test('passed date is flagged', () => {
  const past = { ...events[0], startsAt: at(-30), endsAt: at(-24) };
  const flags = detectMismatch({ extracted: x({ startsAt: past.startsAt }), event: past, now });
  assert.ok(flags.some((f) => f.code === 'date_passed'));
});

test('wrong event name, venue, date and price are each flagged', () => {
  const flags = detectMismatch({
    extracted: x({ eventName: 'Cosmic Carnival', venue: 'Elsewhere Hall', startsAt: at(80), faceValuePence: 999 }),
    event: events[0],
    tier: events[0].tiers[0],
    now,
  });
  assert.equal(flags.filter((f) => f.code === 'details_mismatch').length, 4);
});

test('missing fields are not treated as mismatches', () => {
  assert.deepEqual(detectMismatch({ extracted: x({}), event: events[0], tier: events[0].tiers[0], now }), []);
});

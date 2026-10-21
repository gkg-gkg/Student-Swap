import { test } from 'node:test';
import assert from 'node:assert/strict';
import { setup, STUDENT, ADMIN, DAY } from './helpers.mjs';

test('admin creates an event at a listed venue; buyers see it with tiers and stats', async () => {
  const t = await setup();
  const e = await t.createEvent();
  assert.equal(e.venue, 'Rosies'); // the venue list's name wins over free text
  assert.equal(e.venueId, 'rosies-birmingham');
  assert.deepEqual(
    e.tiers.map((x) => x.faceValuePence),
    [800, 1200],
  );
  assert.equal(e.tone, 'coral');

  const list = (await t.call('GET', '/events')).body;
  assert.equal(list.length, 1);
  assert.equal(list[0].faceValuePence, 800);
  assert.equal(list[0].ticketsAvailable, 0);
  assert.equal(list[0].lowestPricePence, 0);
  assert.equal(list[0].sellingFast, false);

  const one = (await t.call('GET', `/events/${e.id}`)).body;
  assert.equal(one.event.id, e.id);
  assert.deepEqual(one.listings, []);
  assert.equal(one.alertOn, false);
});

test('an "Other venue" is free text; a venue from another city is refused', async () => {
  const t = await setup();
  const e = await t.createEvent({ venueId: undefined, venue: 'The Test Rooms' });
  assert.equal(e.venue, 'The Test Rooms');
  assert.equal(e.venueId, null);
  const wrongCity = await t.call('POST', '/admin/events', {
    as: ADMIN,
    body: {
      title: 'X',
      venueId: 'rock-city-nottingham',
      cityId: 'birmingham',
      type: 'gig',
      startsAt: new Date(t.clock.now.getTime() + DAY).toISOString(),
      durationHours: 4,
      tiers: [{ name: 'GA', faceValuePence: 1500 }],
    },
  });
  assert.equal(wrongCity.status, 400);
});

test('only admins can create events or see requests', async () => {
  const t = await setup();
  const body = {
    title: 'X',
    venue: 'Y',
    cityId: 'birmingham',
    type: 'gig',
    startsAt: '2030-01-01T21:00:00Z',
    durationHours: 4,
    tiers: [{ name: 'GA', faceValuePence: 1500 }],
  };
  assert.equal((await t.call('POST', '/admin/events', { body })).status, 401);
  const asStudent = await t.call('POST', '/admin/events', { as: STUDENT, body });
  assert.equal(asStudent.status, 403);
  assert.equal(asStudent.body.code, 'forbidden');
  assert.equal((await t.call('GET', '/admin/event-requests', { as: STUDENT })).status, 403);
});

test('event validation: past start, no tiers, sub-£1 tier, bad type', async () => {
  const t = await setup();
  const ok = {
    title: 'X',
    venue: 'Y',
    cityId: 'birmingham',
    type: 'gig',
    startsAt: new Date(t.clock.now.getTime() + DAY).toISOString(),
    durationHours: 4,
    tiers: [{ name: 'GA', faceValuePence: 1500 }],
  };
  for (const bad of [
    { startsAt: new Date(t.clock.now.getTime() - DAY).toISOString() },
    { tiers: [] },
    { tiers: [{ name: 'GA', faceValuePence: 99 }] },
    { type: 'rave' },
    { cityId: 'london' },
    { durationHours: 0 },
  ]) {
    const res = await t.call('POST', '/admin/events', { as: ADMIN, body: { ...ok, ...bad } });
    assert.equal(res.status, 400, JSON.stringify(bad));
  }
});

test('filters and sorts match the mock: tonight, city, venue, type, text search; finished events drop off', async () => {
  const t = await setup({ now: new Date('2026-11-06T12:00:00Z') }); // a Friday
  const tonight = await t.createEvent({
    title: 'Tonight at Ink',
    venueId: 'ink-nottingham',
    cityId: 'nottingham',
    startsAt: '2026-11-06T22:00:00Z',
  });
  const nextWeek = await t.createEvent({ title: 'Ball', type: 'ball', startsAt: '2026-11-12T19:00:00Z' });
  const ids = async (/** @type {Record<string, string>} */ query) =>
    (await t.call('GET', '/events', { query })).body.map((/** @type {any} */ e) => e.id);
  assert.deepEqual(await ids({}), [tonight.id, nextWeek.id]);
  assert.deepEqual(await ids({ when: 'tonight' }), [tonight.id]);
  assert.deepEqual(await ids({ cityId: 'nottingham' }), [tonight.id]);
  assert.deepEqual(await ids({ venue: 'Rosies' }), [nextWeek.id]);
  assert.deepEqual(await ids({ type: 'ball' }), [nextWeek.id]);
  assert.deepEqual(await ids({ q: 'ink' }), [tonight.id]);
  assert.deepEqual(await ids({ when: 'date', from: '2026-11-10', to: '2026-11-30' }), [nextWeek.id]);
  t.clock.now = new Date('2026-11-07T06:00:00Z'); // after "tonight" ended (22:00 + 5h)
  assert.deepEqual(await ids({}), [nextWeek.id]);
  assert.deepEqual((await t.call('GET', '/events/filters')).body, { venues: ['Rosies'] });
});

test('alerts and event requests', async () => {
  const t = await setup();
  const e = await t.createEvent();
  assert.equal((await t.call('PUT', `/events/${e.id}/alert`, { body: { on: true } })).status, 401);
  assert.deepEqual((await t.call('PUT', `/events/${e.id}/alert`, { as: STUDENT, body: { on: true } })).body, {
    alertOn: true,
  });
  assert.equal((await t.call('GET', `/events/${e.id}`, { as: STUDENT })).body.alertOn, true);
  assert.equal((await t.call('GET', `/events/${e.id}`)).body.alertOn, false);
  await t.call('PUT', `/events/${e.id}/alert`, { as: STUDENT, body: { on: false } });
  assert.equal((await t.call('GET', `/events/${e.id}`, { as: STUDENT })).body.alertOn, false);

  assert.equal(
    (await t.call('POST', '/event-requests', { as: STUDENT, body: { name: 'Ball', venue: '' } })).status,
    400,
  );
  await t.call('POST', '/event-requests', {
    as: STUDENT,
    body: { name: 'Med Ball', venue: 'ICC', date: '2026-12-05', note: 'Fixr' },
  });
  const reqs = (await t.call('GET', '/admin/event-requests', { as: ADMIN })).body;
  assert.equal(reqs.length, 1);
  assert.equal(reqs[0].name, 'Med Ball');
  await t.call('POST', `/admin/event-requests/${reqs[0].id}/dismiss`, { as: ADMIN });
  assert.deepEqual((await t.call('GET', '/admin/event-requests', { as: ADMIN })).body, []);
});

test('unknown routes and events 404; an expired token on a signed-in route is a 401', async () => {
  const t = await setup();
  assert.equal((await t.call('GET', '/events/nope')).status, 404);
  assert.equal((await t.call('GET', '/nowhere')).status, 404);
  const res = await t.call('GET', '/me', { invalidToken: true });
  assert.equal(res.status, 401);
  assert.equal(res.body.code, 'unauthenticated');
});

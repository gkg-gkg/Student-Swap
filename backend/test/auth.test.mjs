import { test } from 'node:test';
import assert from 'node:assert/strict';
import { setup, STUDENT, ADMIN } from './helpers.mjs';
import { handler as preSignUp } from '../src/auth/pre-sign-up.mjs';
import { initialsFromEmail } from '../src/http/auth.mjs';

test('pre-sign-up allows the 11 university domains and their student subdomains only', async () => {
  const ev = (/** @type {string} */ email) => ({ request: { userAttributes: { email } } });
  for (const ok of ['a@bham.ac.uk', 'a@student.bham.ac.uk', 'A@MY.NTU.AC.UK', 'b@lboro.ac.uk', 'c@keele.ac.uk'])
    assert.ok(await preSignUp(ev(ok)), ok);
  for (const bad of ['a@gmail.com', 'a@bham.ac.uk.evil.com', 'a@notbham.ac.uk', 'a@ntu.ac.uk', 'nobody'])
    await assert.rejects(preSignUp(ev(bad)), /university email/, bad);
});

test('GET /me creates the profile row on first call, with the university from the verified email', async () => {
  const t = await setup();
  const me = (await t.call('GET', '/me', { as: STUDENT })).body;
  assert.equal(me.universityId, 'birmingham');
  assert.equal(me.role, 'user');
  assert.equal(me.profileComplete, false);
  assert.equal((await t.call('GET', '/me', { as: ADMIN })).body.role, 'admin');
  assert.equal((await t.call('GET', '/me')).status, 401);
});

test('POST /me/profile needs 18+ and a 2-30 character name, and ignores universityId from the client', async () => {
  const t = await setup();
  const post = (/** @type {Record<string, unknown>} */ body) => t.call('POST', '/me/profile', { as: STUDENT, body });
  assert.equal((await post({ displayName: 'Alex', ageConfirmed: false })).status, 400);
  assert.equal((await post({ displayName: 'A', ageConfirmed: true })).status, 400);
  const me = (
    await post({
      displayName: ' Alex D ',
      ageConfirmed: true,
      universityId: 'warwick',
      avatar: { tone: 'mint', initials: 'ad' },
    })
  ).body;
  assert.equal(me.displayName, 'Alex D');
  assert.equal(me.universityId, 'birmingham');
  assert.equal(me.profileComplete, true);
  assert.equal(me.ageConfirmed, true);
  assert.deepEqual(me.avatar, { tone: 'mint', initials: 'AD' });
  // A completed profile is public on /sellers/:id, without the email.
  const pub = (await t.call('GET', `/sellers/${STUDENT.sub}`)).body;
  assert.equal(pub.seller.displayName, 'Alex D');
  assert.equal(pub.seller.email, undefined);
});

test('initials from an email address', () => {
  assert.equal(initialsFromEmail('alex.demo@bham.ac.uk'), 'AD');
  assert.equal(initialsFromEmail('sam@x.ac.uk'), 'SA');
});

test('bad JSON bodies get a 400, not a crash', async () => {
  const t = await setup();
  const { createApi } = await import('../src/api.mjs');
  const api = createApi({ db: t.db, storage: t.storage, now: () => new Date(), config: { requirePayouts: false } });
  const res = await api({
    rawPath: '/event-requests',
    requestContext: {
      http: { method: 'POST' },
      authorizer: { lambda: { sub: 's', email: 'a@bham.ac.uk', groups: '' } },
    },
    body: '{nope',
  });
  assert.equal(res.statusCode, 400);
});

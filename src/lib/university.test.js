import test from 'node:test';
import assert from 'node:assert/strict';
import { universityForEmail, isAllowedEmail } from './university.js';

test('allows listed university domains', () => {
  assert.equal(universityForEmail('a@bham.ac.uk')?.id, 'birmingham');
  assert.equal(universityForEmail('A@My.NTU.ac.uk')?.id, 'ntu');
});

test('allows student subdomains', () => {
  assert.equal(universityForEmail('a@student.bham.ac.uk')?.id, 'birmingham');
});

test('rejects non-university and lookalike domains', () => {
  assert.equal(isAllowedEmail('a@gmail.com'), false);
  assert.equal(isAllowedEmail('a@evilbham.ac.uk'), false);
  assert.equal(isAllowedEmail('a@bham.ac.uk.evil.com'), false);
  assert.equal(isAllowedEmail('nonsense'), false);
});

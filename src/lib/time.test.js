import test from 'node:test';
import assert from 'node:assert/strict';
import { londonToUtc, addDaysYmd, formatTime } from './time.js';

test('London wall-clock time converts to UTC across BST and GMT', () => {
  assert.equal(londonToUtc('2026-07-10', 22, 0), '2026-07-10T21:00:00.000Z'); // BST = UTC+1
  assert.equal(londonToUtc('2026-12-10', 22, 0), '2026-12-10T22:00:00.000Z'); // GMT = UTC+0
});

test('round trip: the displayed time is the time we asked for', () => {
  for (const ymd of ['2026-10-24', '2026-10-26', '2026-03-28', '2026-03-30']) {
    for (const [h, m, label] of [
      [21, 0, '9:00 pm'],
      [22, 30, '10:30 pm'],
      [23, 30, '11:30 pm'],
    ]) {
      assert.equal(formatTime(londonToUtc(ymd, h, m)).replace('PM', 'pm'), label, `${ymd} ${h}:${m}`);
    }
  }
});

test('addDaysYmd rolls over months', () => {
  assert.equal(addDaysYmd('2026-10-30', 3), '2026-11-02');
});

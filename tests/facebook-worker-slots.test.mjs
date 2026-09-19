import test from 'node:test';
import assert from 'node:assert/strict';
import { workerMatrix } from '../scripts/facebook-worker-slots.mjs';

test('two workers only during 21:00–02:00 Philippine time', () => {
  for (const [time, expected] of [
    ['2026-09-19T20:59:59+08:00',[1]],
    ['2026-09-19T21:00:00+08:00',[1,2]],
    ['2026-09-20T00:00:00+08:00',[1,2]],
    ['2026-09-20T01:59:59+08:00',[1,2]],
    ['2026-09-20T02:00:00+08:00',[1]],
    ['2026-09-20T12:00:00+08:00',[1]]
  ]) assert.deepEqual(workerMatrix(new Date(time)).slot, expected, time);
});
test('an explicitly requested episode always uses one worker', () => {
  assert.deepEqual(workerMatrix(new Date('2026-09-19T21:00:00+08:00'), 'https://example.com/episode-1/').slot,[1]);
});
test('invalid scheduling date is rejected', () => {
  assert.throws(() => workerMatrix(new Date('invalid')), /Invalid date/);
});

import test from 'node:test';
import assert from 'node:assert/strict';
import { parseDateTime, toDateKey, toIsoDateTime } from '../src/utils/time.js';

test('parses trade times from seconds, milliseconds, numeric strings, and ISO strings', () => {
  assert.equal(parseDateTime(1767225600).toISOString(), '2026-01-01T00:00:00.000Z');
  assert.equal(parseDateTime(1767225600000).toISOString(), '2026-01-01T00:00:00.000Z');
  assert.equal(parseDateTime('1767225600').toISOString(), '2026-01-01T00:00:00.000Z');
  assert.equal(parseDateTime('2026-01-01T00:00:00.000Z').toISOString(), '2026-01-01T00:00:00.000Z');
});

test('formats imported trade times consistently for grouping and storage', () => {
  assert.equal(toDateKey(1767225600), '2026-01-01');
  assert.equal(toIsoDateTime(1767225600), '2026-01-01T00:00:00.000Z');
});

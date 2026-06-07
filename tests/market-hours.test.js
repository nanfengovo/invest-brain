import test from 'node:test';
import assert from 'node:assert/strict';
import { getUsMarketStatus } from '../src/utils/marketHours.js';

test('marks regular US market hours as trading', () => {
  const status = getUsMarketStatus(new Date('2026-06-08T14:00:00Z'));

  assert.equal(status.phase, 'regular');
  assert.equal(status.label, '交易中');
  assert.equal(status.ny.key, '2026-06-08');
});

test('marks pre-market and after-hours sessions separately', () => {
  const preMarket = getUsMarketStatus(new Date('2026-06-08T12:00:00Z'));
  const afterHours = getUsMarketStatus(new Date('2026-06-08T21:00:00Z'));

  assert.equal(preMarket.phase, 'pre');
  assert.equal(preMarket.label, '盘前');
  assert.equal(afterHours.phase, 'after');
  assert.equal(afterHours.label, '盘后');
});

test('marks US weekends as closed', () => {
  const status = getUsMarketStatus(new Date('2026-06-07T08:00:00Z'));

  assert.equal(status.phase, 'closed');
  assert.equal(status.label, '休市');
  assert.equal(status.isTradingDay, false);
});

test('marks observed US market holidays as closed', () => {
  const status = getUsMarketStatus(new Date('2026-07-03T15:00:00Z'));

  assert.equal(status.phase, 'closed');
  assert.equal(status.label, '休市');
  assert.equal(status.isTradingDay, false);
});

test('uses early close schedule for the day after Thanksgiving', () => {
  const beforeEarlyClose = getUsMarketStatus(new Date('2026-11-27T17:00:00Z'));
  const afterEarlyClose = getUsMarketStatus(new Date('2026-11-27T18:30:00Z'));

  assert.equal(beforeEarlyClose.phase, 'regular');
  assert.equal(afterEarlyClose.phase, 'after');
});

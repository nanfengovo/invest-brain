import test from 'node:test';
import assert from 'node:assert/strict';
import { findExtendedQuote } from '../api/market.js';

test('after-hours change is relative to the regular session last price', () => {
  const result = {
    meta: {
      currentTradingPeriod: {
        post: { start: 100, end: 200 },
      },
    },
    timestamp: [120],
    indicators: {
      quote: [{
        close: [14.06],
      }],
    },
  };

  const extended = findExtendedQuote(result, 14.38);

  assert.equal(extended.label, '盘后');
  assert.equal(extended.price, 14.06);
  assert.equal(Number(extended.absChange.toFixed(2)), -0.32);
  assert.equal(Number(extended.pctChange.toFixed(2)), -2.23);
});

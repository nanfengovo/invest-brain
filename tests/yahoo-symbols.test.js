import test from 'node:test';
import assert from 'node:assert/strict';
import { mapYahooSymbol } from '../api/_lib/yahoo.js';

test('maps market page index symbols to Yahoo index tickers', () => {
  assert.equal(mapYahooSymbol('gb_ixic'), '^IXIC');
  assert.equal(mapYahooSymbol('gb_ndx'), '^NDX');
  assert.equal(mapYahooSymbol('gb_inx'), '^GSPC');
});

test('maps market page futures symbols to Yahoo futures tickers', () => {
  assert.equal(mapYahooSymbol('hf_NQ'), 'NQ=F');
  assert.equal(mapYahooSymbol('hf_ES'), 'ES=F');
  assert.equal(mapYahooSymbol('hf_YM'), 'YM=F');
});

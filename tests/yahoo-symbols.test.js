import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { mapYahooSymbol } from '../api/_lib/yahoo.js';
import { toLongbridgeStockSymbol } from '../api/_lib/longbridge.js';

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

test('normalizes A-share and Hong Kong symbols for Yahoo and Longbridge', () => {
  assert.equal(mapYahooSymbol('hk00700'), '0700.HK');
  assert.equal(mapYahooSymbol('700.HK'), '0700.HK');
  assert.equal(mapYahooSymbol('600519'), '600519.SS');
  assert.equal(mapYahooSymbol('sh600519'), '600519.SS');
  assert.equal(mapYahooSymbol('sz000001'), '000001.SZ');
  assert.equal(toLongbridgeStockSymbol('600519.SS'), '600519.SH');
  assert.equal(toLongbridgeStockSymbol('000001.SZ'), '000001.SZ');
  assert.equal(toLongbridgeStockSymbol('0700.HK'), '0700.HK');
});

test('serves search api locally so regional direct matches are testable', () => {
  const viteConfig = readFileSync(new URL('../vite.config.js', import.meta.url), 'utf8');
  assert.match(viteConfig, /'\/api\/search': '\.\/api\/search\.js'/);
});

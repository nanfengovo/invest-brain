import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildTradeFingerprint,
  createTradeDeduper,
  getTradeIdentityAssetKey,
} from '../src/utils/tradeDeduplication.js';

test('builds stable fingerprints for repeated stock imports', () => {
  const trade = {
    symbol: 'NOK',
    asset_type: 'STOCK',
    direction: 'BUY',
    quantity: '12',
    price: '15.8800',
    trade_time: '2026-05-26T00:00:00.000Z',
    author: 'feng',
  };

  assert.equal(
    buildTradeFingerprint(trade),
    buildTradeFingerprint({ ...trade, quantity: 12, price: 15.88 })
  );
});

test('normalizes option identity before deduping imports', () => {
  assert.equal(
    getTradeIdentityAssetKey({
      symbol: 'STM',
      asset_type: 'OPTION',
      contract_symbol: 'STM 260618 C 72',
    }),
    'OPTION_STM260618C00072000'
  );

  const deduper = createTradeDeduper([
    {
      symbol: 'STM',
      asset_type: 'OPTION',
      direction: 'BUY',
      quantity: 1,
      price: 4.3,
      expiry_date: '2026-06-18',
      strike_price: 72,
      option_type: 'CALL',
      trade_time: '2026-05-26T00:00:00.000Z',
      author: 'feng',
    },
  ]);

  assert.equal(deduper.isDuplicate({
    symbol: 'STM',
    asset_type: 'OPTION',
    direction: 'BUY',
    quantity: '1.0',
    price: '4.300',
    contract_symbol: 'STM260618C00072000',
    trade_time: '2026-05-26T00:00:00.000Z',
    author: 'feng',
  }), true);
});

test('deduper catches duplicates inside the same import batch', () => {
  const deduper = createTradeDeduper([], { author: 'feng' });
  const trade = {
    symbol: 'DRAM',
    asset_type: 'ETF',
    direction: 'BUY',
    quantity: 2,
    price: 68.01,
    trade_time: '2026-06-02T00:00:00.000Z',
  };

  assert.equal(deduper.isDuplicate(trade), false);
  assert.equal(deduper.isDuplicate({ ...trade }), true);
});

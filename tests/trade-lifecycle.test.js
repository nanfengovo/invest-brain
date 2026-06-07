import test from 'node:test';
import assert from 'node:assert/strict';
import {
  annotateTradesWithLifecycle,
  getTradeAssetDisplay,
} from '../src/utils/tradeLifecycle.js';

test('formats option labels from broker contract text', () => {
  assert.equal(getTradeAssetDisplay({
    symbol: 'NOK',
    asset_type: 'OPTION',
    asset_name: 'NOK 260918 15.00 C',
  }), '260918 15 CALL');

  assert.equal(getTradeAssetDisplay({
    symbol: 'GOOG',
    asset_type: 'OPTION',
    contract_symbol: "GOOG JUL 17 '26 405 Call",
  }), '260717 405 CALL');
});

test('marks buy-only trades as open', () => {
  const [trade] = annotateTradesWithLifecycle([{
    id: 'b1',
    symbol: 'NOK',
    asset_type: 'OPTION',
    contract_symbol: 'NOK 260918 25 C',
    direction: 'BUY',
    quantity: 2,
    price: 1.5,
  }]);

  assert.equal(trade.lifecycle.status, 'OPEN_ONLY');
  assert.equal(trade.lifecycle.openQty, 2);
});

test('calculates realized pnl for closed buy and sell pairs', () => {
  const trades = annotateTradesWithLifecycle([
    {
      id: 'b1',
      symbol: 'STM',
      asset_type: 'OPTION',
      contract_symbol: 'STM 260618 72 C',
      direction: 'BUY',
      quantity: 1,
      price: 4.3,
    },
    {
      id: 's1',
      symbol: 'STM',
      asset_type: 'OPTION',
      contract_symbol: 'STM 260618 72 C',
      direction: 'SELL',
      quantity: 1,
      price: 8,
    },
  ]);

  assert.equal(trades[0].lifecycle.status, 'CLOSED');
  assert.equal(trades[1].lifecycle.status, 'CLOSED');
  assert.equal(trades[0].lifecycle.realizedPnl, 370);
});

test('tracks partial closes by remaining quantity', () => {
  const [buy] = annotateTradesWithLifecycle([
    {
      id: 'b1',
      symbol: 'ASTS',
      asset_type: 'OPTION',
      contract_symbol: 'ASTS CALL 20260918 180',
      direction: 'BUY',
      quantity: 3,
      price: 2,
    },
    {
      id: 's1',
      symbol: 'ASTS',
      asset_type: 'OPTION',
      contract_symbol: 'ASTS CALL 20260918 180',
      direction: 'SELL',
      quantity: 1,
      price: 5,
    },
  ]);

  assert.equal(buy.lifecycle.status, 'PARTIAL');
  assert.equal(buy.lifecycle.openQty, 2);
  assert.equal(buy.lifecycle.closedQty, 1);
  assert.equal(buy.lifecycle.realizedPnl, 300);
});

test('keeps stock pnl on a one-share multiplier', () => {
  const [buy] = annotateTradesWithLifecycle([
    {
      id: 'b1',
      symbol: 'NOK',
      asset_type: 'STOCK',
      direction: 'BUY',
      quantity: 10,
      price: 14,
    },
    {
      id: 's1',
      symbol: 'NOK',
      asset_type: 'STOCK',
      direction: 'SELL',
      quantity: 10,
      price: 15.5,
    },
  ]);

  assert.equal(buy.lifecycle.status, 'CLOSED');
  assert.equal(buy.lifecycle.realizedPnl, 15);
});

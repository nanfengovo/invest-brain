import test from 'node:test';
import assert from 'node:assert/strict';
import {
  annotateTradesWithLifecycle,
  buildTradePortfolioSummary,
  getOrphanSellLifecycleItems,
  getTradeAssetDisplay,
  getTradeQuantityUnit,
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
  const [trade, secondTrade] = annotateTradesWithLifecycle([
    {
      id: 'b1',
      symbol: 'NOK',
      asset_type: 'OPTION',
      contract_symbol: 'NOK 260918 25 C',
      direction: 'BUY',
      quantity: 2,
      price: 1.5,
    },
    {
      id: 'b2',
      symbol: 'NOK',
      asset_type: 'OPTION',
      contract_symbol: 'NOK 260918 25 C',
      direction: 'BUY',
      quantity: 3,
      price: 1.6,
    },
  ]);

  assert.equal(trade.lifecycle.status, 'OPEN_ONLY');
  assert.equal(trade.lifecycle.openQty, 5);
  assert.equal(trade.lifecycle.ownOpenQty, 2);
  assert.equal(secondTrade.lifecycle.ownOpenQty, 3);
  assert.equal(trade.lifecycle.unit, '张');
  assert.equal(getTradeQuantityUnit(trade), '张');
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

test('summarizes closed option trades with contract multiplier', () => {
  const summary = buildTradePortfolioSummary([
    {
      id: 'b1',
      asset_id: 'STM_2026-06-18_72_CALL',
      symbol: 'STM',
      asset_type: 'OPTION',
      contract_symbol: 'STM 260618 72 C',
      direction: 'BUY',
      quantity: 1,
      price: 4.3,
    },
    {
      id: 's1',
      asset_id: 'STM_2026-06-18_72_CALL',
      symbol: 'STM',
      asset_type: 'OPTION',
      contract_symbol: 'STM 260618 72 C',
      direction: 'SELL',
      quantity: 1,
      price: 8,
    },
  ]);

  assert.equal(summary.total_buys, 430);
  assert.equal(summary.total_sells, 800);
  assert.equal(summary.realized_pnl, 370);
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
  assert.equal(buy.lifecycle.ownOpenQty, 2);
  assert.equal(buy.lifecycle.closedQty, 1);
  assert.equal(buy.lifecycle.realizedPnl, 300);
});

test('allocates partial sells across buy lots in order', () => {
  const trades = annotateTradesWithLifecycle([
    {
      id: 'b1',
      symbol: 'NOK',
      asset_type: 'OPTION',
      contract_symbol: 'NOK 260918 25 C',
      direction: 'BUY',
      quantity: 5,
      price: 0.89,
    },
    {
      id: 'b2',
      symbol: 'NOK',
      asset_type: 'OPTION',
      contract_symbol: 'NOK 260918 25 C',
      direction: 'BUY',
      quantity: 9,
      price: 0.94,
    },
    {
      id: 's1',
      symbol: 'NOK',
      asset_type: 'OPTION',
      contract_symbol: 'NOK 260918 25 C',
      direction: 'SELL',
      quantity: 6,
      price: 1.2,
    },
  ]);

  assert.equal(trades[0].lifecycle.ownOpenQty, 0);
  assert.equal(trades[1].lifecycle.ownOpenQty, 8);
  assert.equal(trades[1].lifecycle.openQty, 8);
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
  assert.equal(buy.lifecycle.unit, '股');
  assert.equal(getTradeQuantityUnit(buy), '股');
});

test('keeps named stock trades separate from option contracts', () => {
  const [trade] = annotateTradesWithLifecycle([{
    id: 'b1',
    symbol: 'NOK',
    asset_name: '诺基亚',
    asset_type: 'STOCK',
    direction: 'BUY',
    quantity: 4,
    price: 14.92,
  }]);

  assert.equal(getTradeAssetDisplay(trade), '诺基亚');
  assert.equal(trade.lifecycle.unit, '股');
  assert.equal(getTradeQuantityUnit(trade), '股');
});

test('flags sell trades without matching buys', () => {
  const [sell] = annotateTradesWithLifecycle([
    {
      id: 's1',
      symbol: 'NOK',
      asset_type: 'OPTION',
      contract_symbol: 'NOK 260918 25 C',
      direction: 'SELL',
      quantity: 1,
      price: 2,
    },
  ]);

  assert.equal(sell.lifecycle.status, 'ORPHAN_SELL');
  assert.equal(getOrphanSellLifecycleItems([sell]).length, 1);
});

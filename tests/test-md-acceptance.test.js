import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeOcrResult } from '../src/utils/ocrWorker.js';
import { calculateInsightStats } from '../src/utils/insightStats.js';
import {
  annotateTradesWithLifecycle,
  buildTradePortfolioSummary,
  getTradeOptionDisplay,
} from '../src/utils/tradeLifecycle.js';

test('test.md OCR acceptance normalizes multi-broker stock and option results', () => {
  const { trades, candidates } = normalizeOcrResult({
    broker_detected: '混合券商验收',
    trades: [
      {
        broker: 'IBKR',
        direction: 'BUY',
        symbol: 'NVDA',
        asset_type: 'STOCK',
        quantity: 10,
        price: 125.3,
        fee: 1,
        trade_time: '2026-06-03T10:49:00',
        status: '全部成交',
      },
      {
        broker: '长桥证券',
        direction: 'BUY',
        symbol: 'ASTS',
        asset_type: 'OPTION',
        quantity: 1,
        price: 2.5,
        fee: 0.65,
        strike_price: 40,
        expiry_date: '2026-06-05',
        option_type: 'CALL',
        trade_time: '2026-06-03T11:00:00',
        status: '已成交',
      },
      {
        broker: '盈立证券',
        direction: 'SELL',
        symbol: 'NOK',
        asset_type: 'OPTION',
        quantity: 2,
        price: 1.25,
        strike_price: 15,
        expiry_date: '2026-09-18',
        option_type: 'CALL',
        trade_time: '2026-06-07T10:00:00',
        status: '下单失败',
      },
    ],
  });

  assert.equal(trades.length, 2);
  assert.deepEqual(trades.map((trade) => trade.symbol), ['NVDA', 'ASTS']);
  assert.equal(trades[1].asset_type, 'OPTION');
  assert.equal(trades[1].option_type, 'CALL');
  assert.equal(trades[1].strike_price, 40);
  assert.deepEqual(candidates.symbols, ['NVDA', 'ASTS']);
  assert.ok(candidates.numbers.includes('125.3'));
  assert.ok(candidates.numbers.includes('40'));
});

test('test.md information module covers article, book, image, video and comments', () => {
  const informations = [
    { id: 'info-article', title: 'NVDA AI 文章', type: 'ARTICLE', asset_symbols: 'NVDA', viewpoint_count: 1 },
    { id: 'info-book', title: 'AI 基础设施书籍', type: 'BOOK', asset_symbols: 'NVDA', viewpoint_count: 1 },
    { id: 'info-image', title: 'ASTS 图表图片', type: 'IMAGE', asset_symbols: 'ASTS', viewpoint_count: 1 },
    { id: 'info-video', title: 'NOK 期权视频', type: 'VIDEO', asset_symbols: 'NOK', viewpoint_count: 1 },
  ];
  const types = new Set(informations.map((info) => info.type));

  assert.deepEqual(types, new Set(['ARTICLE', 'BOOK', 'IMAGE', 'VIDEO']));
  assert.equal(informations.reduce((total, info) => total + info.viewpoint_count, 0), 4);
  assert.deepEqual([...new Set(informations.map((info) => info.asset_symbols))].sort(), ['ASTS', 'NOK', 'NVDA']);
});

test('test.md closed loop covers three symbols with stock, traded option, and expired option reviews', () => {
  const trades = annotateTradesWithLifecycle([
    {
      id: 'nvda-buy',
      asset_id: 'NVDA',
      symbol: 'NVDA',
      asset_type: 'STOCK',
      direction: 'BUY',
      quantity: 10,
      price: 125,
      fee: 1,
      decision_id: 'decision-nvda',
    },
    {
      id: 'nvda-sell',
      asset_id: 'NVDA',
      symbol: 'NVDA',
      asset_type: 'STOCK',
      direction: 'SELL',
      quantity: 10,
      price: 132,
      fee: 1,
      decision_id: 'decision-nvda',
    },
    {
      id: 'asts-call-buy',
      asset_id: 'ASTS_2026-06-05_40_CALL',
      symbol: 'ASTS',
      asset_type: 'OPTION',
      direction: 'BUY',
      quantity: 1,
      price: 2.5,
      fee: 0.65,
      expiry_date: '2026-06-05',
      strike_price: 40,
      option_type: 'CALL',
      multiplier: 100,
      decision_id: 'decision-asts',
    },
    {
      id: 'nok-call-buy',
      asset_id: 'NOK_2026-09-18_15_CALL',
      symbol: 'NOK',
      asset_type: 'OPTION',
      direction: 'BUY',
      quantity: 2,
      price: 0.9,
      expiry_date: '2026-09-18',
      strike_price: 15,
      option_type: 'CALL',
      multiplier: 100,
      decision_id: 'decision-nok',
    },
    {
      id: 'nok-call-sell',
      asset_id: 'NOK_2026-09-18_15_CALL',
      symbol: 'NOK',
      asset_type: 'OPTION',
      direction: 'SELL',
      quantity: 2,
      price: 1.25,
      expiry_date: '2026-09-18',
      strike_price: 15,
      option_type: 'CALL',
      multiplier: 100,
      decision_id: 'decision-nok',
    },
  ], { now: new Date('2026-06-08T09:30:00') });

  const asts = trades.find((trade) => trade.id === 'asts-call-buy');
  const nok = trades.find((trade) => trade.id === 'nok-call-buy');
  const summary = buildTradePortfolioSummary(trades);

  assert.equal(asts.lifecycle.status, 'EXPIRED_WORTHLESS');
  assert.equal(asts.lifecycle.realizedPnl, -250.65);
  assert.equal(nok.lifecycle.status, 'CLOSED');
  assert.equal(nok.lifecycle.realizedPnl, 70);
  assert.equal(Number(summary.realized_pnl.toFixed(2)), -112.65);
  assert.deepEqual(getTradeOptionDisplay(nok), {
    underlying: 'NOK',
    expiration: '2026-09-18',
    compactExpiration: '260918',
    strike: '15',
    optionType: 'CALL',
    title: 'NOK 15C',
    contractSymbol: 'NOK260918C00015000',
  });
});

test('test.md insight stats cover win rate, pnl ratio, and option attribution input', () => {
  const stats = calculateInsightStats([
    {
      review_id: 'review-nvda',
      decision_id: 'decision-nvda',
      is_successful: 1,
      result_pnl: 68,
      asset_type: 'STOCK',
      decision_title: 'NVDA 正股右侧跟随',
    },
    {
      review_id: 'review-asts',
      decision_id: 'decision-asts',
      is_successful: 0,
      result_pnl: -250,
      asset_type: 'OPTION',
      underlying_symbol: 'ASTS',
      expiry_date: '2026-06-05',
      option_type: 'CALL',
      lifecycle_status: 'EXPIRED_WORTHLESS',
      closed_reason: 'EXPIRED_WORTHLESS',
      decision_title: 'ASTS 短期期权时间错配',
    },
    {
      review_id: 'review-nok',
      decision_id: 'decision-nok',
      is_successful: 1,
      result_pnl: 70,
      asset_type: 'OPTION',
      underlying_symbol: 'NOK',
      expiry_date: '2026-09-18',
      option_type: 'CALL',
      lifecycle_status: 'CLOSED_TRADED',
      closed_reason: 'CLOSED_TRADED',
      decision_title: 'NOK Call 平仓复盘',
    },
    {
      review_id: null,
      decision_id: 'decision-cancelled',
      status: 'ABANDONED',
      decision_title: '主动放弃的破坏决策',
    },
  ]);

  assert.equal(stats.total, 3);
  assert.equal(stats.winRate, '66.7');
  assert.equal(stats.pnlRatio, '0.55');
  assert.equal(stats.totalProfit, 138);
  assert.equal(stats.totalLoss, 250);
  assert.equal(stats.rawData.some((item) => item.closed_reason === 'EXPIRED_WORTHLESS'), true);
});

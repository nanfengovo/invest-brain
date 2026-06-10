import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildOptionAssetId,
  buildOCCContractSymbol,
  getOptionCandidates,
  normalizeOptionTrade,
  normalizeOptionCandidate,
  parseOptionContractSymbol,
} from '../src/utils/optionsMarket.js';
import {
  buildOptionHoldingMetrics,
  buildOptionRealtimeSummary,
} from '../src/utils/optionPortfolio.js';
import {
  attachOptionDailyChange,
  buildAutoOptionProviderPlan,
  filterOptionPayloadByContract,
  getPreviousUsTradingDate,
  normalizeOptionContractKey,
} from '../api/options-chain.js';
import {
  toLongbridgeCliOptionSymbol,
  toLongbridgeOptionSymbol,
  toLongbridgeStockSymbol,
} from '../api/_lib/longbridge.js';

test('parses Yahoo option contract symbols', () => {
  assert.deepEqual(parseOptionContractSymbol('AAPL260619C00200000'), {
    underlying: 'AAPL',
    expiration: '2026-06-19',
    optionType: 'CALL',
    strike: '200',
    contractSymbol: 'AAPL260619C00200000',
  });
});

test('normalizes OCC contracts into trade metadata', () => {
  assert.deepEqual(normalizeOptionTrade({
    contract_symbol: 'NVDA260618C00100000',
  }), {
    underlying: 'NVDA',
    expiration: '2026-06-18',
    expiry_date: '2026-06-18',
    optionType: 'CALL',
    option_type: 'CALL',
    strike: '100',
    strike_price: 100,
    contractSymbol: 'NVDA260618C00100000',
    contract_symbol: 'NVDA260618C00100000',
    asset_id: 'OPTION_NVDA260618C00100000',
    multiplier: 100,
  });
});

test('builds OCC symbols and option asset ids', () => {
  assert.equal(buildOCCContractSymbol({
    underlying: 'NVDA',
    expiration: '2026-06-18',
    optionType: 'CALL',
    strike: 100,
  }), 'NVDA260618C00100000');

  assert.equal(buildOptionAssetId({
    underlying: 'NVDA',
    expiration: '2026-06-18',
    optionType: 'CALL',
    strike: 100,
  }), 'OPTION_NVDA260618C00100000');
});

test('normalizes symbols for Longbridge stock and option APIs', () => {
  assert.equal(toLongbridgeStockSymbol('TSLA'), 'TSLA.US');
  assert.equal(toLongbridgeStockSymbol('00700'), '00700.HK');
  assert.equal(toLongbridgeOptionSymbol('OPTION_NVDA260618C00100000'), 'NVDA260618C100000.US');
  assert.equal(toLongbridgeOptionSymbol('TSLA260618P00350000'), 'TSLA260618P350000.US');
  assert.equal(toLongbridgeCliOptionSymbol('OPTION_NVDA260618C00100000'), 'NVDA260618C100000');
  assert.equal(toLongbridgeCliOptionSymbol('NVDA260618C100000.US'), 'NVDA260618C100000');
  assert.equal(toLongbridgeCliOptionSymbol('AAPL240119C190000'), 'AAPL240119C190000');
});

test('normalizes provider option contract keys to standard OCC format', () => {
  assert.equal(normalizeOptionContractKey('OPTION_BB260821C013000'), 'BB260821C00013000');
  assert.equal(normalizeOptionContractKey('NVDA260618C100000.US'), 'NVDA260618C00100000');
  assert.equal(normalizeOptionContractKey('O:AAPL240119C190000'), 'AAPL240119C00190000');
  assert.equal(normalizeOptionContractKey('TSLA260618P00350000'), 'TSLA260618P00350000');
});

test('normalizes loose option trade records', () => {
  assert.deepEqual(normalizeOptionCandidate({
    symbol: 'NVDA',
    expiry_date: '2026-06-19',
    option_type: 'PUT',
    strike_price: 120,
    contract_symbol: 'NVDA 2026-06-19 PUT 120',
  }, 'recent-buy'), {
    id: 'NVDA260619P00120000',
    symbol: 'NVDA260619P00120000',
    name: 'NVDA 06-19 PUT 120',
    underlying: 'NVDA',
    expiration: '2026-06-19',
    optionType: 'PUT',
    strike: '120',
    contractSymbol: 'NVDA260619P00120000',
    source: 'recent-buy',
    tradeTime: null,
  });
});

test('prefers watched options over recent option buys', () => {
  const candidates = getOptionCandidates({
    watchlist: [{
      symbol: 'AAPL260619C00200000',
      quoteType: 'OPTION',
      name: 'AAPL Call',
    }],
    trades: [{
      symbol: 'NVDA',
      asset_type: 'OPTION',
      direction: 'BUY',
      expiry_date: '2026-06-19',
      option_type: 'PUT',
      strike_price: 120,
    }],
  });

  assert.equal(candidates.length, 1);
  assert.equal(candidates[0].underlying, 'AAPL');
  assert.equal(candidates[0].source, 'watchlist');
});

test('falls back to recent buy option trades', () => {
  const candidates = getOptionCandidates({
    trades: [
      {
        symbol: 'TSLA',
        asset_type: 'OPTION',
        direction: 'SELL',
        expiry_date: '2026-06-19',
        option_type: 'CALL',
        strike_price: 300,
      },
      {
        symbol: 'NVDA',
        asset_type: 'OPTION',
        direction: 'BUY',
        expiry_date: '2026-06-19',
        option_type: 'CALL',
        strike_price: 150,
      },
    ],
  });

  assert.equal(candidates.length, 1);
  assert.equal(candidates[0].underlying, 'NVDA');
  assert.equal(candidates[0].source, 'recent-buy');
});

test('finds previous US trading date across weekends and market holidays', () => {
  assert.equal(getPreviousUsTradingDate('2026-06-22'), '2026-06-18');
  assert.equal(getPreviousUsTradingDate('2026-07-06'), '2026-07-02');
});

test('normalizes option daily change from previous EOD quote', () => {
  const current = {
    contractSymbol: 'NVDA260618C00100000',
    mark: 2.25,
    last: 2.3,
  };
  const previous = {
    contractSymbol: 'NVDA260618C00100000',
    mark: 1.75,
    last: 1.8,
  };
  const normalized = attachOptionDailyChange(current, previous, '2026-06-17');

  assert.equal(normalized.previousClose, 1.75);
  assert.equal(normalized.previousCloseDate, '2026-06-17');
  assert.equal(normalized.change, 0.5);
  assert.equal(Number(normalized.percentChange.toFixed(4)), 28.5714);
  assert.equal(normalized.dayChangeSource, 'marketdata_previous_eod');
});

test('keeps option daily change explicit when previous EOD is missing', () => {
  const normalized = attachOptionDailyChange(
    { contractSymbol: 'NVDA260618C00100000', mark: 2.25 },
    null,
    '2026-06-17',
    'MarketData.app 没有该日期报价'
  );

  assert.equal(normalized.change, null);
  assert.equal(normalized.percentChange, null);
  assert.equal(normalized.previousClose, null);
  assert.equal(normalized.dayChangeSource, 'missing_previous_eod');
  assert.match(normalized.dayChangeNote, /没有该日期报价/);
});

test('auto option provider plan keeps real fallbacks after MarketData.app', () => {
  assert.deepEqual(buildAutoOptionProviderPlan({
    marketDataToken: 'md-token',
    hasLongbridge: true,
    contract: 'NVDA260618C00100000',
    tradierToken: 'tradier-token',
    polygonToken: 'polygon-token',
  }), ['marketdata', 'longbridge', 'tradier', 'polygon', 'yahoo']);

  assert.deepEqual(buildAutoOptionProviderPlan({
    hasLongbridge: true,
    contract: '',
  }), ['yahoo']);
});

test('filters option-chain payload to the requested contract before holdings use it', () => {
  const payload = filterOptionPayloadByContract({
    provider: 'Yahoo Finance',
    selectedExpiration: '2026-06-18',
    expirations: ['2026-06-18'],
    options: [
      { contractSymbol: 'NVDA260618C00100000', mark: 1.2, expiration: '2026-06-18' },
      { contractSymbol: 'NVDA260618C00110000', mark: 0.6, expiration: '2026-06-18' },
    ],
    dataSource: {
      optionCount: 2,
    },
  }, 'OPTION_NVDA260618C110000');

  assert.equal(payload.options.length, 1);
  assert.equal(payload.options[0].contractSymbol, 'NVDA260618C00110000');
  assert.equal(payload.dataSource.requestedContract, 'NVDA260618C00110000');
  assert.equal(payload.dataSource.optionCount, 1);
});

test('summarizes option holdings with live mark and daily pnl basis', () => {
  const holdings = [
    {
      type: 'OPTION',
      asset_id: 'OPTION_NVDA260618C00100000',
      total_quantity: 2,
      avg_cost: 1.5,
      multiplier: 100,
      broker: '复星证券',
      author: 'test',
    },
    {
      type: 'OPTION',
      asset_id: 'OPTION_TSLA260618P00350000',
      total_quantity: 1,
      avg_cost: 4,
      multiplier: 100,
      broker: '',
      author: '',
    },
    {
      type: 'OPTION',
      asset_id: 'OPTION_AAPL260618C00200000',
      total_quantity: 1,
      avg_cost: 2,
      multiplier: 100,
      broker: '',
      author: '',
    },
  ];
  const summary = buildOptionRealtimeSummary(holdings, {
    'OPTION_NVDA260618C00100000-复星证券-test': {
      mark: 2.25,
      change: 0.5,
    },
    'OPTION_TSLA260618P00350000--未标记': {
      last: 3.5,
      change: null,
    },
  });

  assert.equal(summary.count, 3);
  assert.equal(summary.contracts, 4);
  assert.equal(summary.quoted, 2);
  assert.equal(summary.pending, 1);
  assert.equal(summary.unavailable, 0);
  assert.equal(summary.dayPnlMissing, 1);
  assert.equal(summary.costBasis, 900);
  assert.equal(summary.marketValue, 800);
  assert.equal(summary.unrealizedPnl, 100);
  assert.equal(summary.dayPnl, 100);
});

test('option realtime summary isolates unavailable quotes and ignores stock holdings', () => {
  const summary = buildOptionRealtimeSummary([
    {
      type: 'STOCK',
      asset_id: 'AAPL',
      total_quantity: 10,
      avg_cost: 200,
    },
    {
      type: 'OPTION',
      asset_id: 'OPTION_AAPL260618C00200000',
      total_quantity: 1,
      avg_cost: 2,
      multiplier: 100,
      broker: '',
      author: '',
    },
    {
      type: 'OPTION',
      asset_id: 'OPTION_TSLA260618P00350000',
      total_quantity: 2,
      avg_cost: 4,
      multiplier: 100,
      broker: 'Longbridge',
      author: 'alice',
    },
  ], {
    'OPTION_AAPL260618C00200000--未标记': {
      quoteUnavailable: true,
      error: 'OPRA 权限不足',
      mark: 5,
      change: 1,
    },
    'OPTION_TSLA260618P00350000-Longbridge-alice': {
      mark: 3.5,
      change: null,
    },
  });

  assert.equal(summary.count, 2);
  assert.equal(summary.contracts, 3);
  assert.equal(summary.quoted, 1);
  assert.equal(summary.unavailable, 1);
  assert.equal(summary.pending, 0);
  assert.equal(summary.dayPnlMissing, 1);
  assert.equal(summary.costBasis, 1000);
  assert.equal(summary.marketValue, 700);
  assert.equal(summary.unrealizedPnl, -100);
  assert.equal(summary.dayPnl, 0);
});

test('builds per-option holding metrics for card mark value and daily pnl', () => {
  const metrics = buildOptionHoldingMetrics({
    type: 'OPTION',
    total_quantity: 3,
    avg_cost: 1.2,
    multiplier: 100,
  }, {
    mark: 1.75,
    previousClose: 1.6,
    change: 0.15,
    percentChange: 9.375,
  });

  assert.equal(metrics.hasLiveOptionPrice, true);
  assert.equal(metrics.liveOptionPrice, 1.75);
  assert.equal(Number(metrics.costBasis.toFixed(2)), 360);
  assert.equal(metrics.positionValue, 525);
  assert.equal(Number(metrics.unrealizedPnl.toFixed(2)), 165);
  assert.equal(Number(metrics.unrealizedPnlPct.toFixed(4)), 0.4583);
  assert.equal(metrics.optionPreviousClose, 1.6);
  assert.equal(Number(metrics.optionDayChange.toFixed(2)), 45);
  assert.equal(metrics.optionDayTone, 'profit');
});

test('per-option holding metrics do not treat unavailable quotes as live pnl', () => {
  const metrics = buildOptionHoldingMetrics({
    type: 'OPTION',
    total_quantity: 1,
    avg_cost: 2,
    multiplier: 100,
  }, {
    quoteUnavailable: true,
    error: 'OPRA 权限不足',
    mark: 9,
    change: 1,
  });

  assert.equal(metrics.quoteUnavailable, true);
  assert.equal(metrics.hasLiveOptionPrice, false);
  assert.equal(metrics.positionValue, 200);
  assert.equal(metrics.unrealizedPnl, null);
  assert.equal(metrics.hasOptionDailyChange, false);
  assert.equal(metrics.optionDayChange, null);
  assert.match(metrics.optionDailyMissingReason, /OPRA/);
});

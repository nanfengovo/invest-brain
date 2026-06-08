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

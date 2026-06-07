import test from 'node:test';
import assert from 'node:assert/strict';
import {
  getOptionCandidates,
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

test('normalizes loose option trade records', () => {
  assert.deepEqual(normalizeOptionCandidate({
    symbol: 'NVDA',
    expiry_date: '2026-06-19',
    option_type: 'PUT',
    strike_price: 120,
    contract_symbol: 'NVDA 2026-06-19 PUT 120',
  }, 'recent-buy'), {
    id: 'NVDA 2026-06-19 PUT 120',
    symbol: 'NVDA 2026-06-19 PUT 120',
    name: 'NVDA 06-19 PUT 120',
    underlying: 'NVDA',
    expiration: '2026-06-19',
    optionType: 'PUT',
    strike: '120',
    contractSymbol: 'NVDA 2026-06-19 PUT 120',
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

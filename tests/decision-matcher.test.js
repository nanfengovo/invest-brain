import test from 'node:test';
import assert from 'node:assert/strict';
import { recommendDecisionForTrade, normalizeUnderlyingSymbol } from '../src/utils/decisionMatcher.js';

test('normalizes stock and option-like symbols to the underlying symbol', () => {
  assert.equal(normalizeUnderlyingSymbol('STOCK_AAPL'), 'AAPL');
  assert.equal(normalizeUnderlyingSymbol('AAPL_2026-06-19_200_CALL'), 'AAPL');
  assert.equal(normalizeUnderlyingSymbol('gb_nvda'), 'NVDA');
});

test('recommends the most likely active decision for a trade', () => {
  const trade = {
    symbol: 'NVDA',
    direction: 'BUY',
    trade_time: '2026-06-07T13:00:00Z',
  };
  const decisions = [
    {
      id: 'old-tsla',
      title: 'TSLA unrelated',
      asset_id: 'TSLA',
      status: 'ACTIVE',
      sentiment: 'BULLISH',
      created_at: '2026-06-01T00:00:00Z',
      priority: 5,
    },
    {
      id: 'nvda-ai',
      title: 'NVDA AI order thesis',
      asset_id: 'NVDA',
      status: 'WATCH',
      sentiment: 'BULLISH',
      created_at: '2026-06-05T00:00:00Z',
      priority: 4,
    },
  ];

  const recommendation = recommendDecisionForTrade(trade, decisions);
  assert.equal(recommendation.decision.id, 'nvda-ai');
  assert.ok(recommendation.score >= 42);
});

test('does not force weak matches', () => {
  const recommendation = recommendDecisionForTrade(
    { symbol: 'AAPL', direction: 'BUY', trade_time: '2026-06-07T00:00:00Z' },
    [{ id: 'x', title: 'Macro note', status: 'DRAFT', created_at: '2025-01-01T00:00:00Z' }]
  );
  assert.equal(recommendation, null);
});

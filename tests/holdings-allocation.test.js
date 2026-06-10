import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

test('holdings allocation shows every holding and keeps the donut interactive', () => {
  const page = readFileSync(new URL('../src/pages/HoldingsPage.jsx', import.meta.url), 'utf8');
  const css = readFileSync(new URL('../src/pages/HoldingsPage.css', import.meta.url), 'utf8');
  const database = readFileSync(new URL('../src/db/database.js', import.meta.url), 'utf8');

  assert.match(page, /const groupedHoldings = positiveHoldings\.reduce/);
  assert.match(page, /const allocationGroups = Array\.from\(groupedHoldings\.values\(\)\)/);
  assert.match(page, /function buildHoldingGroups/);
  assert.doesNotMatch(page, /symbol:\s*'其他'/);
  assert.doesNotMatch(page, /othersValue/);
  assert.match(page, /handleAllocationChartClick/);
  assert.match(page, /getHoldingDisplayName/);
  assert.match(page, /typeBreakdown/);
  assert.match(page, /getHoldingDisplayName\(holding\)/);
  assert.match(page, /holdings-page__allocation-row-main/);
  assert.match(page, /holdings-page__allocation-breakdown/);
  assert.match(page, /holdingGroups\.groups\.map/);
  assert.match(page, /holdings-page__holding-group/);
  assert.match(page, /holdings-page__holding-group-types/);
  assert.match(page, /ALLOCATION_TYPE_ORDER/);
  assert.match(page, /onClick=\{handleAllocationChartClick\}/);
  assert.match(page, /aria-label=\{`持仓占比饼图，当前选中/);
  assert.match(page, /aria-pressed=\{selectedAllocation\?\.id === row\.id\}/);
  assert.match(page, /style=\{\{ '--row-color': row\.color \}\}/);
  assert.match(page, /holdings-page__allocation-detail/);
  assert.match(page, /row\.typeLabel/);
  assert.match(page, /getHoldingRowKey/);
  assert.match(page, /position_key \|\| holding\.asset_id/);

  assert.match(css, /\.holdings-page__allocation-chart\s*\{[\s\S]*cursor: pointer/);
  assert.match(css, /\.holdings-page__allocation-row--active\s*\{[\s\S]*var\(--row-color\)/);
  assert.match(css, /\.holdings-page__holding-group\s*\{/);
  assert.match(css, /\.holdings-page__holding-group-types\s*\{/);
  assert.match(css, /\[data-theme='light'\] \.holdings-page__allocation/);

  assert.match(database, /function tradePositionKeySql/);
  assert.match(database, /position_key/);
  assert.match(database, /SELL_TO_CLOSE/);
  assert.match(database, /卖出平仓/);
  assert.match(database, /HAVING total_quantity > 0\.0001/);
  assert.match(database, /tradeExpiredOptionSql/);
  assert.match(database, /AND NOT \(\$\{tradeExpiredOptionSql\(\)\} AND \$\{tradeBuyDirectionSql\(\)\}\)/);
  assert.match(database, /COALESCE\(t\.lifecycle_status, 'ACTIVE'\) NOT IN \('EXPIRED_WORTHLESS', 'EXERCISED', 'ASSIGNED', 'CLOSED_TRADED'\)/);
  assert.match(database, /getTradesByAssetAndBroker/);
  assert.match(database, /usePositionKey/);
});

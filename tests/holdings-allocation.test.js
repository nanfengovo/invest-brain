import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

test('holdings allocation shows every holding and keeps the donut interactive', () => {
  const page = readFileSync(new URL('../src/pages/HoldingsPage.jsx', import.meta.url), 'utf8');
  const css = readFileSync(new URL('../src/pages/HoldingsPage.css', import.meta.url), 'utf8');

  assert.match(page, /const rows = positiveHoldings\.map/);
  assert.doesNotMatch(page, /symbol:\s*'其他'/);
  assert.doesNotMatch(page, /othersValue/);
  assert.match(page, /handleAllocationChartClick/);
  assert.match(page, /onClick=\{handleAllocationChartClick\}/);
  assert.match(page, /aria-label=\{`持仓占比饼图，当前选中/);
  assert.match(page, /aria-pressed=\{selectedAllocation\?\.id === row\.id\}/);
  assert.match(page, /style=\{\{ '--row-color': row\.color \}\}/);
  assert.match(page, /holdings-page__allocation-detail/);
  assert.match(page, /row\.typeLabel/);

  assert.match(css, /\.holdings-page__allocation-chart\s*\{[\s\S]*cursor: pointer/);
  assert.match(css, /\.holdings-page__allocation-row--active\s*\{[\s\S]*var\(--row-color\)/);
  assert.match(css, /\[data-theme='light'\] \.holdings-page__allocation/);
});

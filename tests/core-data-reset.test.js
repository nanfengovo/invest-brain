import test from 'node:test';
import assert from 'node:assert/strict';
import { CONFIG_DATA_TABLES, CORE_DATA_TABLES } from '../src/db/coreDataTables.js';

test('core data reset targets business tables only', () => {
  assert.deepEqual(CORE_DATA_TABLES, [
    'reviews',
    'decision_info_links',
    'information_asset_links',
    'information_sector_links',
    'viewpoints',
    'price_alerts',
    'trades',
    'decisions',
    'informations',
    'assets',
  ]);
});

test('core data reset preserves configuration and migration tables', () => {
  assert.deepEqual(CONFIG_DATA_TABLES, ['app_settings', '_migrations']);

  for (const table of CONFIG_DATA_TABLES) {
    assert.ok(!CORE_DATA_TABLES.includes(table), `${table} must not be cleared with business data`);
  }
});

import test from 'node:test';
import assert from 'node:assert/strict';
import { MIGRATIONS, getMigrationSQL } from '../src/db/migrations.js';

const allSql = MIGRATIONS
  .flatMap((migration) => migration.statements)
  .join('\n')
  .replace(/\s+/g, ' ');

const statements = MIGRATIONS
  .flatMap((migration) => migration.statements)
  .map((sql) => sql.replace(/\s+/g, ' ').trim());

function createTableStatement(tableName) {
  const statement = statements.find((sql) => {
    const pattern = new RegExp(`^CREATE TABLE IF NOT EXISTS ${tableName}\\b`, 'i');
    return pattern.test(sql);
  });
  assert.ok(statement, `expected ${tableName} table to exist`);
  return statement;
}

function schemaHasColumn(tableName, column) {
  const createHasColumn = new RegExp(`\\b${column}\\b`, 'i').test(createTableStatement(tableName));
  const alterHasColumn = statements.some((sql) => {
    const pattern = new RegExp(`^ALTER TABLE ${tableName} ADD COLUMN ${column}\\b`, 'i');
    return pattern.test(sql);
  });

  return createHasColumn || alterHasColumn;
}

function assertTableHasColumns(tableName, columns) {
  for (const column of columns) {
    assert.ok(schemaHasColumn(tableName, column), `${tableName}.${column} is required`);
  }
}

test('closed-loop schema keeps the forward funnel tables', () => {
  assertTableHasColumns('informations', ['id', 'title', 'type', 'url', 'content', 'asset_id', 'status']);
  assertTableHasColumns('viewpoints', ['id', 'info_id', 'content', 'status', 'version', 'author', 'quote', 'target_type']);
  assertTableHasColumns('decisions', ['id', 'title', 'content', 'confidence', 'sentiment', 'status', 'asset_id', 'priority']);
  assertTableHasColumns('trades', ['id', 'asset_id', 'decision_id', 'info_id', 'direction', 'quantity', 'price']);
  assertTableHasColumns('reviews', ['id', 'decision_id', 'review_content', 'is_successful', 'lessons', 'result_pnl']);
  assertTableHasColumns('information_asset_links', ['info_id', 'asset_id', 'position', 'created_at']);
  assertTableHasColumns('information_sector_links', ['info_id', 'sector', 'position', 'created_at']);
});

test('trades and reviews remain traceable back to decisions and information', () => {
  assert.match(createTableStatement('trades'), /FOREIGN KEY\(decision_id\) REFERENCES decisions\(id\)/i);
  assert.match(createTableStatement('trades'), /FOREIGN KEY\(asset_id\) REFERENCES assets\(id\)/i);
  assert.match(createTableStatement('reviews'), /FOREIGN KEY\(decision_id\) REFERENCES decisions\(id\)/i);
  assert.match(createTableStatement('decision_info_links'), /FOREIGN KEY\(decision_id\) REFERENCES decisions\(id\)/i);
  assert.match(createTableStatement('decision_info_links'), /FOREIGN KEY\(info_id\) REFERENCES informations\(id\)/i);
  assert.match(createTableStatement('information_asset_links'), /FOREIGN KEY\(info_id\) REFERENCES informations\(id\)/i);
  assert.match(createTableStatement('information_asset_links'), /FOREIGN KEY\(asset_id\) REFERENCES assets\(id\)/i);
  assert.match(createTableStatement('information_sector_links'), /FOREIGN KEY\(info_id\) REFERENCES informations\(id\)/i);
  assert.match(allSql, /ALTER TABLE trades ADD COLUMN info_id TEXT REFERENCES informations\(id\)/i);
});

test('discipline and lifecycle checks have indexed status fields', () => {
  assert.match(allSql, /CREATE INDEX IF NOT EXISTS idx_trades_decision ON trades\(decision_id\)/i);
  assert.match(allSql, /CREATE INDEX IF NOT EXISTS idx_decisions_status ON decisions\(status\)/i);
  assert.match(allSql, /CREATE INDEX IF NOT EXISTS idx_informations_status ON informations\(status\)/i);
  assert.match(allSql, /CREATE INDEX IF NOT EXISTS idx_viewpoints_status ON viewpoints\(status\)/i);
  assert.match(allSql, /CREATE INDEX IF NOT EXISTS idx_info_asset_links_asset ON information_asset_links\(asset_id\)/i);
  assert.match(allSql, /CREATE INDEX IF NOT EXISTS idx_info_sector_links_sector ON information_sector_links\(sector\)/i);
  assert.match(allSql, /CREATE INDEX IF NOT EXISTS idx_decision_info_links_info ON decision_info_links\(info_id\)/i);
  assert.match(allSql, /CREATE INDEX IF NOT EXISTS idx_decisions_priority ON decisions\(priority\)/i);
});

test('migrations are ordered and discoverable for replay', () => {
  const versions = MIGRATIONS.map((migration) => migration.version);
  const sortedVersions = [...versions].sort((a, b) => a - b);

  assert.deepEqual(versions, sortedVersions);
  assert.deepEqual(getMigrationSQL(0).map((migration) => migration.version), versions);
  assert.deepEqual(getMigrationSQL(Math.max(...versions)), []);
});

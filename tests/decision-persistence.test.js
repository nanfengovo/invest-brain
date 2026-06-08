import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildDecisionAssetPayload,
  getDecisionPersistenceErrorMessage,
  normalizeDecisionAssetId,
} from '../src/utils/decisionPersistence.js';

test('normalizes decision asset id before persistence', () => {
  assert.equal(normalizeDecisionAssetId(' stm '), 'STM');
  assert.equal(normalizeDecisionAssetId(''), null);
  assert.equal(normalizeDecisionAssetId(null), null);
});

test('builds a lightweight stock asset payload for decision foreign keys', () => {
  assert.deepEqual(buildDecisionAssetPayload(' stm ', ' 半导体 '), {
    id: 'STM',
    symbol: 'STM',
    name: 'STM',
    type: 'STOCK',
    sector: '半导体',
  });
  assert.equal(buildDecisionAssetPayload('', 'AI'), null);
});

test('maps SQLite foreign-key failures to Chinese copy', () => {
  const message = getDecisionPersistenceErrorMessage(
    new Error('SQLITE_CONSTRAINT_FOREIGNKEY: sqlite3 result code 787: FOREIGN KEY constraint failed'),
    '保存'
  );

  assert.match(message, /保存失败/);
  assert.match(message, /关联的资产或信息不存在/);
  assert.doesNotMatch(message, /SQLITE_CONSTRAINT_FOREIGNKEY/);
});

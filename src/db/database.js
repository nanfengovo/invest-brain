/**
 * Database interface for InvestBrain
 * Provides Promise-based API to communicate with SQLite Web Worker
 */

import { getMigrationSQL } from './migrations';
import { CORE_DATA_TABLES } from './coreDataTables';
import { buildTradePortfolioSummary } from '../utils/tradeLifecycle';

let worker = null;
let messageId = 0;
const pendingMessages = new Map();
let isReady = false;
let initPromise = null;

/**
 * Send a message to the worker and wait for response
 */
function sendMessage(type, payload = {}) {
  return new Promise((resolve, reject) => {
    const id = ++messageId;
    pendingMessages.set(id, { resolve, reject });
    worker.postMessage({ id, type, payload });

    // Timeout after 30 seconds
    setTimeout(() => {
      if (pendingMessages.has(id)) {
        pendingMessages.delete(id);
        reject(new Error(`Database operation timed out: ${type}`));
      }
    }, 30000);
  });
}

function normalizeList(value) {
  if (Array.isArray(value)) {
    return Array.from(
      new Set(
        value
          .map((item) => String(item || '').trim())
          .filter(Boolean)
      )
    );
  }

  if (value === null || value === undefined) return [];

  return Array.from(
    new Set(
      String(value)
        .split(/[,\n，、]/)
        .map((item) => item.trim())
        .filter(Boolean)
    )
  );
}

function normalizeSymbols(value) {
  return normalizeList(value).map((symbol) => symbol.toUpperCase());
}

function csvFromList(items) {
  const list = normalizeList(items);
  return list.length ? list.join(',') : null;
}

const TRADE_TIME_SECONDS_SQL = `CASE
  WHEN typeof(t.trade_time) IN ('integer', 'real') THEN
    CASE WHEN CAST(t.trade_time AS REAL) > 100000000000 THEN CAST(t.trade_time AS REAL) / 1000 ELSE CAST(t.trade_time AS REAL) END
  WHEN CAST(t.trade_time AS TEXT) <> '' AND CAST(t.trade_time AS TEXT) NOT GLOB '*[^0-9]*' THEN
    CASE WHEN CAST(t.trade_time AS REAL) > 100000000000 THEN CAST(t.trade_time AS REAL) / 1000 ELSE CAST(t.trade_time AS REAL) END
  ELSE unixepoch(t.trade_time)
END`;

const TRADE_AUTHOR_SQL = `COALESCE(NULLIF(TRIM(t.author), ''), '未标记')`;
const TRADE_WORKSPACE_SQL = `COALESCE(NULLIF(TRIM(t.workspace_scope), ''), 'personal')`;
const TRADE_AUTHOR_NO_ALIAS_SQL = `COALESCE(NULLIF(TRIM(author), ''), '未标记')`;
const TRADE_WORKSPACE_NO_ALIAS_SQL = `COALESCE(NULLIF(TRIM(workspace_scope), ''), 'personal')`;
const TRADE_BUY_DIRECTION_VALUES_SQL = `('BUY', 'OPEN', 'BTO', 'BUY_TO_OPEN', 'BUY_OPEN', 'OPEN_BUY', 'BOT', '买入', '买', '开仓', '买入开仓', '开仓买入', '买入_开仓', '开仓_买入')`;
const TRADE_SELL_DIRECTION_VALUES_SQL = `('SELL', 'CLOSE', 'STC', 'SELL_TO_CLOSE', 'SELL_CLOSE', 'CLOSE_SELL', 'SOLD', 'SLD', '卖出', '卖', '平仓', '已卖出', '卖出平仓', '平仓卖出', '卖出_平仓', '平仓_卖出')`;
const INFO_AUTHOR_SQL = `COALESCE(NULLIF(TRIM(i.author), ''), COALESCE(NULLIF(TRIM(i.source_author), ''), '未标记'))`;
const INFO_WORKSPACE_SQL = `COALESCE(NULLIF(TRIM(i.workspace_scope), ''), 'personal')`;
const INFO_AUTHOR_NO_ALIAS_SQL = `COALESCE(NULLIF(TRIM(author), ''), COALESCE(NULLIF(TRIM(source_author), ''), '未标记'))`;
const INFO_WORKSPACE_NO_ALIAS_SQL = `COALESCE(NULLIF(TRIM(workspace_scope), ''), 'personal')`;
const DECISION_AUTHOR_SQL = `COALESCE(NULLIF(TRIM(d.author), ''), COALESCE(NULLIF(TRIM(d.source_author), ''), '未标记'))`;
const DECISION_WORKSPACE_SQL = `COALESCE(NULLIF(TRIM(d.workspace_scope), ''), 'personal')`;
const DECISION_AUTHOR_NO_ALIAS_SQL = `COALESCE(NULLIF(TRIM(author), ''), COALESCE(NULLIF(TRIM(source_author), ''), '未标记'))`;
const DECISION_WORKSPACE_NO_ALIAS_SQL = `COALESCE(NULLIF(TRIM(workspace_scope), ''), 'personal')`;
const VIEWPOINT_AUTHOR_SQL = `COALESCE(NULLIF(TRIM(v.author), ''), COALESCE(NULLIF(TRIM(v.source_author), ''), '未标记'))`;
const VIEWPOINT_WORKSPACE_SQL = `COALESCE(NULLIF(TRIM(v.workspace_scope), ''), 'personal')`;
const VIEWPOINT_AUTHOR_NO_ALIAS_SQL = `COALESCE(NULLIF(TRIM(author), ''), COALESCE(NULLIF(TRIM(source_author), ''), '未标记'))`;
const VIEWPOINT_WORKSPACE_NO_ALIAS_SQL = `COALESCE(NULLIF(TRIM(workspace_scope), ''), 'personal')`;
const PERSONAL_SYNC_TABLES = [
  'assets',
  'informations',
  'information_asset_links',
  'information_sector_links',
  'decisions',
  'decision_info_links',
  'reviews',
  'viewpoints',
  'trades',
  'price_alerts',
];
const TEAM_SYNC_TABLES = [
  'assets',
  'informations',
  'information_asset_links',
  'information_sector_links',
  'decisions',
  'decision_info_links',
  'viewpoints',
  'trades',
];

function tradeDirectionValueSql(column = 't.direction') {
  return `UPPER(REPLACE(REPLACE(REPLACE(TRIM(COALESCE(${column}, '')), ' ', '_'), '-', '_'), '/', '_'))`;
}

function tradeBuyDirectionSql(column = 't.direction') {
  return `${tradeDirectionValueSql(column)} IN ${TRADE_BUY_DIRECTION_VALUES_SQL}`;
}

function tradeSellDirectionSql(column = 't.direction') {
  return `${tradeDirectionValueSql(column)} IN ${TRADE_SELL_DIRECTION_VALUES_SQL}`;
}

function tradeAssetTypeSql() {
  return `CASE
    WHEN UPPER(TRIM(COALESCE(a.type, ''))) = 'OPTION'
      OR t.option_type IS NOT NULL
      OR t.strike_price IS NOT NULL
      OR t.expiry_date IS NOT NULL
      OR t.contract_symbol IS NOT NULL
      THEN 'OPTION'
    ELSE UPPER(TRIM(COALESCE(NULLIF(a.type, ''), 'STOCK')))
  END`;
}

function tradeUnderlyingSql() {
  return `UPPER(TRIM(COALESCE(NULLIF(t.underlying_symbol, ''), NULLIF(a.underlying_symbol, ''), NULLIF(a.symbol, ''), NULLIF(t.asset_id, ''), '')))`;
}

function tradeSymbolSql() {
  return `CASE
    WHEN ${tradeAssetTypeSql()} = 'OPTION' THEN ${tradeUnderlyingSql()}
    ELSE UPPER(TRIM(COALESCE(NULLIF(a.symbol, ''), NULLIF(t.asset_id, ''), '')))
  END`;
}

function tradeRawExpirySql() {
  return `TRIM(COALESCE(NULLIF(t.expiry_date, ''), NULLIF(a.expiry_date, ''), ''))`;
}

function tradeExpirySql() {
  const rawExpiry = tradeRawExpirySql();
  return `CASE
    WHEN ${rawExpiry} GLOB '[0-9][0-9][0-9][0-9][0-9][0-9]' THEN '20' || substr(${rawExpiry}, 1, 2) || '-' || substr(${rawExpiry}, 3, 2) || '-' || substr(${rawExpiry}, 5, 2)
    WHEN ${rawExpiry} GLOB '[0-9][0-9][0-9][0-9][0-9][0-9][0-9][0-9]' THEN substr(${rawExpiry}, 1, 4) || '-' || substr(${rawExpiry}, 5, 2) || '-' || substr(${rawExpiry}, 7, 2)
    ELSE ${rawExpiry}
  END`;
}

function tradeStrikeSql() {
  return `CASE
    WHEN COALESCE(t.strike_price, a.strike_price) IS NULL THEN ''
    ELSE printf('%.8g', COALESCE(t.strike_price, a.strike_price))
  END`;
}

function tradeOptionTypeSql() {
  const rawType = `UPPER(TRIM(COALESCE(NULLIF(t.option_type, ''), NULLIF(a.option_type, ''), '')))`;
  return `CASE
    WHEN ${rawType} IN ('C', 'CALL') OR ${rawType} LIKE '%CALL%' OR ${rawType} LIKE '%认购%' THEN 'CALL'
    WHEN ${rawType} IN ('P', 'PUT') OR ${rawType} LIKE '%PUT%' OR ${rawType} LIKE '%认沽%' THEN 'PUT'
    ELSE ${rawType}
  END`;
}

function tradeContractSql() {
  return `UPPER(TRIM(COALESCE(NULLIF(t.contract_symbol, ''), NULLIF(a.id, ''), NULLIF(t.asset_id, ''), '')))`;
}

function tradePositionKeySql() {
  return `CASE
    WHEN ${tradeAssetTypeSql()} = 'OPTION' THEN
      CASE
        WHEN ${tradeExpirySql()} <> '' OR ${tradeStrikeSql()} <> '' OR ${tradeOptionTypeSql()} <> ''
          THEN 'OPTION|' || ${tradeUnderlyingSql()} || '|' || ${tradeExpirySql()} || '|' || ${tradeStrikeSql()} || '|' || ${tradeOptionTypeSql()}
        ELSE 'OPTION|' || ${tradeContractSql()}
      END
    ELSE ${tradeAssetTypeSql()} || '|' || ${tradeSymbolSql()}
  END`;
}

function tradeExpiredOptionSql() {
  return `(${tradeAssetTypeSql()} = 'OPTION' AND ${tradeExpirySql()} <> '' AND date(${tradeExpirySql()}) < date('now'))`;
}

function appendAuthorFilter(sql, params, author, authorSql = TRADE_AUTHOR_SQL) {
  const normalizedAuthor = String(author || '').trim();
  if (!normalizedAuthor) return sql;
  params.push(normalizedAuthor);
  return `${sql} AND ${authorSql} = ?`;
}

function normalizeWorkspaceScope(scope) {
  return scope === 'team' ? 'team' : 'personal';
}

function appendWorkspaceFilter(sql, params, scope = 'personal', workspaceSql = TRADE_WORKSPACE_SQL) {
  const normalizedScope = normalizeWorkspaceScope(scope);
  params.push(normalizedScope);
  return `${sql} AND ${workspaceSql} = ?`;
}

function normalizeSyncStatus(status) {
  const value = String(status || '').trim();
  return value || 'local';
}

function normalizeTeamVisible(value) {
  return value === true || value === 1 || value === '1' ? 1 : 0;
}

function withExportSyncMeta(row, author, targetScope) {
  const normalizedAuthor = String(row?.author || row?.source_author || author || '未标记').trim() || '未标记';
  return {
    ...row,
    author: normalizedAuthor,
    workspace_scope: targetScope,
    source_scope: targetScope,
    source_author: row?.source_author || normalizedAuthor,
    origin_id: row?.origin_id || row?.id,
    sync_status: targetScope === 'team' ? 'published' : 'backup',
  };
}

function authorClause(authorSql, author) {
  const normalizedAuthor = String(author || '').trim();
  return normalizedAuthor ? { sql: ` AND ${authorSql} = ?`, params: [normalizedAuthor] } : { sql: '', params: [] };
}

/**
 * Initialize the database
 */
export async function initDB() {
  if (initPromise) return initPromise;

  initPromise = (async () => {
    try {
      // Create worker
      worker = new Worker(new URL('./worker.js', import.meta.url), {
        type: 'module',
      });

      // Set up message handler
      worker.onmessage = (e) => {
        const { id, ...result } = e.data;
        const pending = pendingMessages.get(id);
        if (pending) {
          pendingMessages.delete(id);
          if (result.success === false) {
            pending.reject(new Error(result.error || 'Unknown database error'));
          } else {
            pending.resolve(result);
          }
        }
      };

      worker.onerror = (err) => {
        console.error('[Database] Worker error:', err);
      };

      // Initialize SQLite
      const initResult = await sendMessage('init');
      console.log('[Database] Initialized:', initResult);

      // Run migrations
      await runMigrations();

      isReady = true;

      // Request persistent storage
      if (navigator.storage && navigator.storage.persist) {
        const persistent = await navigator.storage.persist();
        console.log('[Database] Persistent storage:', persistent ? 'granted' : 'denied');
      }

      return { ready: true, persistent: initResult.persistent };
    } catch (err) {
      console.error('[Database] Init failed:', err);
      initPromise = null;
      throw err;
    }
  })();

  return initPromise;
}

/**
 * Run pending database migrations
 */
async function runMigrations() {
  // Ensure migrations table exists
  await sendMessage('exec', {
    sql: `CREATE TABLE IF NOT EXISTS _migrations (
      version INTEGER PRIMARY KEY,
      applied_at INTEGER NOT NULL
    )`,
  });

  // Get current version
  const result = await sendMessage('query', {
    sql: 'SELECT MAX(version) as current_version FROM _migrations',
  });
  const currentVersion = result.data?.[0]?.current_version || 0;
  console.log('[Database] Current schema version:', currentVersion);

  // Get pending migrations
  const pending = getMigrationSQL(currentVersion);

  for (const migration of pending) {
    console.log(
      `[Database] Applying migration v${migration.version}: ${migration.description}`
    );

    const statements = migration.statements.map((sql) => ({ sql }));
    await sendMessage('transaction', { statements });

    // Record migration
    await sendMessage('exec', {
      sql: 'INSERT INTO _migrations (version, applied_at) VALUES (?, ?)',
      params: [migration.version, Math.floor(Date.now() / 1000)],
    });

    console.log(`[Database] Migration v${migration.version} applied`);
  }
}

/**
 * Database API
 */
export const db = {
  /**
   * Check if database is ready
   */
  get isReady() {
    return isReady;
  },

  /**
   * Execute SQL (no return data)
   */
  async exec(sql, params = []) {
    if (!isReady) throw new Error('Database not initialized');
    return sendMessage('exec', { sql, params });
  },

  /**
   * Query SQL (returns array of objects)
   */
  async query(sql, params = []) {
    if (!isReady) throw new Error('Database not initialized');
    const result = await sendMessage('query', { sql, params });
    return result.data || [];
  },

  /**
   * Execute multiple statements in a transaction
   */
  async transaction(statements) {
    if (!isReady) throw new Error('Database not initialized');
    return sendMessage('transaction', { statements });
  },

  /**
   * Export the full database
   */
  async exportDB() {
    if (!isReady) throw new Error('Database not initialized');
    return sendMessage('export');
  },

  /**
   * Import database from backup or merge external data
   */
  async importDB(data, merge = false, options = {}) {
    if (!isReady) throw new Error('Database not initialized');
    return sendMessage('import', { data, merge, options });
  },

  // ==========================================
  // Asset operations
  // ==========================================

  async getAssets() {
    return this.query('SELECT * FROM assets ORDER BY symbol');
  },

  async hasAnyData() {
    const res = await this.query('SELECT COUNT(*) as count FROM informations');
    return res[0]?.count > 0;
  },

  // ==========================================
  // Insights Data (Closed Loop)
  // ==========================================
  async getClosedLoopData(startTimestamp = 0, endTimestamp = Date.now()) {
    const sql = `
      SELECT
        r.id as review_id,
        r.is_successful,
        r.result_pnl,
        r.review_content,
        r.lessons,
        r.created_at as review_date,
        d.id as decision_id,
        d.title as decision_title,
        d.content as decision_content,
        d.confidence,
        t.asset_id,
        a.symbol as asset_symbol,
        a.sector as asset_sector,
        a.type as asset_type,
        COALESCE(t.underlying_symbol, a.underlying_symbol, a.symbol) as underlying_symbol,
        COALESCE(t.strike_price, a.strike_price) as strike_price,
        COALESCE(t.expiry_date, a.expiry_date) as expiry_date,
        COALESCE(t.option_type, a.option_type) as option_type,
        COALESCE(t.multiplier, a.multiplier, CASE WHEN a.type = 'OPTION' THEN 100 ELSE 1 END) as multiplier,
        t.contract_symbol,
        t.lifecycle_status,
        t.closed_reason
      FROM reviews r
      JOIN decisions d ON r.decision_id = d.id
      LEFT JOIN (
        SELECT decision_id,
               MIN(asset_id) as asset_id,
               MIN(underlying_symbol) as underlying_symbol,
               MIN(strike_price) as strike_price,
               MIN(expiry_date) as expiry_date,
               MIN(option_type) as option_type,
               MIN(multiplier) as multiplier,
               MIN(contract_symbol) as contract_symbol,
               MIN(lifecycle_status) as lifecycle_status,
               MIN(closed_reason) as closed_reason
        FROM trades
        WHERE decision_id IS NOT NULL
        GROUP BY decision_id
      ) t ON t.decision_id = r.decision_id
      LEFT JOIN assets a ON t.asset_id = a.id
      WHERE r.created_at >= ? AND r.created_at <= ?
      ORDER BY r.created_at DESC
    `;
    return this.query(sql, [Math.floor(startTimestamp / 1000), Math.floor(endTimestamp / 1000)]);
  },

  // ==========================================
  // Asset operations
  // ==========================================

  async getAssetById(id) {
    const results = await this.query('SELECT * FROM assets WHERE id = ?', [id]);
    return results[0] || null;
  },

  async upsertAsset(asset) {
    const { id, symbol, name, type, sector, strike_price, expiry_date, underlying_symbol, option_type, multiplier } = asset;
    return this.exec(
      `INSERT OR REPLACE INTO assets (id, symbol, name, type, sector, strike_price, expiry_date, underlying_symbol, option_type, multiplier, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, COALESCE((SELECT created_at FROM assets WHERE id = ?), unixepoch()), unixepoch())`,
      [id, symbol, name || '', type || 'STOCK', sector || null, strike_price || null, expiry_date || null, underlying_symbol || null, option_type || null, multiplier || (type === 'OPTION' ? 100 : 1), id]
    );
  },

  // ==========================================
  // Trade operations
  // ==========================================

  async getTrades(limit = 1000, offset = 0, scope = 'personal') {
    const params = [];
    let sql = `SELECT t.*, a.symbol, a.name as asset_name, a.type as asset_type, a.sector as asset_sector,
                     COALESCE(t.underlying_symbol, a.underlying_symbol) as underlying_symbol,
                     COALESCE(t.strike_price, a.strike_price) as strike_price,
                     COALESCE(t.expiry_date, a.expiry_date) as expiry_date,
                     COALESCE(t.option_type, a.option_type) as option_type,
                     COALESCE(t.multiplier, a.multiplier, CASE WHEN a.type = 'OPTION' THEN 100 ELSE 1 END) as multiplier,
                     d.title as decision_title, t.broker
              FROM trades t
              LEFT JOIN assets a ON t.asset_id = a.id
              LEFT JOIN decisions d ON t.decision_id = d.id
              WHERE 1 = 1`;
    sql = appendWorkspaceFilter(sql, params, scope);
    sql += ` ORDER BY ${TRADE_TIME_SECONDS_SQL} DESC
             LIMIT ? OFFSET ?`;
    params.push(limit, offset);
    return this.query(
      sql,
      params
    );
  },

  async getTradeById(id) {
    const results = await this.query(
      `SELECT t.*, a.symbol, a.name as asset_name, a.type as asset_type,
              COALESCE(t.underlying_symbol, a.underlying_symbol) as underlying_symbol,
              COALESCE(t.strike_price, a.strike_price) as strike_price,
              COALESCE(t.expiry_date, a.expiry_date) as expiry_date,
              COALESCE(t.option_type, a.option_type) as option_type,
              COALESCE(t.multiplier, a.multiplier, CASE WHEN a.type = 'OPTION' THEN 100 ELSE 1 END) as multiplier,
              d.title as decision_title
       FROM trades t
       LEFT JOIN assets a ON t.asset_id = a.id
       LEFT JOIN decisions d ON t.decision_id = d.id
       WHERE t.id = ?`,
      [id]
    );
    return results[0] || null;
  },

  async addTrade(trade) {
    const { id, asset_id, decision_id, direction, quantity, price, fee, account, trade_time, note, broker, info_id, underlying_symbol, strike_price, expiry_date, option_type, contract_symbol, multiplier, lifecycle_status, closed_reason, exercised_stock_trade_id, author, workspace_scope, source_author, source_scope, origin_id, sync_status } = trade;
    return this.exec(
      `INSERT INTO trades (id, asset_id, decision_id, info_id, direction, quantity, price, fee, account, trade_time, note, broker, underlying_symbol, strike_price, expiry_date, option_type, contract_symbol, multiplier, lifecycle_status, closed_reason, exercised_stock_trade_id, author, workspace_scope, source_author, source_scope, origin_id, sync_status)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [id, asset_id, decision_id || null, info_id || null, direction, quantity, price, fee || 0, account || null, trade_time, note || null, broker || null, underlying_symbol || null, strike_price || null, expiry_date || null, option_type || null, contract_symbol || null, multiplier || (option_type ? 100 : 1), lifecycle_status || 'ACTIVE', closed_reason || null, exercised_stock_trade_id || null, author || null, workspace_scope || 'personal', source_author || author || null, source_scope || workspace_scope || 'personal', origin_id || id, sync_status || 'local']
    );
  },

  async updateTrade(trade) {
    const { id, asset_id, decision_id, direction, quantity, price, fee, account, trade_time, note, broker, info_id, underlying_symbol, strike_price, expiry_date, option_type, contract_symbol, multiplier, lifecycle_status, closed_reason, exercised_stock_trade_id, author, workspace_scope, source_author, source_scope, origin_id, sync_status } = trade;
    return this.exec(
      `UPDATE trades SET asset_id = ?, decision_id = ?, info_id = ?, direction = ?, quantity = ?, price = ?, fee = ?, account = ?, trade_time = ?, note = ?, broker = ?, underlying_symbol = ?, strike_price = ?, expiry_date = ?, option_type = ?, contract_symbol = ?, multiplier = ?, lifecycle_status = ?, closed_reason = ?, exercised_stock_trade_id = ?, author = ?, workspace_scope = ?, source_author = ?, source_scope = ?, origin_id = ?, sync_status = ? WHERE id = ?`,
      [asset_id, decision_id || null, info_id || null, direction, quantity, price, fee || 0, account || null, trade_time, note || null, broker || null, underlying_symbol || null, strike_price || null, expiry_date || null, option_type || null, contract_symbol || null, multiplier || (option_type ? 100 : 1), lifecycle_status || 'ACTIVE', closed_reason || null, exercised_stock_trade_id || null, author || null, workspace_scope || 'personal', source_author || author || null, source_scope || workspace_scope || 'personal', origin_id || id, sync_status || 'local', id]
    );
  },

  async deleteTrade(id) {
    return this.exec('DELETE FROM trades WHERE id = ?', [id]);
  },

  async markExpiredOptionTrades(scope = 'personal') {
    const candidateWorkspaceSql = `COALESCE(NULLIF(TRIM(candidate.workspace_scope), ''), 'personal')`;
    const candidateAuthorSql = `COALESCE(NULLIF(TRIM(candidate.author), ''), '未标记')`;
    const outerAuthorSql = `COALESCE(NULLIF(TRIM(trades.author), ''), '未标记')`;
    const candidateContractSql = `UPPER(TRIM(COALESCE(NULLIF(candidate.contract_symbol, ''), '')))`;
    const outerContractSql = `UPPER(TRIM(COALESCE(NULLIF(trades.contract_symbol, ''), '')))`;
    const candidateUnderlyingSql = `UPPER(TRIM(COALESCE(NULLIF(candidate.underlying_symbol, ''), NULLIF(candidate.asset_id, ''), '')))`;
    const outerUnderlyingSql = `UPPER(TRIM(COALESCE(NULLIF(trades.underlying_symbol, ''), NULLIF(trades.asset_id, ''), '')))`;
    const candidateStrikeSql = `CASE WHEN candidate.strike_price IS NULL THEN '' ELSE printf('%.8g', candidate.strike_price) END`;
    const outerStrikeSql = `CASE WHEN trades.strike_price IS NULL THEN '' ELSE printf('%.8g', trades.strike_price) END`;
    const candidateOptionTypeSql = `UPPER(TRIM(COALESCE(NULLIF(candidate.option_type, ''), '')))`;
    const outerOptionTypeSql = `UPPER(TRIM(COALESCE(NULLIF(trades.option_type, ''), '')))`;
    const sameOptionPositionSql = `(
      candidate.asset_id = trades.asset_id
      OR (${candidateContractSql} <> '' AND ${candidateContractSql} = ${outerContractSql})
      OR (
        ${candidateUnderlyingSql} = ${outerUnderlyingSql}
        AND COALESCE(NULLIF(candidate.expiry_date, ''), '') = COALESCE(NULLIF(trades.expiry_date, ''), '')
        AND ${candidateStrikeSql} = ${outerStrikeSql}
        AND ${candidateOptionTypeSql} = ${outerOptionTypeSql}
      )
    )`;
    const openQuantitySql = `(SELECT COALESCE(SUM(CASE
      WHEN ${tradeBuyDirectionSql('candidate.direction')} THEN candidate.quantity
      WHEN ${tradeSellDirectionSql('candidate.direction')} THEN -candidate.quantity
      ELSE 0
    END), 0)
      FROM trades candidate
      WHERE ${candidateWorkspaceSql} = COALESCE(NULLIF(TRIM(trades.workspace_scope), ''), 'personal')
        AND ${candidateAuthorSql} = ${outerAuthorSql}
        AND (
          ${tradeSellDirectionSql('candidate.direction')}
          OR (
            ${tradeBuyDirectionSql('candidate.direction')}
            AND COALESCE(candidate.lifecycle_status, 'ACTIVE') NOT IN ('EXPIRED_WORTHLESS', 'EXERCISED', 'ASSIGNED', 'CLOSED_TRADED')
          )
        )
        AND ${sameOptionPositionSql})`;
    const params = [normalizeWorkspaceScope(scope)];
    return this.exec(
      `UPDATE trades
          SET lifecycle_status = 'EXPIRED_WORTHLESS',
              closed_reason = 'EXPIRED_WORTHLESS',
              sync_status = CASE WHEN sync_status = 'mirror' THEN sync_status ELSE 'local' END,
              updated_at = unixepoch()
        WHERE COALESCE(NULLIF(TRIM(workspace_scope), ''), 'personal') = ?
          AND expiry_date IS NOT NULL
          AND date(expiry_date) < date('now')
          AND (option_type IS NOT NULL OR strike_price IS NOT NULL OR contract_symbol IS NOT NULL)
          AND ${tradeBuyDirectionSql('direction')}
          AND COALESCE(lifecycle_status, 'ACTIVE') NOT IN ('EXPIRED_WORTHLESS', 'EXERCISED', 'ASSIGNED', 'CLOSED_TRADED')
          AND ${openQuantitySql} > 0.0001`,
      params
    );
  },

  async getTradesByAssetAndBroker(assetId, broker = null, author = null, scope = 'personal') {
    const lookupKey = String(assetId || '').trim();
    const usePositionKey = lookupKey.includes('|');
    let sql = `SELECT t.*, d.title as decision_title
               FROM trades t
               LEFT JOIN assets a ON t.asset_id = a.id
               LEFT JOIN decisions d ON t.decision_id = d.id
               WHERE ${usePositionKey ? tradePositionKeySql() : 't.asset_id'} = ?`;
    const params = [lookupKey];
    if (broker && !usePositionKey) {
      sql += ` AND t.broker = ?`;
      params.push(broker);
    } else if (!usePositionKey) {
      sql += ` AND (t.broker IS NULL OR t.broker = '')`;
    }
    sql = appendWorkspaceFilter(sql, params, scope);
    sql = appendAuthorFilter(sql, params, author);
    sql += ` ORDER BY ${TRADE_TIME_SECONDS_SQL} DESC`;

    return this.query(sql, params);
  },

  // ==========================================
  // Decision operations
  // ==========================================

  async getDecisions(status = null, scope = 'personal') {
    const selectSql = `SELECT d.*,
                a.symbol as asset_symbol,
                (SELECT COUNT(*) FROM trades WHERE decision_id = d.id AND COALESCE(NULLIF(TRIM(workspace_scope), ''), 'personal') = COALESCE(NULLIF(TRIM(d.workspace_scope), ''), 'personal')) as trade_count,
                (SELECT COUNT(*) FROM decision_info_links WHERE decision_id = d.id) as linked_info_count,
                (SELECT GROUP_CONCAT(i.title, '、')
                   FROM decision_info_links dil
                   JOIN informations i ON i.id = dil.info_id
                  WHERE dil.decision_id = d.id) as linked_info_titles,
                r.id as review_id, r.is_successful, r.result_pnl, r.lessons, r.review_content
         FROM decisions d
         LEFT JOIN assets a ON d.asset_id = a.id
         LEFT JOIN reviews r ON r.decision_id = d.id`;
    const orderSql = `ORDER BY
         CASE d.status
           WHEN 'ACTIVE' THEN 0
           WHEN 'WATCH' THEN 1
           WHEN 'DRAFT' THEN 2
           WHEN 'CLOSED' THEN 3
           WHEN 'ENDED' THEN 3
           WHEN 'ABANDONED' THEN 4
           ELSE 5
         END,
         COALESCE(d.priority, 3) DESC,
         d.created_at DESC`;

    const params = [];
    let whereSql = `WHERE 1 = 1`;
    whereSql = appendWorkspaceFilter(whereSql, params, scope, DECISION_WORKSPACE_SQL);
    if (status) {
      whereSql += ` AND d.status = ?`;
      params.push(status);
    }
    return this.query(
      `${selectSql}
       ${whereSql}
       ${orderSql}`
      ,
      params
    );
  },

  async getDecisionById(id) {
    const results = await this.query(
      `SELECT d.*,
              a.symbol as asset_symbol,
              (SELECT COUNT(*) FROM trades WHERE decision_id = d.id) as trade_count,
              (SELECT GROUP_CONCAT(info_id) FROM decision_info_links WHERE decision_id = d.id) as info_ids,
              (SELECT COUNT(*) FROM decision_info_links WHERE decision_id = d.id) as linked_info_count,
              r.id as review_id, r.is_successful, r.result_pnl, r.lessons, r.review_content
       FROM decisions d
       LEFT JOIN assets a ON d.asset_id = a.id
       LEFT JOIN reviews r ON r.decision_id = d.id
       WHERE d.id = ?`,
      [id]
    );
    return results[0] || null;
  },

  async addDecision(decision) {
    const { id, title, content, confidence, sentiment, status, asset_id, sector, priority, info_ids, author, workspace_scope, source_author, source_scope, origin_id, sync_status, team_visible } = decision;
    await this.exec(
      `INSERT INTO decisions (id, title, content, confidence, sentiment, status, asset_id, sector, priority, author, workspace_scope, source_author, source_scope, origin_id, sync_status, team_visible)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        id,
        title,
        content || '',
        confidence || 3,
        sentiment || 'NEUTRAL',
        status || 'ACTIVE',
        asset_id || null,
        sector || null,
        priority || 3,
        author || null,
        workspace_scope || 'personal',
        source_author || author || null,
        source_scope || workspace_scope || 'personal',
        origin_id || id,
        normalizeSyncStatus(sync_status),
        normalizeTeamVisible(team_visible),
      ]
    );
    if (Array.isArray(info_ids)) {
      await this.setDecisionInfoLinks(id, info_ids);
    }
    return { id };
  },

  async updateDecision(id, updates) {
    const fields = [];
    const values = [];
    const { info_ids, ...columnUpdates } = updates;
    for (const [key, value] of Object.entries(columnUpdates)) {
      if (key !== 'id') {
        fields.push(`${key} = ?`);
        values.push(value);
      }
    }
    if (fields.length) {
      fields.push('updated_at = unixepoch()');
      if (!Object.prototype.hasOwnProperty.call(columnUpdates, 'sync_status')) {
        fields.push(`sync_status = 'local'`);
      }
      values.push(id);
      await this.exec(
        `UPDATE decisions SET ${fields.join(', ')} WHERE id = ?`,
        values
      );
    }
    if (Array.isArray(info_ids)) {
      await this.setDecisionInfoLinks(id, info_ids);
    }
    return { id };
  },

  async setDecisionTeamVisible(id, visible) {
    return this.exec(
      `UPDATE decisions
          SET team_visible = ?,
              sync_status = CASE WHEN ? = 1 THEN 'local' ELSE 'local' END,
              updated_at = unixepoch()
        WHERE id = ? AND COALESCE(NULLIF(TRIM(workspace_scope), ''), 'personal') = 'personal'`,
      [normalizeTeamVisible(visible), normalizeTeamVisible(visible), id]
    );
  },

  async setDecisionInfoLinks(decisionId, infoIds = []) {
    const normalizedInfoIds = normalizeList(infoIds);
    await this.exec('DELETE FROM decision_info_links WHERE decision_id = ?', [decisionId]);
    for (const infoId of normalizedInfoIds) {
      await this.exec(
        'INSERT OR IGNORE INTO decision_info_links (decision_id, info_id) VALUES (?, ?)',
        [decisionId, infoId]
      );
    }
  },

  async getDecisionsByInformation(infoId, scope = 'personal') {
    return this.query(
      `SELECT d.*, a.symbol as asset_symbol,
              (SELECT COUNT(*) FROM trades WHERE decision_id = d.id) as trade_count
       FROM decision_info_links dil
       JOIN decisions d ON d.id = dil.decision_id
       LEFT JOIN assets a ON d.asset_id = a.id
       WHERE dil.info_id = ?
         AND ${DECISION_WORKSPACE_SQL} = ?
       ORDER BY
         CASE d.status
           WHEN 'ACTIVE' THEN 0
           WHEN 'WATCH' THEN 1
           WHEN 'DRAFT' THEN 2
           WHEN 'CLOSED' THEN 3
           WHEN 'ENDED' THEN 3
           WHEN 'ABANDONED' THEN 4
           ELSE 5
         END,
         COALESCE(d.priority, 3) DESC,
         d.created_at DESC`,
      [infoId, normalizeWorkspaceScope(scope)]
    );
  },

  async deleteDecision(id) {
    // Remove linked trades' decision references first
    await this.exec('UPDATE trades SET decision_id = NULL WHERE decision_id = ?', [id]);
    await this.exec('DELETE FROM decision_info_links WHERE decision_id = ?', [id]);
    await this.exec('DELETE FROM reviews WHERE decision_id = ?', [id]);
    return this.exec('DELETE FROM decisions WHERE id = ?', [id]);
  },

  // ==========================================
  // Review operations
  // ==========================================

  async addReview(review) {
    const { id, decision_id, review_content, is_successful, lessons, result_pnl } = review;
    return this.exec(
      `INSERT OR REPLACE INTO reviews (id, decision_id, review_content, is_successful, lessons, result_pnl)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [id, decision_id, review_content, is_successful, lessons, result_pnl]
    );
  },

  // ==========================================
  // Holdings & P&L calculations
  // ==========================================

  async getTradeAuthors(scope = 'personal') {
    const params = [];
    let sql = `SELECT DISTINCT ${TRADE_AUTHOR_SQL} as author
       FROM trades t
       WHERE 1 = 1`;
    sql = appendWorkspaceFilter(sql, params, scope);
    sql += ` ORDER BY author`;
    return this.query(
      sql,
      params
    );
  },

  async backfillTradeAuthor(author) {
    const normalizedAuthor = String(author || '').trim();
    if (!normalizedAuthor) return { changes: 0 };
    const shouldClaimAuthor = `(author IS NULL OR TRIM(author) = '' OR TRIM(author) = '未标记')`;
    const shouldClaimSourceAuthor = `(source_author IS NULL OR TRIM(source_author) = '' OR TRIM(source_author) = '未标记')`;
    return this.transaction([
      {
        sql: `UPDATE trades
                SET author = ?,
                    source_author = CASE WHEN ${shouldClaimSourceAuthor} THEN ? ELSE source_author END,
                    sync_status = CASE WHEN sync_status = 'mirror' THEN sync_status ELSE 'local' END
              WHERE ${TRADE_WORKSPACE_NO_ALIAS_SQL} = 'personal'
                AND ${shouldClaimAuthor}`,
        params: [normalizedAuthor, normalizedAuthor],
      },
      {
        sql: `UPDATE informations
                SET author = ?,
                    source_author = CASE WHEN ${shouldClaimSourceAuthor} THEN ? ELSE source_author END,
                    sync_status = CASE WHEN sync_status = 'mirror' THEN sync_status ELSE 'local' END,
                    updated_at = unixepoch()
              WHERE ${INFO_WORKSPACE_NO_ALIAS_SQL} = 'personal'
                AND ${shouldClaimAuthor}`,
        params: [normalizedAuthor, normalizedAuthor],
      },
      {
        sql: `UPDATE decisions
                SET author = ?,
                    source_author = CASE WHEN ${shouldClaimSourceAuthor} THEN ? ELSE source_author END,
                    sync_status = CASE WHEN sync_status = 'mirror' THEN sync_status ELSE 'local' END,
                    updated_at = unixepoch()
              WHERE ${DECISION_WORKSPACE_NO_ALIAS_SQL} = 'personal'
                AND ${shouldClaimAuthor}`,
        params: [normalizedAuthor, normalizedAuthor],
      },
      {
        sql: `UPDATE viewpoints
                SET author = ?,
                    source_author = CASE WHEN ${shouldClaimSourceAuthor} THEN ? ELSE source_author END,
                    sync_status = CASE WHEN sync_status = 'mirror' THEN sync_status ELSE 'local' END,
                    updated_at = unixepoch()
              WHERE ${VIEWPOINT_WORKSPACE_NO_ALIAS_SQL} = 'personal'
                AND ${shouldClaimAuthor}`,
        params: [normalizedAuthor, normalizedAuthor],
      },
    ]);
  },

  async clearTradeWorkspace(scope = 'team') {
    return this.exec(
      `DELETE FROM trades WHERE COALESCE(NULLIF(TRIM(workspace_scope), ''), 'personal') = ?`,
      [normalizeWorkspaceScope(scope)]
    );
  },

  async clearWorkspace(scope = 'team') {
    const normalizedScope = normalizeWorkspaceScope(scope);
    const statements = [
      { sql: `DELETE FROM reviews WHERE decision_id IN (SELECT id FROM decisions WHERE COALESCE(NULLIF(TRIM(workspace_scope), ''), 'personal') = ?)`, params: [normalizedScope] },
      { sql: `DELETE FROM decision_info_links WHERE decision_id IN (SELECT id FROM decisions WHERE COALESCE(NULLIF(TRIM(workspace_scope), ''), 'personal') = ?) OR info_id IN (SELECT id FROM informations WHERE COALESCE(NULLIF(TRIM(workspace_scope), ''), 'personal') = ?)`, params: [normalizedScope, normalizedScope] },
      { sql: `DELETE FROM information_asset_links WHERE info_id IN (SELECT id FROM informations WHERE COALESCE(NULLIF(TRIM(workspace_scope), ''), 'personal') = ?)`, params: [normalizedScope] },
      { sql: `DELETE FROM information_sector_links WHERE info_id IN (SELECT id FROM informations WHERE COALESCE(NULLIF(TRIM(workspace_scope), ''), 'personal') = ?)`, params: [normalizedScope] },
      { sql: `DELETE FROM viewpoints WHERE COALESCE(NULLIF(TRIM(workspace_scope), ''), 'personal') = ?`, params: [normalizedScope] },
      { sql: `DELETE FROM trades WHERE COALESCE(NULLIF(TRIM(workspace_scope), ''), 'personal') = ?`, params: [normalizedScope] },
      { sql: `DELETE FROM decisions WHERE COALESCE(NULLIF(TRIM(workspace_scope), ''), 'personal') = ?`, params: [normalizedScope] },
      { sql: `DELETE FROM informations WHERE COALESCE(NULLIF(TRIM(workspace_scope), ''), 'personal') = ?`, params: [normalizedScope] },
    ];
    return this.transaction(statements);
  },

  async clearCoreData() {
    const statements = CORE_DATA_TABLES.map((table) => ({
      sql: `DELETE FROM ${table}`,
    }));
    return this.transaction(statements);
  },

  async markWorkspaceSyncStatus({ author = null, scope = 'personal', targetScope = 'personal' } = {}) {
    const normalizedScope = normalizeWorkspaceScope(scope);
    const status = targetScope === 'team' ? 'published' : 'backup';
    const statements = [];
    const appendAuthor = (sql, authorSql) => {
      const filter = authorClause(authorSql, author);
      return { sql: `${sql}${filter.sql}`, params: filter.params };
    };

    const tradeFilter = authorClause(TRADE_AUTHOR_NO_ALIAS_SQL, author);
    statements.push({
      sql: `UPDATE trades
              SET sync_status = ?,
                  updated_at = COALESCE(updated_at, created_at, unixepoch())
            WHERE ${TRADE_WORKSPACE_NO_ALIAS_SQL} = ?${tradeFilter.sql}`,
      params: [status, normalizedScope, ...tradeFilter.params],
    });

    const infoFilter = authorClause(INFO_AUTHOR_NO_ALIAS_SQL, author);
    statements.push({
      sql: `UPDATE informations
          SET sync_status = ?,
              updated_at = unixepoch()
        WHERE ${INFO_WORKSPACE_NO_ALIAS_SQL} = ?${targetScope === 'team' ? ' AND COALESCE(team_visible, 0) = 1' : ''}${infoFilter.sql}`,
      params: [status, normalizedScope, ...infoFilter.params],
    });

    const decisionFilter = authorClause(DECISION_AUTHOR_NO_ALIAS_SQL, author);
    statements.push({
      sql: `UPDATE decisions
          SET sync_status = ?,
              updated_at = unixepoch()
        WHERE ${DECISION_WORKSPACE_NO_ALIAS_SQL} = ?${targetScope === 'team' ? ' AND COALESCE(team_visible, 0) = 1' : ''}${decisionFilter.sql}`,
      params: [status, normalizedScope, ...decisionFilter.params],
    });

    const viewpointFilter = authorClause(VIEWPOINT_AUTHOR_NO_ALIAS_SQL, author);
    statements.push({
      sql: `UPDATE viewpoints
          SET sync_status = ?,
              updated_at = unixepoch()
        WHERE ${VIEWPOINT_WORKSPACE_NO_ALIAS_SQL} = ?${targetScope === 'team' ? ' AND COALESCE(team_visible, 0) = 1' : ''}${viewpointFilter.sql}`,
      params: [status, normalizedScope, ...viewpointFilter.params],
    });

    return this.transaction(statements);
  },

  async getHoldings(author = null, scope = 'personal') {
    const assetTypeSql = tradeAssetTypeSql();
    const positionKeySql = tradePositionKeySql();
    const symbolSql = tradeSymbolSql();
    const underlyingSql = tradeUnderlyingSql();
    const expirySql = tradeExpirySql();
    const strikeSql = tradeStrikeSql();
    const optionTypeSql = tradeOptionTypeSql();
    let sql = `SELECT
        ${TRADE_AUTHOR_SQL} as author,
        ${positionKeySql} as position_key,
        COALESCE(MIN(CASE WHEN ${tradeBuyDirectionSql()} THEN a.id END), MIN(a.id), MIN(t.asset_id)) as asset_id,
        ${symbolSql} as symbol,
        COALESCE(MAX(NULLIF(a.name, '')), ${symbolSql}) as name,
        ${assetTypeSql} as type,
        MAX(a.sector) as sector,
        ${underlyingSql} as underlying_symbol,
        NULLIF(${strikeSql}, '') as strike_price,
        NULLIF(${expirySql}, '') as expiry_date,
        NULLIF(${optionTypeSql}, '') as option_type,
        COALESCE(MAX(NULLIF(t.contract_symbol, '')), MAX(NULLIF(a.id, '')), MAX(NULLIF(t.asset_id, ''))) as contract_symbol,
        COALESCE(MAX(COALESCE(t.multiplier, a.multiplier)), CASE WHEN ${assetTypeSql} = 'OPTION' THEN 100 ELSE 1 END) as multiplier,
	        GROUP_CONCAT(DISTINCT NULLIF(TRIM(t.broker), '')) as broker,
	        SUM(CASE
	          WHEN ${tradeBuyDirectionSql()} THEN t.quantity
	          WHEN ${tradeSellDirectionSql()} THEN -t.quantity
	          ELSE 0
	        END) as total_quantity,
	        SUM(CASE
	          WHEN ${tradeBuyDirectionSql()} THEN t.quantity * t.price
	          ELSE 0
	        END) / NULLIF(SUM(CASE
	          WHEN ${tradeBuyDirectionSql()} THEN t.quantity
	          ELSE 0
	        END), 0) as avg_cost,
        SUM(t.fee) as total_fees,
        COUNT(t.id) as trade_count,
        MIN(${TRADE_TIME_SECONDS_SQL}) as first_trade,
        MAX(${TRADE_TIME_SECONDS_SQL}) as last_trade
	       FROM trades t
	       JOIN assets a ON t.asset_id = a.id
	       WHERE 1 = 1
         AND (
           ${tradeSellDirectionSql()}
           OR (
             ${tradeBuyDirectionSql()}
             AND COALESCE(t.lifecycle_status, 'ACTIVE') NOT IN ('EXPIRED_WORTHLESS', 'EXERCISED', 'ASSIGNED', 'CLOSED_TRADED')
             AND NOT ${tradeExpiredOptionSql()}
           )
         )`;
    const params = [];
    sql = appendWorkspaceFilter(sql, params, scope);
    sql = appendAuthorFilter(sql, params, author);
    sql += `
       GROUP BY ${positionKeySql}, ${assetTypeSql}, ${symbolSql}, ${underlyingSql}, ${expirySql}, ${strikeSql}, ${optionTypeSql}, ${TRADE_AUTHOR_SQL}
       HAVING total_quantity > 0.0001
       ORDER BY symbol, author`;

    return this.query(
      sql,
      params
    );
  },

  async getPortfolioSummary(author = null, scope = 'personal') {
    let sql = `SELECT
        t.*,
        a.symbol,
        a.type as asset_type,
        COALESCE(t.underlying_symbol, a.underlying_symbol) as underlying_symbol,
        COALESCE(t.strike_price, a.strike_price) as strike_price,
        COALESCE(t.expiry_date, a.expiry_date) as expiry_date,
        COALESCE(t.option_type, a.option_type) as option_type,
        COALESCE(t.multiplier, a.multiplier, CASE WHEN a.type = 'OPTION' THEN 100 ELSE 1 END) as multiplier
       FROM trades t
       LEFT JOIN assets a ON t.asset_id = a.id
       WHERE 1 = 1`;
    const params = [];
    sql = appendWorkspaceFilter(sql, params, scope);
    sql = appendAuthorFilter(sql, params, author);
    const trades = await this.query(
      sql,
      params
    );
    return buildTradePortfolioSummary(trades);
  },

  async exportTradeWorkspaceDump({ author = null, scope = 'personal', targetScope = 'personal' } = {}) {
    const normalizedScope = normalizeWorkspaceScope(scope);
    const allowedTables = targetScope === 'team' ? TEAM_SYNC_TABLES : PERSONAL_SYNC_TABLES;
    const rows = await this.query(
      `SELECT name FROM sqlite_master
        WHERE type='table'
          AND name NOT LIKE 'sqlite_%'
          AND name != '_migrations'
        ORDER BY name`
    );
    const tables = {};
    for (const table of rows) {
      if (!allowedTables.includes(table.name)) continue;
      if (table.name === 'trades') {
        let sql = `SELECT * FROM trades t WHERE 1 = 1`;
        const params = [];
        sql = appendWorkspaceFilter(sql, params, normalizedScope);
        sql = appendAuthorFilter(sql, params, author);
        const trades = await this.query(sql, params);
        tables.trades = trades.map((trade) => ({
          ...withExportSyncMeta(trade, author, targetScope),
          sync_status: targetScope === 'team' ? 'published' : 'backup',
        }));
      } else if (table.name === 'informations') {
        let sql = `SELECT * FROM informations i WHERE 1 = 1`;
        const params = [];
        sql = appendWorkspaceFilter(sql, params, normalizedScope, INFO_WORKSPACE_SQL);
        sql = appendAuthorFilter(sql, params, author, INFO_AUTHOR_SQL);
        if (targetScope === 'team') {
          sql += ` AND COALESCE(i.team_visible, 0) = 1`;
        }
        const infos = await this.query(sql, params);
        tables.informations = infos.map((info) => withExportSyncMeta(info, author, targetScope));
      } else if (table.name === 'decisions') {
        let sql = `SELECT * FROM decisions d WHERE 1 = 1`;
        const params = [];
        sql = appendWorkspaceFilter(sql, params, normalizedScope, DECISION_WORKSPACE_SQL);
        sql = appendAuthorFilter(sql, params, author, DECISION_AUTHOR_SQL);
        if (targetScope === 'team') {
          sql += ` AND COALESCE(d.team_visible, 0) = 1`;
        }
        const decisions = await this.query(sql, params);
        tables.decisions = decisions.map((decision) => withExportSyncMeta(decision, author, targetScope));
      } else if (table.name === 'viewpoints') {
        let sql = `SELECT * FROM viewpoints v WHERE 1 = 1`;
        const params = [];
        sql = appendWorkspaceFilter(sql, params, normalizedScope, VIEWPOINT_WORKSPACE_SQL);
        sql = appendAuthorFilter(sql, params, author, VIEWPOINT_AUTHOR_SQL);
        if (targetScope === 'team') {
          sql += ` AND COALESCE(v.team_visible, 0) = 1`;
        }
        const viewpoints = await this.query(sql, params);
        tables.viewpoints = viewpoints.map((viewpoint) => withExportSyncMeta(viewpoint, author, targetScope));
      } else if (table.name === 'information_asset_links') {
        const authorFilter = authorClause(INFO_AUTHOR_SQL, author);
        tables[table.name] = targetScope === 'team'
          ? await this.query(
            `SELECT ial.* FROM information_asset_links ial
              JOIN informations i ON i.id = ial.info_id
             WHERE COALESCE(NULLIF(TRIM(i.workspace_scope), ''), 'personal') = ?
               AND COALESCE(i.team_visible, 0) = 1${authorFilter.sql}`,
            [normalizedScope, ...authorFilter.params]
          )
          : await this.query(
            `SELECT ial.* FROM information_asset_links ial
              JOIN informations i ON i.id = ial.info_id
             WHERE COALESCE(NULLIF(TRIM(i.workspace_scope), ''), 'personal') = ?${authorFilter.sql}`,
            [normalizedScope, ...authorFilter.params]
          );
      } else if (table.name === 'information_sector_links') {
        const authorFilter = authorClause(INFO_AUTHOR_SQL, author);
        tables[table.name] = targetScope === 'team'
          ? await this.query(
            `SELECT isl.* FROM information_sector_links isl
              JOIN informations i ON i.id = isl.info_id
             WHERE COALESCE(NULLIF(TRIM(i.workspace_scope), ''), 'personal') = ?
               AND COALESCE(i.team_visible, 0) = 1${authorFilter.sql}`,
            [normalizedScope, ...authorFilter.params]
          )
          : await this.query(
            `SELECT isl.* FROM information_sector_links isl
              JOIN informations i ON i.id = isl.info_id
             WHERE COALESCE(NULLIF(TRIM(i.workspace_scope), ''), 'personal') = ?${authorFilter.sql}`,
            [normalizedScope, ...authorFilter.params]
          );
      } else if (table.name === 'decision_info_links') {
        const decisionAuthorFilter = authorClause(DECISION_AUTHOR_SQL, author);
        tables[table.name] = targetScope === 'team'
          ? await this.query(
            `SELECT dil.* FROM decision_info_links dil
              JOIN decisions d ON d.id = dil.decision_id
              JOIN informations i ON i.id = dil.info_id
             WHERE COALESCE(NULLIF(TRIM(d.workspace_scope), ''), 'personal') = ?
               AND COALESCE(NULLIF(TRIM(i.workspace_scope), ''), 'personal') = ?
               AND COALESCE(d.team_visible, 0) = 1
               AND COALESCE(i.team_visible, 0) = 1${decisionAuthorFilter.sql}`,
            [normalizedScope, normalizedScope, ...decisionAuthorFilter.params]
          )
          : await this.query(
            `SELECT dil.* FROM decision_info_links dil
              JOIN decisions d ON d.id = dil.decision_id
             WHERE COALESCE(NULLIF(TRIM(d.workspace_scope), ''), 'personal') = ?${decisionAuthorFilter.sql}`,
            [normalizedScope, ...decisionAuthorFilter.params]
          );
      } else if (table.name === 'reviews') {
        const decisionAuthorFilter = authorClause(DECISION_AUTHOR_SQL, author);
        tables[table.name] = await this.query(
          `SELECT r.* FROM reviews r
            JOIN decisions d ON d.id = r.decision_id
           WHERE COALESCE(NULLIF(TRIM(d.workspace_scope), ''), 'personal') = ?${decisionAuthorFilter.sql}`,
          [normalizedScope, ...decisionAuthorFilter.params]
        );
      } else if (table.name === 'price_alerts') {
        tables[table.name] = targetScope === 'team' ? [] : await this.query(`SELECT * FROM price_alerts`);
      } else {
        tables[table.name] = await this.query(`SELECT * FROM ${table.name}`);
      }
    }

    return {
      version: Date.now(),
      workspaceScope: targetScope,
      author: author || null,
      tables,
    };
  },

  async getRealizedPnL() {
    // Simplified P&L - tracks sell proceeds vs buy cost per asset
    return this.query(
      `SELECT
        a.symbol,
        a.name,
	        SUM(CASE WHEN ${tradeSellDirectionSql()} THEN t.quantity * t.price ELSE 0 END) -
	        SUM(CASE WHEN ${tradeBuyDirectionSql()} THEN t.quantity * t.price ELSE 0 END) as realized_pnl,
        SUM(t.fee) as total_fees
       FROM trades t
       JOIN assets a ON t.asset_id = a.id
       GROUP BY a.id
	       HAVING SUM(CASE WHEN ${tradeSellDirectionSql()} THEN t.quantity ELSE 0 END) > 0
       ORDER BY realized_pnl DESC`
    );
  },

  // ==========================================
  // Information operations
  // ==========================================

  async getInformations(status = null, scope = 'personal') {
    let sql = `SELECT i.*, a.symbol as asset_symbol,
        COALESCE(
          (SELECT GROUP_CONCAT(asset_id) FROM (
            SELECT asset_id FROM information_asset_links WHERE info_id = i.id ORDER BY position
          )),
          a.symbol,
          i.asset_id
        ) as asset_symbols,
        COALESCE(
          (SELECT GROUP_CONCAT(sector) FROM (
            SELECT sector FROM information_sector_links WHERE info_id = i.id ORDER BY position
          )),
          i.sector
        ) as sectors,
        (SELECT COUNT(*) FROM viewpoints WHERE info_id = i.id) as viewpoint_count
        ,(SELECT COUNT(*) FROM decision_info_links WHERE info_id = i.id) as decision_count
       FROM informations i
       LEFT JOIN assets a ON i.asset_id = a.id`;

    const params = [];
    sql += ` WHERE 1 = 1`;
    sql = appendWorkspaceFilter(sql, params, scope, INFO_WORKSPACE_SQL);
    if (status) {
      sql += ` AND i.status = ?`;
      params.push(status);
    } else {
      // By default exclude ARCHIVED unless explicitly requested
      sql += ` AND (i.status != 'ARCHIVED' OR i.status IS NULL)`;
    }

    sql += ` ORDER BY i.created_at DESC`;
    return this.query(sql, params);
  },

  async getInformationById(id) {
    const results = await this.query(
      `SELECT i.*, a.symbol as asset_symbol,
              COALESCE(
                (SELECT GROUP_CONCAT(asset_id) FROM (
                  SELECT asset_id FROM information_asset_links WHERE info_id = i.id ORDER BY position
                )),
                a.symbol,
                i.asset_id
              ) as asset_symbols,
              COALESCE(
                (SELECT GROUP_CONCAT(sector) FROM (
                  SELECT sector FROM information_sector_links WHERE info_id = i.id ORDER BY position
                )),
                i.sector
              ) as sectors
       FROM informations i
       LEFT JOIN assets a ON i.asset_id = a.id
       WHERE i.id = ?`,
      [id]
    );
    return results[0] || null;
  },

  async addInformation(info) {
    const { id, title, type, source, url, content, file_path, asset_id, sector, status, author, workspace_scope, source_author, source_scope, origin_id, sync_status, team_visible } = info;
    const assetIds = normalizeSymbols(info.asset_ids || asset_id);
    const sectors = normalizeList(info.sectors || sector);
    const finalId = id || crypto.randomUUID();
    await this.exec(
      `INSERT INTO informations (id, title, type, source, url, content, file_path, asset_id, sector, status, author, workspace_scope, source_author, source_scope, origin_id, sync_status, team_visible, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, unixepoch())`,
      [
        finalId,
        title,
        type || 'ARTICLE',
        source || null,
        url || null,
        content || null,
        file_path || null,
        assetIds[0] || asset_id || null,
        sectors[0] || sector || null,
        status || 'UNPROCESSED',
        author || null,
        workspace_scope || 'personal',
        source_author || author || null,
        source_scope || workspace_scope || 'personal',
        origin_id || finalId,
        normalizeSyncStatus(sync_status),
        normalizeTeamVisible(team_visible),
      ]
    );
    await this.setInformationLinks(finalId, assetIds, sectors);
    return { id: finalId };
  },

  async updateInformation(info) {
    const { id, title, type, source, url, content, file_path, asset_id, sector, status, author, workspace_scope, source_author, source_scope, origin_id, sync_status, team_visible } = info;
    const assetIds = normalizeSymbols(info.asset_ids || info.asset_symbols || asset_id);
    const sectors = normalizeList(info.sectors || sector);
    await this.exec(
      `UPDATE informations
          SET title = ?,
              type = ?,
              source = ?,
              url = ?,
              content = ?,
              file_path = ?,
              asset_id = ?,
              sector = ?,
              status = ?,
              author = ?,
              workspace_scope = ?,
              source_author = ?,
              source_scope = ?,
              origin_id = ?,
              sync_status = ?,
              team_visible = ?,
              updated_at = unixepoch()
        WHERE id = ?`,
      [
        title,
        type,
        source || null,
        url || null,
        content || null,
        file_path || null,
        assetIds[0] || asset_id || null,
        sectors[0] || sector || null,
        status || 'UNPROCESSED',
        author || null,
        workspace_scope || 'personal',
        source_author || author || null,
        source_scope || workspace_scope || 'personal',
        origin_id || id,
        sync_status || 'local',
        normalizeTeamVisible(team_visible),
        id,
      ]
    );
    await this.setInformationLinks(id, assetIds, sectors);
    return { id };
  },

  async setInformationTeamVisible(id, visible) {
    return this.exec(
      `UPDATE informations
          SET team_visible = ?,
              sync_status = 'local',
              updated_at = unixepoch()
        WHERE id = ? AND COALESCE(NULLIF(TRIM(workspace_scope), ''), 'personal') = 'personal'`,
      [normalizeTeamVisible(visible), id]
    );
  },

  async setInformationLinks(infoId, assetIds = [], sectors = []) {
    const normalizedAssetIds = normalizeSymbols(assetIds);
    const normalizedSectors = normalizeList(sectors);

    await this.exec('DELETE FROM information_asset_links WHERE info_id = ?', [infoId]);
    await this.exec('DELETE FROM information_sector_links WHERE info_id = ?', [infoId]);

    for (const [position, assetId] of normalizedAssetIds.entries()) {
      await this.upsertAsset({
        id: assetId,
        symbol: assetId,
        name: assetId,
        type: 'STOCK',
      });
      await this.exec(
        'INSERT OR IGNORE INTO information_asset_links (info_id, asset_id, position) VALUES (?, ?, ?)',
        [infoId, assetId, position]
      );
    }

    for (const [position, linkedSector] of normalizedSectors.entries()) {
      await this.exec(
        'INSERT OR IGNORE INTO information_sector_links (info_id, sector, position) VALUES (?, ?, ?)',
        [infoId, linkedSector, position]
      );
    }
  },

  async deleteInformation(id) {
    await this.exec('DELETE FROM viewpoints WHERE info_id = ?', [id]);
    await this.exec('DELETE FROM decision_info_links WHERE info_id = ?', [id]);
    await this.exec('DELETE FROM information_asset_links WHERE info_id = ?', [id]);
    await this.exec('DELETE FROM information_sector_links WHERE info_id = ?', [id]);
    return this.exec('DELETE FROM informations WHERE id = ?', [id]);
  },

  // ==========================================
  // Viewpoints operations
  // ==========================================

  async getViewpoints(infoId = null, scope = 'personal') {
    const normalizedScope = normalizeWorkspaceScope(scope);
    if (infoId) {
      return this.query(
        `SELECT * FROM viewpoints v
          WHERE info_id = ? AND ${VIEWPOINT_WORKSPACE_SQL} = ?
          ORDER BY created_at DESC`,
        [infoId, normalizedScope]
      );
    }
    return this.query(
      `SELECT * FROM viewpoints v WHERE ${VIEWPOINT_WORKSPACE_SQL} = ? ORDER BY created_at DESC`,
      [normalizedScope]
    );
  },

  async addViewpoint(vp) {
    const { id, info_id, content, tags, status, author, quote, target_type, workspace_scope, source_author, source_scope, origin_id, sync_status, team_visible } = vp;
    const tagsJson = tags ? JSON.stringify(tags) : null;
    return this.exec(
      `INSERT INTO viewpoints (id, info_id, content, tags, status, author, quote, target_type, workspace_scope, source_author, source_scope, origin_id, sync_status, team_visible, version, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, unixepoch())`,
      [
        id,
        info_id,
        content,
        tagsJson,
        status || 'ACTIVE',
        author || '我',
        quote || null,
        target_type || 'GENERAL',
        workspace_scope || 'personal',
        source_author || author || null,
        source_scope || workspace_scope || 'personal',
        origin_id || id,
        normalizeSyncStatus(sync_status),
        normalizeTeamVisible(team_visible),
      ]
    );
  },

  async updateViewpoint(vp) {
    const { id, content, tags } = vp;
    const tagsJson = tags ? JSON.stringify(tags) : undefined;
    if (tagsJson !== undefined) {
      return this.exec(
        `UPDATE viewpoints
            SET content = ?, tags = ?, version = version + 1, updated_at = unixepoch(), sync_status = 'local'
          WHERE id = ?`,
        [content, tagsJson, id]
      );
    }
    return this.exec(
      `UPDATE viewpoints
          SET content = ?, version = version + 1, updated_at = unixepoch(), sync_status = 'local'
        WHERE id = ?`,
      [content, id]
    );
  },

  async updateViewpointStatus(id, status) {
    return this.exec(
      `UPDATE viewpoints
          SET status = ?, updated_at = unixepoch(), sync_status = 'local'
        WHERE id = ?`,
      [status, id]
    );
  },

  async setViewpointTeamVisible(id, visible) {
    return this.exec(
      `UPDATE viewpoints
          SET team_visible = ?,
              sync_status = 'local',
              updated_at = unixepoch()
        WHERE id = ? AND COALESCE(NULLIF(TRIM(workspace_scope), ''), 'personal') = 'personal'`,
      [normalizeTeamVisible(visible), id]
    );
  },

  async deleteViewpoint(id) {
    return this.exec('DELETE FROM viewpoints WHERE id = ?', [id]);
  },

  // ==========================================
  // Price alert operations
  // ==========================================

  async getPriceAlerts(status = null) {
    if (status) {
      return this.query(
        'SELECT * FROM price_alerts WHERE status = ? ORDER BY created_at DESC',
        [status]
      );
    }
    return this.query('SELECT * FROM price_alerts ORDER BY created_at DESC');
  },

  async getPriceAlertsBySymbol(symbol) {
    const normalized = String(symbol || '').trim().toUpperCase();
    return this.query(
      'SELECT * FROM price_alerts WHERE symbol = ? ORDER BY status, created_at DESC',
      [normalized]
    );
  },

  async addPriceAlert(alert) {
    const {
      id,
      symbol,
      asset_id,
      asset_type,
      condition,
      target_price,
      last_price,
      status,
      channels,
      note,
    } = alert;
    const finalId = id || crypto.randomUUID();
    const channelsJson = Array.isArray(channels) ? JSON.stringify(channels) : (channels || null);
    await this.exec(
      `INSERT INTO price_alerts (id, symbol, asset_id, asset_type, condition, target_price, last_price, status, channels, note)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        finalId,
        String(symbol || '').trim().toUpperCase(),
        asset_id || null,
        asset_type || 'STOCK',
        condition,
        Number(target_price),
        last_price ?? null,
        status || 'ACTIVE',
        channelsJson,
        note || null,
      ]
    );
    return { id: finalId };
  },

  async updatePriceAlert(id, updates) {
    const fields = [];
    const values = [];
    for (const [key, value] of Object.entries(updates)) {
      if (key === 'id') continue;
      fields.push(`${key} = ?`);
      values.push(Array.isArray(value) ? JSON.stringify(value) : value);
    }
    fields.push('updated_at = unixepoch()');
    values.push(id);
    return this.exec(
      `UPDATE price_alerts SET ${fields.join(', ')} WHERE id = ?`,
      values
    );
  },

  async markPriceAlertTriggered(id, lastPrice) {
    return this.exec(
      `UPDATE price_alerts
          SET last_price = ?,
              triggered_at = unixepoch(),
              updated_at = unixepoch()
        WHERE id = ?`,
      [lastPrice, id]
    );
  },

  async deletePriceAlert(id) {
    return this.exec('DELETE FROM price_alerts WHERE id = ?', [id]);
  },

  // ==========================================
  // Settings operations
  // ==========================================

  async getSetting(key) {
    const results = await this.query('SELECT value FROM app_settings WHERE key = ?', [key]);
    return results[0] ? results[0].value : null;
  },

  async setSetting(key, value) {
    return this.exec(
      'INSERT OR REPLACE INTO app_settings (key, value, updated_at) VALUES (?, ?, unixepoch())',
      [key, value]
    );
  },

  // ==========================================
  // Statistics
  // ==========================================

  async getStats() {
    const results = await this.query(
      `SELECT
        (SELECT COUNT(*) FROM assets) as asset_count,
        (SELECT COUNT(*) FROM trades) as trade_count,
        (SELECT COUNT(*) FROM decisions) as decision_count,
        (SELECT COUNT(*) FROM informations) as info_count,
        (SELECT COUNT(*) FROM reviews) as review_count,
        (SELECT COUNT(*) FROM viewpoints) as viewpoint_count`
    );
    return results[0] || {};
  },

  /**
   * Quick check if database has any user data (for PWA recovery detection)
   */
  async hasAnyData() {
    const results = await this.query(
      `SELECT
        (SELECT COUNT(*) FROM trades) +
        (SELECT COUNT(*) FROM informations) +
        (SELECT COUNT(*) FROM decisions) as total`
    );
    return (results[0]?.total || 0) > 0;
  },
};

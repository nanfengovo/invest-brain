/**
 * Database interface for InvestBrain
 * Provides Promise-based API to communicate with SQLite Web Worker
 */

import { getMigrationSQL } from './migrations';
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

function appendAuthorFilter(sql, params, author) {
  const normalizedAuthor = String(author || '').trim();
  if (!normalizedAuthor) return sql;
  params.push(normalizedAuthor);
  return `${sql} AND ${TRADE_AUTHOR_SQL} = ?`;
}

function normalizeWorkspaceScope(scope) {
  return scope === 'team' ? 'team' : 'personal';
}

function appendWorkspaceFilter(sql, params, scope = 'personal') {
  const normalizedScope = normalizeWorkspaceScope(scope);
  params.push(normalizedScope);
  return `${sql} AND ${TRADE_WORKSPACE_SQL} = ?`;
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
        a.sector as asset_sector
      FROM reviews r
      JOIN decisions d ON r.decision_id = d.id
      LEFT JOIN (
        SELECT decision_id, MIN(asset_id) as asset_id
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
    const { id, symbol, name, type, sector, strike_price, expiry_date, underlying_symbol, option_type } = asset;
    return this.exec(
      `INSERT OR REPLACE INTO assets (id, symbol, name, type, sector, strike_price, expiry_date, underlying_symbol, option_type, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, COALESCE((SELECT created_at FROM assets WHERE id = ?), unixepoch()), unixepoch())`,
      [id, symbol, name || '', type || 'STOCK', sector || null, strike_price || null, expiry_date || null, underlying_symbol || null, option_type || null, id]
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
    const { id, asset_id, decision_id, direction, quantity, price, fee, account, trade_time, note, broker, info_id, underlying_symbol, strike_price, expiry_date, option_type, contract_symbol, author, workspace_scope, source_author, source_scope, origin_id, sync_status } = trade;
    return this.exec(
      `INSERT INTO trades (id, asset_id, decision_id, info_id, direction, quantity, price, fee, account, trade_time, note, broker, underlying_symbol, strike_price, expiry_date, option_type, contract_symbol, author, workspace_scope, source_author, source_scope, origin_id, sync_status)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [id, asset_id, decision_id || null, info_id || null, direction, quantity, price, fee || 0, account || null, trade_time, note || null, broker || null, underlying_symbol || null, strike_price || null, expiry_date || null, option_type || null, contract_symbol || null, author || null, workspace_scope || 'personal', source_author || author || null, source_scope || workspace_scope || 'personal', origin_id || id, sync_status || 'local']
    );
  },

  async updateTrade(trade) {
    const { id, asset_id, decision_id, direction, quantity, price, fee, account, trade_time, note, broker, info_id, underlying_symbol, strike_price, expiry_date, option_type, contract_symbol, author, workspace_scope, source_author, source_scope, origin_id, sync_status } = trade;
    return this.exec(
      `UPDATE trades SET asset_id = ?, decision_id = ?, info_id = ?, direction = ?, quantity = ?, price = ?, fee = ?, account = ?, trade_time = ?, note = ?, broker = ?, underlying_symbol = ?, strike_price = ?, expiry_date = ?, option_type = ?, contract_symbol = ?, author = ?, workspace_scope = ?, source_author = ?, source_scope = ?, origin_id = ?, sync_status = ? WHERE id = ?`,
      [asset_id, decision_id || null, info_id || null, direction, quantity, price, fee || 0, account || null, trade_time, note || null, broker || null, underlying_symbol || null, strike_price || null, expiry_date || null, option_type || null, contract_symbol || null, author || null, workspace_scope || 'personal', source_author || author || null, source_scope || workspace_scope || 'personal', origin_id || id, sync_status || 'local', id]
    );
  },

  async deleteTrade(id) {
    return this.exec('DELETE FROM trades WHERE id = ?', [id]);
  },

  async getTradesByAssetAndBroker(assetId, broker = null, author = null, scope = 'personal') {
    let sql = `SELECT t.*, d.title as decision_title
               FROM trades t
               LEFT JOIN decisions d ON t.decision_id = d.id
               WHERE t.asset_id = ?`;
    const params = [assetId];
    if (broker) {
      sql += ` AND t.broker = ?`;
      params.push(broker);
    } else {
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

  async getDecisions(status = null) {
    const selectSql = `SELECT d.*,
                a.symbol as asset_symbol,
                (SELECT COUNT(*) FROM trades WHERE decision_id = d.id) as trade_count,
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

    if (status) {
      return this.query(
        `${selectSql}
         WHERE d.status = ?
         ${orderSql}`,
        [status]
      );
    }
    return this.query(
      `${selectSql}
       ${orderSql}`
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
    const { id, title, content, confidence, sentiment, status, asset_id, sector, priority, info_ids } = decision;
    await this.exec(
      `INSERT INTO decisions (id, title, content, confidence, sentiment, status, asset_id, sector, priority)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [id, title, content || '', confidence || 3, sentiment || 'NEUTRAL', status || 'ACTIVE', asset_id || null, sector || null, priority || 3]
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

  async getDecisionsByInformation(infoId) {
    return this.query(
      `SELECT d.*, a.symbol as asset_symbol,
              (SELECT COUNT(*) FROM trades WHERE decision_id = d.id) as trade_count
       FROM decision_info_links dil
       JOIN decisions d ON d.id = dil.decision_id
       LEFT JOIN assets a ON d.asset_id = a.id
       WHERE dil.info_id = ?
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
      [infoId]
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
    return this.exec(
      `UPDATE trades
          SET author = ?
        WHERE author IS NULL OR TRIM(author) = ''`,
      [normalizedAuthor]
    );
  },

  async clearTradeWorkspace(scope = 'team') {
    return this.exec(
      `DELETE FROM trades WHERE COALESCE(NULLIF(TRIM(workspace_scope), ''), 'personal') = ?`,
      [normalizeWorkspaceScope(scope)]
    );
  },

  async getHoldings(author = null, scope = 'personal') {
    let sql = `SELECT
        ${TRADE_AUTHOR_SQL} as author,
        a.id as asset_id,
        a.symbol,
        a.name,
        a.type,
        a.sector,
        t.broker,
        SUM(CASE
          WHEN t.direction IN ('BUY', 'OPEN') THEN t.quantity
          WHEN t.direction IN ('SELL', 'CLOSE') THEN -t.quantity
          ELSE 0
        END) as total_quantity,
        SUM(CASE
          WHEN t.direction IN ('BUY', 'OPEN') THEN t.quantity * t.price
          WHEN t.direction IN ('SELL', 'CLOSE') THEN -t.quantity * t.price
          ELSE 0
        END) / NULLIF(SUM(CASE
          WHEN t.direction IN ('BUY', 'OPEN') THEN t.quantity
          WHEN t.direction IN ('SELL', 'CLOSE') THEN -t.quantity
          ELSE 0
        END), 0) as avg_cost,
        SUM(t.fee) as total_fees,
        COUNT(t.id) as trade_count,
        MIN(${TRADE_TIME_SECONDS_SQL}) as first_trade,
        MAX(${TRADE_TIME_SECONDS_SQL}) as last_trade
       FROM trades t
       JOIN assets a ON t.asset_id = a.id
       WHERE 1 = 1`;
    const params = [];
    sql = appendWorkspaceFilter(sql, params, scope);
    sql = appendAuthorFilter(sql, params, author);
    sql += `
       GROUP BY a.id, t.broker, ${TRADE_AUTHOR_SQL}
       HAVING total_quantity > 0.0001
       ORDER BY a.symbol, author`;

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
        COALESCE(t.option_type, a.option_type) as option_type
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
    const rows = await this.query(
      `SELECT name FROM sqlite_master
        WHERE type='table'
          AND name NOT LIKE 'sqlite_%'
          AND name != '_migrations'
        ORDER BY name`
    );
    const tables = {};
    for (const table of rows) {
      if (table.name === 'trades') {
        let sql = `SELECT * FROM trades t WHERE 1 = 1`;
        const params = [];
        sql = appendWorkspaceFilter(sql, params, normalizedScope);
        sql = appendAuthorFilter(sql, params, author);
        const trades = await this.query(sql, params);
        tables.trades = trades.map((trade) => ({
          ...trade,
          workspace_scope: targetScope,
          source_scope: targetScope,
          source_author: trade.source_author || trade.author || author || '未标记',
          origin_id: trade.origin_id || trade.id,
          sync_status: 'synced',
        }));
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
        SUM(CASE WHEN t.direction IN ('SELL', 'CLOSE') THEN t.quantity * t.price ELSE 0 END) -
        SUM(CASE WHEN t.direction IN ('BUY', 'OPEN') THEN t.quantity * t.price ELSE 0 END) as realized_pnl,
        SUM(t.fee) as total_fees
       FROM trades t
       JOIN assets a ON t.asset_id = a.id
       GROUP BY a.id
       HAVING SUM(CASE WHEN t.direction IN ('SELL', 'CLOSE') THEN t.quantity ELSE 0 END) > 0
       ORDER BY realized_pnl DESC`
    );
  },

  // ==========================================
  // Information operations
  // ==========================================

  async getInformations(status = null) {
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
    if (status) {
      sql += ` WHERE i.status = ?`;
      params.push(status);
    } else {
      // By default exclude ARCHIVED unless explicitly requested
      sql += ` WHERE i.status != 'ARCHIVED' OR i.status IS NULL`;
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
    const { id, title, type, source, url, content, file_path, asset_id, sector, status } = info;
    const assetIds = normalizeSymbols(info.asset_ids || asset_id);
    const sectors = normalizeList(info.sectors || sector);
    const finalId = id || crypto.randomUUID();
    await this.exec(
      `INSERT INTO informations (id, title, type, source, url, content, file_path, asset_id, sector, status)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [finalId, title, type || 'ARTICLE', source || null, url || null, content || null, file_path || null, assetIds[0] || asset_id || null, sectors[0] || sector || null, status || 'UNPROCESSED']
    );
    await this.setInformationLinks(finalId, assetIds, sectors);
    return { id: finalId };
  },

  async updateInformation(info) {
    const { id, title, type, source, url, content, file_path, asset_id, sector, status } = info;
    const assetIds = normalizeSymbols(info.asset_ids || info.asset_symbols || asset_id);
    const sectors = normalizeList(info.sectors || sector);
    await this.exec(
      `UPDATE informations SET title = ?, type = ?, source = ?, url = ?, content = ?, file_path = ?, asset_id = ?, sector = ?, status = ? WHERE id = ?`,
      [title, type, source || null, url || null, content || null, file_path || null, assetIds[0] || asset_id || null, sectors[0] || sector || null, status || 'UNPROCESSED', id]
    );
    await this.setInformationLinks(id, assetIds, sectors);
    return { id };
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

  async getViewpoints(infoId = null) {
    if (infoId) {
      return this.query('SELECT * FROM viewpoints WHERE info_id = ? ORDER BY created_at DESC', [infoId]);
    }
    return this.query('SELECT * FROM viewpoints ORDER BY created_at DESC');
  },

  async addViewpoint(vp) {
    const { id, info_id, content, tags, status, author, quote, target_type } = vp;
    const tagsJson = tags ? JSON.stringify(tags) : null;
    return this.exec(
      'INSERT INTO viewpoints (id, info_id, content, tags, status, author, quote, target_type, version, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1, unixepoch())',
      [id, info_id, content, tagsJson, status || 'ACTIVE', author || '我', quote || null, target_type || 'GENERAL']
    );
  },

  async updateViewpoint(vp) {
    const { id, content, tags } = vp;
    const tagsJson = tags ? JSON.stringify(tags) : undefined;
    if (tagsJson !== undefined) {
      return this.exec(
        'UPDATE viewpoints SET content = ?, tags = ?, version = version + 1, updated_at = unixepoch() WHERE id = ?',
        [content, tagsJson, id]
      );
    }
    return this.exec(
      'UPDATE viewpoints SET content = ?, version = version + 1, updated_at = unixepoch() WHERE id = ?',
      [content, id]
    );
  },

  async updateViewpointStatus(id, status) {
    return this.exec(
      'UPDATE viewpoints SET status = ?, updated_at = unixepoch() WHERE id = ?',
      [status, id]
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

/**
 * Database interface for InvestBrain
 * Provides Promise-based API to communicate with SQLite Web Worker
 */

import { getMigrationSQL } from './migrations';

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
   * Import database from backup
   */
  async importDB(data) {
    if (!isReady) throw new Error('Database not initialized');
    return sendMessage('import', { data });
  },

  // ==========================================
  // Asset operations
  // ==========================================

  async getAssets() {
    return this.query('SELECT * FROM assets ORDER BY symbol');
  },

  async getAssetById(id) {
    const results = await this.query('SELECT * FROM assets WHERE id = ?', [id]);
    return results[0] || null;
  },

  async upsertAsset(asset) {
    const { id, symbol, name, type, sector, strike_price, expiry_date } = asset;
    return this.exec(
      `INSERT OR REPLACE INTO assets (id, symbol, name, type, sector, strike_price, expiry_date, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, COALESCE((SELECT created_at FROM assets WHERE id = ?), unixepoch()), unixepoch())`,
      [id, symbol, name || '', type || 'STOCK', sector || null, strike_price || null, expiry_date || null, id]
    );
  },

  // ==========================================
  // Trade operations
  // ==========================================

  async getTrades(limit = 100, offset = 0) {
    return this.query(
      `SELECT t.*, a.symbol, a.name as asset_name, a.type as asset_type,
              d.title as decision_title
       FROM trades t
       LEFT JOIN assets a ON t.asset_id = a.id
       LEFT JOIN decisions d ON t.decision_id = d.id
       ORDER BY t.trade_time DESC
       LIMIT ? OFFSET ?`,
      [limit, offset]
    );
  },

  async getTradeById(id) {
    const results = await this.query(
      `SELECT t.*, a.symbol, a.name as asset_name, a.type as asset_type,
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
    const { id, asset_id, decision_id, direction, quantity, price, fee, account, trade_time, note } = trade;
    return this.exec(
      `INSERT INTO trades (id, asset_id, decision_id, direction, quantity, price, fee, account, trade_time, note)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [id, asset_id, decision_id || null, direction, quantity, price, fee || 0, account || null, trade_time, note || null]
    );
  },

  async deleteTrade(id) {
    return this.exec('DELETE FROM trades WHERE id = ?', [id]);
  },

  async getTradesByAsset(assetId) {
    return this.query(
      `SELECT t.*, d.title as decision_title
       FROM trades t
       LEFT JOIN decisions d ON t.decision_id = d.id
       WHERE t.asset_id = ?
       ORDER BY t.trade_time DESC`,
      [assetId]
    );
  },

  // ==========================================
  // Decision operations
  // ==========================================

  async getDecisions(status = null) {
    if (status) {
      return this.query(
        `SELECT d.*, 
                (SELECT COUNT(*) FROM trades WHERE decision_id = d.id) as trade_count
         FROM decisions d
         WHERE d.status = ?
         ORDER BY d.created_at DESC`,
        [status]
      );
    }
    return this.query(
      `SELECT d.*, 
              (SELECT COUNT(*) FROM trades WHERE decision_id = d.id) as trade_count
       FROM decisions d
       ORDER BY d.created_at DESC`
    );
  },

  async getDecisionById(id) {
    const results = await this.query(
      `SELECT d.*, 
              (SELECT COUNT(*) FROM trades WHERE decision_id = d.id) as trade_count
       FROM decisions d
       WHERE d.id = ?`,
      [id]
    );
    return results[0] || null;
  },

  async addDecision(decision) {
    const { id, title, content, confidence, sentiment, status } = decision;
    return this.exec(
      `INSERT INTO decisions (id, title, content, confidence, sentiment, status)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [id, title, content || '', confidence || 3, sentiment || 'NEUTRAL', status || 'ACTIVE']
    );
  },

  async updateDecision(id, updates) {
    const fields = [];
    const values = [];
    for (const [key, value] of Object.entries(updates)) {
      if (key !== 'id') {
        fields.push(`${key} = ?`);
        values.push(value);
      }
    }
    fields.push('updated_at = unixepoch()');
    values.push(id);
    return this.exec(
      `UPDATE decisions SET ${fields.join(', ')} WHERE id = ?`,
      values
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
  // Holdings & P&L calculations
  // ==========================================

  async getHoldings() {
    return this.query(
      `SELECT 
        a.id as asset_id,
        a.symbol,
        a.name,
        a.type,
        a.sector,
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
        MIN(t.trade_time) as first_trade,
        MAX(t.trade_time) as last_trade
       FROM trades t
       JOIN assets a ON t.asset_id = a.id
       GROUP BY a.id
       HAVING total_quantity > 0.0001
       ORDER BY a.symbol`
    );
  },

  async getPortfolioSummary() {
    const results = await this.query(
      `SELECT
        COUNT(DISTINCT t.asset_id) as total_assets,
        COUNT(t.id) as total_trades,
        SUM(t.fee) as total_fees,
        SUM(CASE WHEN t.direction IN ('SELL', 'CLOSE') THEN t.quantity * t.price ELSE 0 END) as total_sells,
        SUM(CASE WHEN t.direction IN ('BUY', 'OPEN') THEN t.quantity * t.price ELSE 0 END) as total_buys
       FROM trades t`
    );
    return results[0] || {};
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

  async getInformations() {
    return this.query(
      `SELECT i.*, a.symbol as asset_symbol,
        (SELECT COUNT(*) FROM viewpoints WHERE info_id = i.id) as viewpoint_count
       FROM informations i
       LEFT JOIN assets a ON i.asset_id = a.id
       ORDER BY i.created_at DESC`
    );
  },

  async getInformationById(id) {
    const results = await this.query(
      `SELECT i.*, a.symbol as asset_symbol
       FROM informations i
       LEFT JOIN assets a ON i.asset_id = a.id
       WHERE i.id = ?`,
      [id]
    );
    return results[0] || null;
  },

  async addInformation(info) {
    const { id, title, type, source, url, content, file_path, asset_id, sector } = info;
    return this.exec(
      `INSERT INTO informations (id, title, type, source, url, content, file_path, asset_id, sector)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [id, title, type || 'ARTICLE', source || null, url || null, content || null, file_path || null, asset_id || null, sector || null]
    );
  },

  async deleteInformation(id) {
    await this.exec('DELETE FROM viewpoints WHERE info_id = ?', [id]);
    await this.exec('DELETE FROM decision_info_links WHERE info_id = ?', [id]);
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
    const { id, info_id, content } = vp;
    return this.exec(
      'INSERT INTO viewpoints (id, info_id, content) VALUES (?, ?, ?)',
      [id, info_id, content]
    );
  },

  async deleteViewpoint(id) {
    return this.exec('DELETE FROM viewpoints WHERE id = ?', [id]);
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
};

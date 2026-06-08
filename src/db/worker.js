/**
 * SQLite Web Worker for InvestBrain
 * Runs SQLite WASM with OPFS persistence in a dedicated Web Worker
 */
console.log('[Cache Bust] 2026-06-03 v3');

import sqlite3InitModule from '@sqlite.org/sqlite-wasm';

const DB_NAME = '/invest_brain.db';
let db = null;

/**
 * Initialize SQLite with OPFS
 */
async function initDatabase() {
  try {
    const sqlite3 = await sqlite3InitModule({
      print: console.log,
      printErr: console.error,
    });

    // Try OPFS first (preferred for persistence)
    if (sqlite3.oo1.OpfsDb) {
      try {
        db = new sqlite3.oo1.OpfsDb(DB_NAME);
        console.log('[SQLite Worker] Database opened with OPFS persistence');
      } catch (opfsErr) {
        console.warn('[SQLite Worker] OPFS unavailable, falling back to in-memory:', opfsErr.message);
        db = new sqlite3.oo1.DB(DB_NAME, 'ct');
        console.log('[SQLite Worker] Database opened in-memory (no persistence)');
      }
    } else {
      db = new sqlite3.oo1.DB(DB_NAME, 'ct');
      console.log('[SQLite Worker] OpfsDb not available, using in-memory DB');
    }

    // Enable WAL mode for better performance
    try {
      db.exec('PRAGMA journal_mode=WAL');
    } catch (e) {
      // WAL may not be supported in all VFS modes
    }

    // Enable foreign keys
    db.exec('PRAGMA foreign_keys=ON');

    return { success: true, persistent: !!sqlite3.oo1.OpfsDb };
  } catch (err) {
    console.error('[SQLite Worker] Failed to initialize:', err);
    return { success: false, error: err.message };
  }
}

/**
 * Execute SQL (INSERT, UPDATE, DELETE, CREATE, etc.)
 */
function execSQL(sql, params = []) {
  try {
    if (params.length > 0) {
      db.exec({ sql, bind: params });
    } else {
      db.exec(sql);
    }
    return { success: true, changes: db.changes() };
  } catch (err) {
    return { success: false, error: err.message };
  }
}

/**
 * Query SQL (SELECT) - returns array of objects
 */
function querySQL(sql, params = []) {
  try {
    const results = [];
    const opts = {
      sql,
      rowMode: 'object',
      callback: (row) => {
        results.push(row);
      },
    };
    if (params.length > 0) {
      opts.bind = params;
    }
    db.exec(opts);
    return { success: true, data: results };
  } catch (err) {
    return { success: false, error: err.message };
  }
}

function getTableColumns(tableName) {
  const result = querySQL(`PRAGMA table_info(${tableName})`);
  if (!result.success) return new Set();
  return new Set(result.data.map((column) => column.name));
}

function normalizeImportedDump(dump, options = {}) {
  if (!dump?.tables?.trades || !Array.isArray(dump.tables.trades)) return dump;

  const {
    workspaceScope = null,
    sourceScope = null,
    currentAuthor = null,
    restrictAuthor = null,
    teamMirror = false,
    syncStatus = null,
  } = options || {};

  const normalizedAuthor = String(currentAuthor || '').trim();
  const authorFilter = String(restrictAuthor || '').trim();

  const trades = dump.tables.trades
    .filter((row) => {
      if (!authorFilter) return true;
      return String(row?.author || row?.source_author || '').trim() === authorFilter;
    })
    .map((row) => {
      const author = String(row?.author || row?.source_author || normalizedAuthor || '未标记').trim() || '未标记';
      const originId = String(row?.origin_id || row?.id || '').trim();
      const next = {
        ...row,
        author,
        source_author: String(row?.source_author || author).trim() || author,
        workspace_scope: workspaceScope || row?.workspace_scope || 'personal',
        source_scope: sourceScope || row?.source_scope || workspaceScope || 'personal',
        origin_id: originId || row?.id,
        sync_status: syncStatus || row?.sync_status || 'local',
      };

      if (teamMirror && originId) {
        next.id = `team:${next.source_author}:${originId}`;
        next.workspace_scope = 'team';
        next.source_scope = row?.source_scope || 'team';
        next.origin_id = originId;
        next.sync_status = 'synced';
      }

      return next;
    });

  return {
    ...dump,
    tables: {
      ...dump.tables,
      trades,
    },
  };
}

/**
 * Execute multiple SQL statements in a transaction
 */
function execTransaction(statements) {
  try {
    db.exec('BEGIN TRANSACTION');
    for (const { sql, params = [] } of statements) {
      if (params.length > 0) {
        db.exec({ sql, bind: params });
      } else {
        db.exec(sql);
      }
    }
    db.exec('COMMIT');
    return { success: true };
  } catch (err) {
    try {
      db.exec('ROLLBACK');
    } catch (rollbackErr) {
      // Ignore rollback errors
    }
    return { success: false, error: err.message };
  }
}

/**
 * Export the entire database as a Uint8Array
 */
function exportDatabase() {
  try {
    const bytes = sqlite3.capi.sqlite3_js_db_export(db);
    return { success: true, data: bytes };
  } catch (err) {
    // Fallback: export via SQL dump
    try {
      const tables = querySQL(
        "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' AND name != '_migrations'"
      );
      if (!tables.success) throw new Error(tables.error);

      const dump = { tables: {}, version: Date.now() };
      for (const table of tables.data) {
        const rows = querySQL(`SELECT * FROM ${table.name}`);
        if (rows.success) {
          dump.tables[table.name] = rows.data;
        }
      }
      return { success: true, data: JSON.stringify(dump), format: 'json' };
    } catch (dumpErr) {
      return { success: false, error: dumpErr.message };
    }
  }
}

/**
 * Import database from JSON dump
 * @param {string|object} jsonData 
 * @param {boolean} merge - If true, uses INSERT OR REPLACE and skips DELETE
 */
function importDatabase(jsonData, merge = false, options = {}) {
  try {
    const rawDump = typeof jsonData === 'string' ? JSON.parse(jsonData) : jsonData;
    const dump = normalizeImportedDump(rawDump, options);
    db.exec('BEGIN TRANSACTION');

    if (!merge) {
      // Clear existing data (reverse order for foreign keys)
      const tableOrder = [
        'reviews',
        'decision_info_links',
        'trades',
        'decisions',
        'viewpoints',
        'informations',
        'assets',
      ];
      for (const table of tableOrder) {
        // use try-catch because viewpoints might not exist in old backups
        try {
          db.exec(`DELETE FROM ${table}`);
        } catch (e) {}
      }
    }

    // Insert data
    for (const [tableName, rows] of Object.entries(dump.tables)) {
      if (!Array.isArray(rows) || rows.length === 0) continue;
      const tableColumns = getTableColumns(tableName);
      const columns = Array.from(
        rows.reduce((set, row) => {
          Object.keys(row || {}).forEach((column) => {
            if (!tableColumns.size || tableColumns.has(column)) {
              set.add(column);
            }
          });
          return set;
        }, new Set())
      );
      if (columns.length === 0) continue;
      const placeholders = columns.map(() => '?').join(',');
      
      const insertCmd = merge ? 'INSERT OR REPLACE' : 'INSERT';
      const sql = `${insertCmd} INTO ${tableName} (${columns.join(',')}) VALUES (${placeholders})`;

      for (const row of rows) {
        const values = columns.map((col) => row[col] ?? null);
        try {
          db.exec({ sql, bind: values });
        } catch (e) {
          console.error(`[SQLite Worker] Failed to insert into ${tableName}:`, e.message);
        }
      }
    }

    db.exec('COMMIT');
    return { success: true, message: `Imported ${Object.keys(dump.tables).length} tables (${merge ? 'merged' : 'replaced'})` };
  } catch (err) {
    try {
      db.exec('ROLLBACK');
    } catch (e) {
      // ignore
    }
    return { success: false, error: err.message };
  }
}

// Message handler
self.onmessage = async function (e) {
  const { id, type, payload } = e.data;

  let result;

  switch (type) {
    case 'init':
      result = await initDatabase();
      break;
    case 'exec':
      result = execSQL(payload.sql, payload.params || []);
      break;
    case 'query':
      result = querySQL(payload.sql, payload.params || []);
      break;
    case 'transaction':
      result = execTransaction(payload.statements);
      break;
    case 'export':
      result = exportDatabase();
      break;
    case 'import':
      result = importDatabase(payload.data, payload.merge || false, payload.options || {});
      break;
    default:
      result = { success: false, error: `Unknown message type: ${type}` };
  }

  self.postMessage({ id, ...result });
};

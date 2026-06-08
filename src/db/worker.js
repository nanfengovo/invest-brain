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
  const {
    allowedTables = null,
    workspaceScope = null,
    sourceScope = null,
    currentAuthor = null,
    restrictAuthor = null,
    teamMirror = false,
    syncStatus = null,
  } = options || {};
  const allowedTableSet = Array.isArray(allowedTables) && allowedTables.length
    ? new Set(allowedTables)
    : null;
  const filteredTables = {};

  for (const [tableName, rows] of Object.entries(dump?.tables || {})) {
    if (!allowedTableSet || allowedTableSet.has(tableName)) {
      filteredTables[tableName] = rows;
    }
  }

  const normalizedAuthor = String(currentAuthor || '').trim();
  const authorFilter = String(restrictAuthor || '').trim();
  const idMap = new Map();
  const mirrorId = (sourceAuthor, originId) => `team:${sourceAuthor}:${originId}`;
  const normalizeCollaborativeRow = (row, optionsForRow = {}) => {
    const {
      hasAuthor = true,
      fallbackAuthor = normalizedAuthor,
      publishedStatus = syncStatus,
    } = optionsForRow;
    const author = String(row?.author || row?.source_author || fallbackAuthor || '未标记').trim() || '未标记';
    const originId = String(row?.origin_id || row?.id || '').trim();
    const next = {
      ...row,
      source_author: String(row?.source_author || author).trim() || author,
      workspace_scope: workspaceScope || row?.workspace_scope || 'personal',
      source_scope: sourceScope || row?.source_scope || workspaceScope || 'personal',
      origin_id: originId || row?.id,
      sync_status: publishedStatus || row?.sync_status || 'local',
    };
    if (hasAuthor) next.author = author;

    if (teamMirror && originId) {
      next.id = mirrorId(next.source_author, originId);
      next.workspace_scope = 'team';
      next.source_scope = row?.source_scope || 'team';
      next.origin_id = originId;
      next.sync_status = 'mirror';
      idMap.set(row.id, next.id);
      idMap.set(originId, next.id);
    }

    return next;
  };
  const byAuthor = (row) => {
    if (!authorFilter) return true;
    return String(row?.author || row?.source_author || '').trim() === authorFilter;
  };

  const normalizedTables = { ...filteredTables };

  if (Array.isArray(filteredTables.informations)) {
    normalizedTables.informations = filteredTables.informations
      .filter(byAuthor)
      .map((row) => normalizeCollaborativeRow(row));
  }

  if (Array.isArray(filteredTables.decisions)) {
    normalizedTables.decisions = filteredTables.decisions
      .filter(byAuthor)
      .map((row) => normalizeCollaborativeRow(row));
  }

  if (Array.isArray(filteredTables.viewpoints)) {
    normalizedTables.viewpoints = filteredTables.viewpoints
      .filter(byAuthor)
      .map((row) => {
        const next = normalizeCollaborativeRow(row);
        if (teamMirror && next.info_id) {
          next.info_id = idMap.get(next.info_id) || mirrorId(next.source_author, next.info_id);
        }
        return next;
      });
  }

  if (Array.isArray(filteredTables.trades)) {
    normalizedTables.trades = filteredTables.trades
      .filter(byAuthor)
      .map((row) => {
        const next = normalizeCollaborativeRow(row);
        if (teamMirror) {
          if (next.decision_id) {
            next.decision_id = idMap.get(next.decision_id) || mirrorId(next.source_author, next.decision_id);
          }
          if (next.info_id) {
            next.info_id = idMap.get(next.info_id) || mirrorId(next.source_author, next.info_id);
          }
        }
        return next;
      });
  }

  if (teamMirror && Array.isArray(filteredTables.information_asset_links)) {
    normalizedTables.information_asset_links = filteredTables.information_asset_links
      .map((row) => ({
        ...row,
        info_id: idMap.get(row.info_id) || row.info_id,
      }))
      .filter((row) => String(row.info_id || '').startsWith('team:'));
  }

  if (teamMirror && Array.isArray(filteredTables.information_sector_links)) {
    normalizedTables.information_sector_links = filteredTables.information_sector_links
      .map((row) => ({
        ...row,
        info_id: idMap.get(row.info_id) || row.info_id,
      }))
      .filter((row) => String(row.info_id || '').startsWith('team:'));
  }

  if (teamMirror && Array.isArray(filteredTables.decision_info_links)) {
    normalizedTables.decision_info_links = filteredTables.decision_info_links
      .map((row) => ({
        ...row,
        decision_id: idMap.get(row.decision_id) || row.decision_id,
        info_id: idMap.get(row.info_id) || row.info_id,
      }))
      .filter((row) => String(row.decision_id || '').startsWith('team:') && String(row.info_id || '').startsWith('team:'));
  }

  if (teamMirror && Array.isArray(filteredTables.reviews)) {
    normalizedTables.reviews = filteredTables.reviews
      .map((row) => {
        const nextDecisionId = idMap.get(row.decision_id) || row.decision_id;
        const sourceAuthor = String(row?.source_author || normalizedAuthor || '未标记').trim() || '未标记';
        const originId = String(row?.origin_id || row?.id || '').trim();
        return {
          ...row,
          id: originId ? mirrorId(sourceAuthor, originId) : row.id,
          decision_id: nextDecisionId,
          origin_id: originId || row.id,
          source_author: sourceAuthor,
          workspace_scope: 'team',
          source_scope: row?.source_scope || 'team',
          sync_status: 'mirror',
        };
      })
      .filter((row) => String(row.decision_id || '').startsWith('team:'));
  }

  return {
    ...dump,
    tables: normalizedTables,
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

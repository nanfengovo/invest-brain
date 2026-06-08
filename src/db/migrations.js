/**
 * Database migrations for InvestBrain
 * Each migration is an array of SQL statements to execute
 */
export const MIGRATIONS = [
  {
    version: 1,
    description: 'Initial schema - core tables',
    statements: [
      // Migration tracking table
      `CREATE TABLE IF NOT EXISTS _migrations (
        version INTEGER PRIMARY KEY,
        applied_at INTEGER NOT NULL
      )`,

      // 1. Assets table (stocks, options, ETFs)
      `CREATE TABLE IF NOT EXISTS assets (
        id TEXT PRIMARY KEY,
        symbol TEXT NOT NULL,
        name TEXT,
        type TEXT NOT NULL DEFAULT 'STOCK',
        sector TEXT,
        strike_price REAL,
        expiry_date TEXT,
        created_at INTEGER NOT NULL DEFAULT (unixepoch()),
        updated_at INTEGER NOT NULL DEFAULT (unixepoch())
      )`,

      // 2. Informations table (news, articles, videos)
      `CREATE TABLE IF NOT EXISTS informations (
        id TEXT PRIMARY KEY,
        title TEXT NOT NULL,
        type TEXT NOT NULL DEFAULT 'ARTICLE',
        source TEXT,
        url TEXT,
        content TEXT,
        file_path TEXT,
        created_at INTEGER NOT NULL DEFAULT (unixepoch())
      )`,

      // 3. Decisions / Investment thesis table
      `CREATE TABLE IF NOT EXISTS decisions (
        id TEXT PRIMARY KEY,
        title TEXT NOT NULL,
        content TEXT,
        confidence INTEGER DEFAULT 3,
        sentiment TEXT DEFAULT 'NEUTRAL',
        status TEXT DEFAULT 'ACTIVE',
        created_at INTEGER NOT NULL DEFAULT (unixepoch()),
        updated_at INTEGER NOT NULL DEFAULT (unixepoch())
      )`,

      // 4. Trades table (execution records)
      `CREATE TABLE IF NOT EXISTS trades (
        id TEXT PRIMARY KEY,
        asset_id TEXT NOT NULL,
        decision_id TEXT,
        direction TEXT NOT NULL,
        quantity REAL NOT NULL,
        price REAL NOT NULL,
        fee REAL DEFAULT 0,
        account TEXT,
        trade_time INTEGER NOT NULL,
        note TEXT,
        created_at INTEGER NOT NULL DEFAULT (unixepoch()),
        FOREIGN KEY(asset_id) REFERENCES assets(id),
        FOREIGN KEY(decision_id) REFERENCES decisions(id)
      )`,

      // 5. Decision-Information links (many-to-many)
      `CREATE TABLE IF NOT EXISTS decision_info_links (
        decision_id TEXT NOT NULL,
        info_id TEXT NOT NULL,
        PRIMARY KEY (decision_id, info_id),
        FOREIGN KEY(decision_id) REFERENCES decisions(id),
        FOREIGN KEY(info_id) REFERENCES informations(id)
      )`,

      // 6. Reviews table (post-mortem)
      `CREATE TABLE IF NOT EXISTS reviews (
        id TEXT PRIMARY KEY,
        decision_id TEXT NOT NULL,
        review_content TEXT NOT NULL,
        is_successful INTEGER,
        lessons TEXT,
        created_at INTEGER NOT NULL DEFAULT (unixepoch()),
        FOREIGN KEY(decision_id) REFERENCES decisions(id)
      )`,

      // Indexes for high-frequency queries
      `CREATE INDEX IF NOT EXISTS idx_trades_asset ON trades(asset_id)`,
      `CREATE INDEX IF NOT EXISTS idx_trades_decision ON trades(decision_id)`,
      `CREATE INDEX IF NOT EXISTS idx_trades_time ON trades(trade_time DESC)`,
      `CREATE INDEX IF NOT EXISTS idx_trades_account ON trades(account)`,
      `CREATE INDEX IF NOT EXISTS idx_decisions_status ON decisions(status)`,
      `CREATE INDEX IF NOT EXISTS idx_decisions_sentiment ON decisions(sentiment)`,
      `CREATE INDEX IF NOT EXISTS idx_assets_symbol ON assets(symbol)`,
      `CREATE INDEX IF NOT EXISTS idx_assets_type ON assets(type)`,

      // Enable WAL mode for better concurrent read/write
      `PRAGMA journal_mode=WAL`,
    ],
  },
  {
    version: 2,
    description: 'Phase 2: Information loop and App Settings',
    statements: [
      // Add columns to informations
      `ALTER TABLE informations ADD COLUMN asset_id TEXT REFERENCES assets(id)`,
      `ALTER TABLE informations ADD COLUMN sector TEXT`,
      
      // Add viewpoints table for annotations
      `CREATE TABLE IF NOT EXISTS viewpoints (
        id TEXT PRIMARY KEY,
        info_id TEXT NOT NULL,
        content TEXT NOT NULL,
        created_at INTEGER NOT NULL DEFAULT (unixepoch()),
        FOREIGN KEY(info_id) REFERENCES informations(id)
      )`,

      // Add info_id to trades to link directly to information (optional, if they bypass decision)
      `ALTER TABLE trades ADD COLUMN info_id TEXT REFERENCES informations(id)`,

      // Add result_pnl to reviews
      `ALTER TABLE reviews ADD COLUMN result_pnl REAL`,

      // Add app_settings table
      `CREATE TABLE IF NOT EXISTS app_settings (
        key TEXT PRIMARY KEY,
        value TEXT,
        updated_at INTEGER NOT NULL DEFAULT (unixepoch())
      )`,

      // Indexes
      `CREATE INDEX IF NOT EXISTS idx_viewpoints_info ON viewpoints(info_id)`,
      `CREATE INDEX IF NOT EXISTS idx_informations_asset ON informations(asset_id)`
    ]
  },
  {
    version: 3,
    description: 'Phase 3: Add broker field to trades',
    statements: [
      `ALTER TABLE trades ADD COLUMN broker TEXT`,
    ]
  },
  {
    version: 4,
    description: 'Phase 4: Information lifecycle status',
    statements: [
      `ALTER TABLE informations ADD COLUMN status TEXT DEFAULT 'UNPROCESSED'`,
      `CREATE INDEX IF NOT EXISTS idx_informations_status ON informations(status)`
    ]
  },
  {
    version: 5,
    description: 'Phase 5: Viewpoint tags, lifecycle status, and version tracking',
    statements: [
      `ALTER TABLE viewpoints ADD COLUMN tags TEXT`,
      `ALTER TABLE viewpoints ADD COLUMN status TEXT DEFAULT 'ACTIVE'`,
      `ALTER TABLE viewpoints ADD COLUMN version INTEGER DEFAULT 1`,
      `ALTER TABLE viewpoints ADD COLUMN updated_at INTEGER`,
      `CREATE INDEX IF NOT EXISTS idx_viewpoints_status ON viewpoints(status)`
    ]
  },
  {
    version: 6,
    description: 'Phase 6: Add asset_id and sector to decisions',
    statements: [
      `ALTER TABLE decisions ADD COLUMN asset_id TEXT REFERENCES assets(id)`,
      `ALTER TABLE decisions ADD COLUMN sector TEXT`,
      `CREATE INDEX IF NOT EXISTS idx_decisions_asset ON decisions(asset_id)`
    ]
  },
  {
    version: 7,
    description: 'Phase 7: Collaborative information links and decision evidence',
    statements: [
      `CREATE TABLE IF NOT EXISTS information_asset_links (
        info_id TEXT NOT NULL,
        asset_id TEXT NOT NULL,
        position INTEGER DEFAULT 0,
        created_at INTEGER NOT NULL DEFAULT (unixepoch()),
        PRIMARY KEY (info_id, asset_id),
        FOREIGN KEY(info_id) REFERENCES informations(id),
        FOREIGN KEY(asset_id) REFERENCES assets(id)
      )`,
      `CREATE TABLE IF NOT EXISTS information_sector_links (
        info_id TEXT NOT NULL,
        sector TEXT NOT NULL,
        position INTEGER DEFAULT 0,
        created_at INTEGER NOT NULL DEFAULT (unixepoch()),
        PRIMARY KEY (info_id, sector),
        FOREIGN KEY(info_id) REFERENCES informations(id)
      )`,
      `ALTER TABLE viewpoints ADD COLUMN author TEXT DEFAULT '我'`,
      `ALTER TABLE viewpoints ADD COLUMN quote TEXT`,
      `ALTER TABLE viewpoints ADD COLUMN target_type TEXT DEFAULT 'GENERAL'`,
      `ALTER TABLE decisions ADD COLUMN priority INTEGER DEFAULT 3`,
      `CREATE INDEX IF NOT EXISTS idx_info_asset_links_asset ON information_asset_links(asset_id)`,
      `CREATE INDEX IF NOT EXISTS idx_info_sector_links_sector ON information_sector_links(sector)`,
      `CREATE INDEX IF NOT EXISTS idx_decision_info_links_info ON decision_info_links(info_id)`,
      `CREATE INDEX IF NOT EXISTS idx_decisions_priority ON decisions(priority)`
    ]
  },
  {
    version: 8,
    description: 'Phase 8: Option contract metadata and local price alerts',
    statements: [
      `ALTER TABLE assets ADD COLUMN underlying_symbol TEXT`,
      `ALTER TABLE assets ADD COLUMN option_type TEXT`,
      `ALTER TABLE trades ADD COLUMN underlying_symbol TEXT`,
      `ALTER TABLE trades ADD COLUMN strike_price REAL`,
      `ALTER TABLE trades ADD COLUMN expiry_date TEXT`,
      `ALTER TABLE trades ADD COLUMN option_type TEXT`,
      `ALTER TABLE trades ADD COLUMN contract_symbol TEXT`,
      `CREATE TABLE IF NOT EXISTS price_alerts (
        id TEXT PRIMARY KEY,
        symbol TEXT NOT NULL,
        asset_id TEXT,
        asset_type TEXT DEFAULT 'STOCK',
        condition TEXT NOT NULL,
        target_price REAL NOT NULL,
        last_price REAL,
        status TEXT DEFAULT 'ACTIVE',
        channels TEXT,
        note TEXT,
        created_at INTEGER NOT NULL DEFAULT (unixepoch()),
        updated_at INTEGER NOT NULL DEFAULT (unixepoch()),
        triggered_at INTEGER
      )`,
      `CREATE INDEX IF NOT EXISTS idx_price_alerts_symbol ON price_alerts(symbol)`,
      `CREATE INDEX IF NOT EXISTS idx_price_alerts_status ON price_alerts(status)`,
      `CREATE INDEX IF NOT EXISTS idx_trades_underlying ON trades(underlying_symbol)`,
      `CREATE INDEX IF NOT EXISTS idx_assets_underlying ON assets(underlying_symbol)`
    ]
  },
  {
    version: 9,
    description: 'Phase 9: Trade submitter identity',
    statements: [
      `ALTER TABLE trades ADD COLUMN author TEXT`,
      `CREATE INDEX IF NOT EXISTS idx_trades_author ON trades(author)`
    ]
  },
  {
    version: 10,
    description: 'Phase 10: Workspace-scoped trade sync metadata',
    statements: [
      `ALTER TABLE trades ADD COLUMN workspace_scope TEXT DEFAULT 'personal'`,
      `ALTER TABLE trades ADD COLUMN source_author TEXT`,
      `ALTER TABLE trades ADD COLUMN source_scope TEXT DEFAULT 'personal'`,
      `ALTER TABLE trades ADD COLUMN origin_id TEXT`,
      `ALTER TABLE trades ADD COLUMN sync_status TEXT DEFAULT 'local'`,
      `UPDATE trades
          SET workspace_scope = COALESCE(NULLIF(TRIM(workspace_scope), ''), 'personal'),
              source_author = COALESCE(NULLIF(TRIM(source_author), ''), COALESCE(NULLIF(TRIM(author), ''), '未标记')),
              source_scope = COALESCE(NULLIF(TRIM(source_scope), ''), 'personal'),
              origin_id = COALESCE(NULLIF(TRIM(origin_id), ''), id),
              sync_status = COALESCE(NULLIF(TRIM(sync_status), ''), 'local')`,
      `CREATE INDEX IF NOT EXISTS idx_trades_workspace_scope ON trades(workspace_scope)`,
      `CREATE INDEX IF NOT EXISTS idx_trades_source_author ON trades(source_author)`,
      `CREATE INDEX IF NOT EXISTS idx_trades_origin ON trades(origin_id, workspace_scope)`
    ]
  }
];

/**
 * Run all pending migrations
 */
export function getMigrationSQL(currentVersion) {
  return MIGRATIONS.filter((m) => m.version > currentVersion).sort(
    (a, b) => a.version - b.version
  );
}

-- Follow-up for environments that applied the older 0001 (pre-schema redesign).
-- Safe on fresh DBs that already have these objects (IF NOT EXISTS).
-- Column ALTERs are applied by scripts/patch-remote-schema.sh (idempotent).

CREATE TABLE IF NOT EXISTS market_latest (
  variant_id INTEGER PRIMARY KEY REFERENCES item_variants(id) ON DELETE CASCADE,
  snapshot_id INTEGER NOT NULL REFERENCES market_snapshots(id) ON DELETE CASCADE,
  min_price INTEGER,
  listing_count INTEGER NOT NULL DEFAULT 0,
  traded_28d INTEGER NOT NULL DEFAULT 0,
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS bosses (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  name_key TEXT NOT NULL,
  boss_type TEXT NOT NULL DEFAULT 'world'
    CHECK (boss_type IN ('world', 'gehenna', 'event', 'other')),
  location TEXT,
  notes TEXT,
  external_boss_id INTEGER,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_bosses_name_key ON bosses(name_key);

CREATE TABLE IF NOT EXISTS item_stats (
  item_id INTEGER PRIMARY KEY REFERENCES items(id) ON DELETE CASCADE,
  attack INTEGER,
  defense INTEGER,
  accuracy INTEGER,
  crit_rate REAL,
  hp INTEGER,
  mp INTEGER,
  extra_json TEXT,
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_items_tradeable ON items(tradeable);
CREATE INDEX IF NOT EXISTS idx_trades_traded_at ON market_trades(traded_at);
CREATE INDEX IF NOT EXISTS idx_sources_type ON sources(source_type);

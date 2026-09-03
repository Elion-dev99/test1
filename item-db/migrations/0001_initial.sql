-- MMORPG Item DB (取引所UI互換マスタ + 相場 + ドロップ)

CREATE TABLE IF NOT EXISTS items (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  name_key TEXT NOT NULL,
  category TEXT NOT NULL DEFAULT 'other'
    CHECK (category IN ('equipment', 'skillbook', 'collection', 'material', 'consumable', 'other')),
  rarity TEXT NOT NULL DEFAULT 'common'
    CHECK (rarity IN ('common', 'uncommon', 'rare', 'heroic', 'legendary')),
  slot TEXT,
  tradeable INTEGER NOT NULL DEFAULT 1,
  description TEXT,
  icon_url TEXT,
  verified INTEGER NOT NULL DEFAULT 0,
  source_url TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_items_name_key ON items(name_key);
CREATE INDEX IF NOT EXISTS idx_items_category ON items(category);
CREATE INDEX IF NOT EXISTS idx_items_rarity ON items(rarity);
CREATE INDEX IF NOT EXISTS idx_items_name ON items(name);

CREATE TABLE IF NOT EXISTS item_aliases (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  item_id INTEGER NOT NULL REFERENCES items(id) ON DELETE CASCADE,
  alias TEXT NOT NULL,
  alias_key TEXT NOT NULL,
  UNIQUE(alias_key)
);

CREATE INDEX IF NOT EXISTS idx_aliases_item ON item_aliases(item_id);

CREATE TABLE IF NOT EXISTS item_variants (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  item_id INTEGER NOT NULL REFERENCES items(id) ON DELETE CASCADE,
  enhance_level INTEGER NOT NULL DEFAULT 0,
  blessed INTEGER NOT NULL DEFAULT 0,
  option_summary TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(item_id, enhance_level, blessed)
);

CREATE INDEX IF NOT EXISTS idx_variants_item ON item_variants(item_id);

CREATE TABLE IF NOT EXISTS market_snapshots (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  variant_id INTEGER NOT NULL REFERENCES item_variants(id) ON DELETE CASCADE,
  min_price INTEGER,
  listing_count INTEGER NOT NULL DEFAULT 0,
  stock_qty INTEGER NOT NULL DEFAULT 0,
  traded_28d INTEGER NOT NULL DEFAULT 0,
  min_trade_price INTEGER,
  note TEXT,
  captured_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_snapshots_variant ON market_snapshots(variant_id);
CREATE INDEX IF NOT EXISTS idx_snapshots_captured ON market_snapshots(captured_at);

CREATE TABLE IF NOT EXISTS market_trades (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  variant_id INTEGER NOT NULL REFERENCES item_variants(id) ON DELETE CASCADE,
  price INTEGER NOT NULL,
  quantity INTEGER NOT NULL DEFAULT 1,
  traded_at TEXT,
  source TEXT NOT NULL DEFAULT 'manual',
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_trades_variant ON market_trades(variant_id);

CREATE TABLE IF NOT EXISTS drops (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  item_id INTEGER NOT NULL REFERENCES items(id) ON DELETE CASCADE,
  boss_name TEXT NOT NULL,
  drop_note TEXT,
  verified INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_drops_item ON drops(item_id);
CREATE INDEX IF NOT EXISTS idx_drops_boss ON drops(boss_name);

CREATE TABLE IF NOT EXISTS sources (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  item_id INTEGER NOT NULL REFERENCES items(id) ON DELETE CASCADE,
  source_type TEXT NOT NULL
    CHECK (source_type IN ('boss', 'dungeon', 'field', 'shop', 'craft', 'event', 'other')),
  label TEXT NOT NULL,
  ref_note TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_sources_item ON sources(item_id);

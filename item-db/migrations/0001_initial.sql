-- =============================================================================
-- MMORPG Item DB — テーブル構造設計 (VAMPIR 取引所UI互換)
-- =============================================================================
-- レイヤー:
--   1. Catalog  … items / aliases / variants
--   2. Market   … snapshots / trades
--   3. Acquire  … bosses / drops / sources
-- =============================================================================

-- ---------------------------------------------------------------------------
-- 1. items … アイテムマスタ（取引所の「品目」）
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS items (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,                          -- 表示名
  name_key TEXT NOT NULL,                      -- 正規化キー（検索・重複防止）
  category TEXT NOT NULL DEFAULT 'other'
    CHECK (category IN (
      'equipment',   -- 装備
      'skillbook',   -- スキルブック
      'collection',  -- 収集品
      'material',    -- 成長・製作素材
      'consumable',  -- 消費・ボックス
      'other'
    )),
  rarity TEXT NOT NULL DEFAULT 'common'
    CHECK (rarity IN (
      'common',      -- 一般
      'uncommon',    -- 高級
      'rare',        -- 希少
      'heroic',      -- 英雄
      'legendary'    -- 伝説
    )),
  slot TEXT,                                   -- 武器/ヘルム/…（装備のみ）
  tradeable INTEGER NOT NULL DEFAULT 1,         -- 1=取引可 / 0=帰属(キャラ)
  stackable INTEGER NOT NULL DEFAULT 1,         -- スタック可否
  description TEXT,
  icon_url TEXT,
  verified INTEGER NOT NULL DEFAULT 0,          -- 0=下書き / 1=検証済
  source_url TEXT,                             -- 出典（攻略・スクショ等）
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_items_name_key ON items(name_key);
CREATE INDEX IF NOT EXISTS idx_items_category ON items(category);
CREATE INDEX IF NOT EXISTS idx_items_rarity ON items(rarity);
CREATE INDEX IF NOT EXISTS idx_items_name ON items(name);
CREATE INDEX IF NOT EXISTS idx_items_tradeable ON items(tradeable);

-- ---------------------------------------------------------------------------
-- 2. item_aliases … 表記ゆれ（日/英/韓・略称）
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS item_aliases (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  item_id INTEGER NOT NULL REFERENCES items(id) ON DELETE CASCADE,
  alias TEXT NOT NULL,
  alias_key TEXT NOT NULL,
  UNIQUE(alias_key)
);

CREATE INDEX IF NOT EXISTS idx_aliases_item ON item_aliases(item_id);

-- ---------------------------------------------------------------------------
-- 3. item_variants … 強化・祝福で別売りになる単位（取引所詳細の軸）
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS item_variants (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  item_id INTEGER NOT NULL REFERENCES items(id) ON DELETE CASCADE,
  enhance_level INTEGER NOT NULL DEFAULT 0,     -- +0〜
  blessed INTEGER NOT NULL DEFAULT 0,           -- 祝福
  option_summary TEXT,                         -- 主なオプション要約（任意）
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(item_id, enhance_level, blessed)
);

CREATE INDEX IF NOT EXISTS idx_variants_item ON item_variants(item_id);

-- ---------------------------------------------------------------------------
-- 4. market_snapshots … 取引所一覧の瞬間値（最安・在庫・需要）
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS market_snapshots (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  variant_id INTEGER NOT NULL REFERENCES item_variants(id) ON DELETE CASCADE,
  min_price INTEGER,                           -- 現在最安（ダイヤ）
  listing_count INTEGER NOT NULL DEFAULT 0,     -- 現在販売件数
  stock_qty INTEGER NOT NULL DEFAULT 0,         -- 在庫合計
  traded_28d INTEGER NOT NULL DEFAULT 0,        -- 28日取引完了数
  min_trade_price INTEGER,                     -- 過去最低取引単価
  note TEXT,
  captured_at TEXT NOT NULL DEFAULT (datetime('now')),
  captured_by TEXT DEFAULT 'manual'            -- manual / import
);

CREATE INDEX IF NOT EXISTS idx_snapshots_variant ON market_snapshots(variant_id);
CREATE INDEX IF NOT EXISTS idx_snapshots_captured ON market_snapshots(captured_at);

-- 最新相場の高速参照用（variant ごとに1行）
CREATE TABLE IF NOT EXISTS market_latest (
  variant_id INTEGER PRIMARY KEY REFERENCES item_variants(id) ON DELETE CASCADE,
  snapshot_id INTEGER NOT NULL REFERENCES market_snapshots(id) ON DELETE CASCADE,
  min_price INTEGER,
  listing_count INTEGER NOT NULL DEFAULT 0,
  traded_28d INTEGER NOT NULL DEFAULT 0,
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- ---------------------------------------------------------------------------
-- 5. market_trades … 直近取引履歴（詳細画面の履歴相当・間引き可）
-- ---------------------------------------------------------------------------
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
CREATE INDEX IF NOT EXISTS idx_trades_traded_at ON market_trades(traded_at);

-- ---------------------------------------------------------------------------
-- 6. bosses … ボスマスタ（名前正規化・通知Bot連携用）
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS bosses (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  name_key TEXT NOT NULL,
  boss_type TEXT NOT NULL DEFAULT 'world'
    CHECK (boss_type IN ('world', 'gehenna', 'event', 'other')),
  location TEXT,
  notes TEXT,
  external_boss_id INTEGER,                    -- boss-notifier 側ID（任意）
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_bosses_name_key ON bosses(name_key);

-- ---------------------------------------------------------------------------
-- 7. drops … ボス → アイテム
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS drops (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  item_id INTEGER NOT NULL REFERENCES items(id) ON DELETE CASCADE,
  boss_id INTEGER REFERENCES bosses(id) ON DELETE SET NULL,
  boss_name TEXT NOT NULL,                     -- 表示用（boss未登録でも可）
  drop_note TEXT,                              -- 参加/貢献/ラスト等
  verified INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(item_id, boss_name)
);

CREATE INDEX IF NOT EXISTS idx_drops_item ON drops(item_id);
CREATE INDEX IF NOT EXISTS idx_drops_boss_name ON drops(boss_name);
CREATE INDEX IF NOT EXISTS idx_drops_boss_id ON drops(boss_id);

-- ---------------------------------------------------------------------------
-- 8. sources … 入手経路（ダンジョン/ショップ/クラフト等）
-- ---------------------------------------------------------------------------
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
CREATE INDEX IF NOT EXISTS idx_sources_type ON sources(source_type);

-- ---------------------------------------------------------------------------
-- 9. item_stats … 基礎ステ（シミュ用・任意・後から埋める）
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS item_stats (
  item_id INTEGER PRIMARY KEY REFERENCES items(id) ON DELETE CASCADE,
  attack INTEGER,
  defense INTEGER,
  accuracy INTEGER,
  crit_rate REAL,
  hp INTEGER,
  mp INTEGER,
  extra_json TEXT,                             -- その他ステをJSONで
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

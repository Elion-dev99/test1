-- Game update versions (Lodestone "Patch" equivalent for VAMPIR)
CREATE TABLE IF NOT EXISTS game_versions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  version_key TEXT NOT NULL UNIQUE,
  label TEXT NOT NULL,
  released_at TEXT,
  notes TEXT,
  is_current INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_game_versions_current ON game_versions(is_current);
CREATE INDEX IF NOT EXISTS idx_game_versions_released ON game_versions(released_at);

ALTER TABLE items ADD COLUMN game_version TEXT;

CREATE INDEX IF NOT EXISTS idx_items_game_version ON items(game_version);

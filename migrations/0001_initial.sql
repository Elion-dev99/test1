CREATE TABLE IF NOT EXISTS settings (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  discord_webhook_url TEXT,
  timezone TEXT NOT NULL DEFAULT 'Asia/Tokyo',
  default_notify_minutes TEXT NOT NULL DEFAULT '5,15,30',
  mention_role_id TEXT,
  mention_everyone INTEGER NOT NULL DEFAULT 0,
  embed_color TEXT NOT NULL DEFAULT '#E74C3C',
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

INSERT OR IGNORE INTO settings (id) VALUES (1);

CREATE TABLE IF NOT EXISTS bosses (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  location TEXT,
  description TEXT,
  image_url TEXT,
  respawn_minutes INTEGER NOT NULL DEFAULT 0,
  color TEXT NOT NULL DEFAULT '#E74C3C',
  enabled INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS schedules (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  boss_id INTEGER NOT NULL REFERENCES bosses(id) ON DELETE CASCADE,
  schedule_type TEXT NOT NULL CHECK (schedule_type IN ('daily', 'weekly', 'respawn', 'fixed')),
  daily_time TEXT,
  weekly_days TEXT,
  spawn_at TEXT,
  last_kill_at TEXT,
  notify_minutes TEXT,
  enabled INTEGER NOT NULL DEFAULT 1,
  notes TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_schedules_boss ON schedules(boss_id);
CREATE INDEX IF NOT EXISTS idx_schedules_enabled ON schedules(enabled);

CREATE TABLE IF NOT EXISTS notification_logs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  boss_id INTEGER NOT NULL,
  schedule_id INTEGER NOT NULL,
  notification_type TEXT NOT NULL,
  dedupe_key TEXT NOT NULL UNIQUE,
  message TEXT,
  sent_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_notification_logs_sent ON notification_logs(sent_at);

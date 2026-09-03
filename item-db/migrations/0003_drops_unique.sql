-- Ensure drops upsert key exists (may already be present via UNIQUE in 0001)
CREATE UNIQUE INDEX IF NOT EXISTS idx_drops_item_boss ON drops(item_id, boss_name);

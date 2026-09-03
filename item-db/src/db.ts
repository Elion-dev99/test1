import type {
  Boss,
  BossType,
  Drop,
  Item,
  ItemCategory,
  ItemRarity,
  ItemVariant,
  MarketSnapshot,
  Source,
} from './types';

export function normalizeKey(name: string): string {
  return name
    .normalize('NFKC')
    .toLowerCase()
    .replace(/[\s　_\-・･]+/g, '')
    .replace(/[（）()【】\[\]「」『』]/g, '');
}

export async function getStats(db: D1Database) {
  const [items, variants, snapshots, drops, bosses] = await Promise.all([
    db.prepare('SELECT COUNT(*) as c FROM items').first<{ c: number }>(),
    db.prepare('SELECT COUNT(*) as c FROM item_variants').first<{ c: number }>(),
    db.prepare('SELECT COUNT(*) as c FROM market_snapshots').first<{ c: number }>(),
    db.prepare('SELECT COUNT(*) as c FROM drops').first<{ c: number }>(),
    db.prepare('SELECT COUNT(*) as c FROM bosses').first<{ c: number }>(),
  ]);
  return {
    items: items?.c ?? 0,
    variants: variants?.c ?? 0,
    snapshots: snapshots?.c ?? 0,
    drops: drops?.c ?? 0,
    bosses: bosses?.c ?? 0,
  };
}

export async function listItems(
  db: D1Database,
  opts: { q?: string; category?: string; rarity?: string; limit?: number } = {},
): Promise<Item[]> {
  const limit = Math.min(opts.limit ?? 100, 500);
  const clauses: string[] = [];
  const binds: unknown[] = [];

  if (opts.q) {
    const key = `%${normalizeKey(opts.q)}%`;
    const like = `%${opts.q}%`;
    clauses.push(
      `(i.name LIKE ? OR i.name_key LIKE ? OR EXISTS (
        SELECT 1 FROM item_aliases a WHERE a.item_id = i.id AND (a.alias LIKE ? OR a.alias_key LIKE ?)
      ))`,
    );
    binds.push(like, key, like, key);
  }
  if (opts.category) {
    clauses.push('i.category = ?');
    binds.push(opts.category);
  }
  if (opts.rarity) {
    clauses.push('i.rarity = ?');
    binds.push(opts.rarity);
  }

  const where = clauses.length ? `WHERE ${clauses.join(' AND ')}` : '';
  binds.push(limit);

  return db
    .prepare(`SELECT i.* FROM items i ${where} ORDER BY i.name ASC LIMIT ?`)
    .bind(...binds)
    .all<Item>()
    .then((r) => r.results ?? []);
}

export async function getItem(db: D1Database, id: number): Promise<Item | null> {
  return db.prepare('SELECT * FROM items WHERE id = ?').bind(id).first<Item>();
}

export async function findItemByName(db: D1Database, name: string): Promise<Item | null> {
  const key = normalizeKey(name);
  const byKey = await db.prepare('SELECT * FROM items WHERE name_key = ?').bind(key).first<Item>();
  if (byKey) return byKey;
  return db
    .prepare(
      `SELECT i.* FROM items i
       JOIN item_aliases a ON a.item_id = i.id
       WHERE a.alias_key = ? LIMIT 1`,
    )
    .bind(key)
    .first<Item>();
}

export async function createItem(
  db: D1Database,
  data: {
    name: string;
    category?: ItemCategory;
    rarity?: ItemRarity;
    slot?: string | null;
    tradeable?: number;
    stackable?: number;
    description?: string | null;
    icon_url?: string | null;
    verified?: number;
    source_url?: string | null;
    aliases?: string[];
  },
): Promise<Item> {
  const nameKey = normalizeKey(data.name);
  const result = await db
    .prepare(
      `INSERT INTO items
        (name, name_key, category, rarity, slot, tradeable, stackable, description, icon_url, verified, source_url)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .bind(
      data.name,
      nameKey,
      data.category ?? 'other',
      data.rarity ?? 'common',
      data.slot ?? null,
      data.tradeable ?? 1,
      data.stackable ?? 1,
      data.description ?? null,
      data.icon_url ?? null,
      data.verified ?? 0,
      data.source_url ?? null,
    )
    .run();

  const id = Number(result.meta.last_row_id);
  for (const alias of data.aliases ?? []) {
    await db
      .prepare('INSERT OR IGNORE INTO item_aliases (item_id, alias, alias_key) VALUES (?, ?, ?)')
      .bind(id, alias, normalizeKey(alias))
      .run();
  }

  await db
    .prepare('INSERT INTO item_variants (item_id, enhance_level, blessed) VALUES (?, 0, 0)')
    .bind(id)
    .run();

  const item = await getItem(db, id);
  if (!item) throw new Error('Failed to create item');
  return item;
}

export async function updateItem(
  db: D1Database,
  id: number,
  data: Partial<{
    name: string;
    category: ItemCategory;
    rarity: ItemRarity;
    slot: string | null;
    tradeable: number;
    stackable: number;
    description: string | null;
    icon_url: string | null;
    verified: number;
    source_url: string | null;
  }>,
): Promise<Item | null> {
  const fields: string[] = [];
  const values: unknown[] = [];

  for (const [key, value] of Object.entries(data)) {
    if (value === undefined) continue;
    if (key === 'name') {
      fields.push('name = ?', 'name_key = ?');
      values.push(value, normalizeKey(String(value)));
      continue;
    }
    fields.push(`${key} = ?`);
    values.push(value);
  }

  if (fields.length === 0) return getItem(db, id);

  fields.push("updated_at = datetime('now')");
  values.push(id);

  await db
    .prepare(`UPDATE items SET ${fields.join(', ')} WHERE id = ?`)
    .bind(...values)
    .run();

  return getItem(db, id);
}

export async function deleteItem(db: D1Database, id: number): Promise<boolean> {
  const result = await db.prepare('DELETE FROM items WHERE id = ?').bind(id).run();
  return (result.meta.changes ?? 0) > 0;
}

export async function listVariants(db: D1Database, itemId: number): Promise<ItemVariant[]> {
  return db
    .prepare('SELECT * FROM item_variants WHERE item_id = ? ORDER BY enhance_level, blessed')
    .bind(itemId)
    .all<ItemVariant>()
    .then((r) => r.results ?? []);
}

export async function ensureVariant(
  db: D1Database,
  itemId: number,
  enhanceLevel = 0,
  blessed = 0,
  optionSummary?: string | null,
): Promise<ItemVariant> {
  const existing = await db
    .prepare(
      'SELECT * FROM item_variants WHERE item_id = ? AND enhance_level = ? AND blessed = ?',
    )
    .bind(itemId, enhanceLevel, blessed)
    .first<ItemVariant>();
  if (existing) {
    if (optionSummary !== undefined && optionSummary !== existing.option_summary) {
      await db
        .prepare('UPDATE item_variants SET option_summary = ? WHERE id = ?')
        .bind(optionSummary, existing.id)
        .run();
      return { ...existing, option_summary: optionSummary ?? null };
    }
    return existing;
  }

  const result = await db
    .prepare(
      'INSERT INTO item_variants (item_id, enhance_level, blessed, option_summary) VALUES (?, ?, ?, ?)',
    )
    .bind(itemId, enhanceLevel, blessed, optionSummary ?? null)
    .run();

  const row = await db
    .prepare('SELECT * FROM item_variants WHERE id = ?')
    .bind(Number(result.meta.last_row_id))
    .first<ItemVariant>();
  if (!row) throw new Error('Failed to create variant');
  return row;
}

export async function upsertItemStats(
  db: D1Database,
  itemId: number,
  data: {
    attack?: number | null;
    defense?: number | null;
    accuracy?: number | null;
    crit_rate?: number | null;
    hp?: number | null;
    mp?: number | null;
    extra_json?: string | null;
  },
) {
  await db
    .prepare(
      `INSERT INTO item_stats (item_id, attack, defense, accuracy, crit_rate, hp, mp, extra_json, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
       ON CONFLICT(item_id) DO UPDATE SET
         attack = excluded.attack,
         defense = excluded.defense,
         accuracy = excluded.accuracy,
         crit_rate = excluded.crit_rate,
         hp = excluded.hp,
         mp = excluded.mp,
         extra_json = excluded.extra_json,
         updated_at = datetime('now')`,
    )
    .bind(
      itemId,
      data.attack ?? null,
      data.defense ?? null,
      data.accuracy ?? null,
      data.crit_rate ?? null,
      data.hp ?? null,
      data.mp ?? null,
      data.extra_json ?? null,
    )
    .run();

  return db.prepare('SELECT * FROM item_stats WHERE item_id = ?').bind(itemId).first();
}

export async function addSnapshot(
  db: D1Database,
  variantId: number,
  data: {
    min_price?: number | null;
    listing_count?: number;
    stock_qty?: number;
    traded_28d?: number;
    min_trade_price?: number | null;
    note?: string | null;
    captured_by?: string;
  },
): Promise<MarketSnapshot> {
  const result = await db
    .prepare(
      `INSERT INTO market_snapshots
        (variant_id, min_price, listing_count, stock_qty, traded_28d, min_trade_price, note, captured_by)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .bind(
      variantId,
      data.min_price ?? null,
      data.listing_count ?? 0,
      data.stock_qty ?? 0,
      data.traded_28d ?? 0,
      data.min_trade_price ?? null,
      data.note ?? null,
      data.captured_by ?? 'manual',
    )
    .run();

  const snapshotId = Number(result.meta.last_row_id);
  await db
    .prepare(
      `INSERT INTO market_latest (variant_id, snapshot_id, min_price, listing_count, traded_28d, updated_at)
       VALUES (?, ?, ?, ?, ?, datetime('now'))
       ON CONFLICT(variant_id) DO UPDATE SET
         snapshot_id = excluded.snapshot_id,
         min_price = excluded.min_price,
         listing_count = excluded.listing_count,
         traded_28d = excluded.traded_28d,
         updated_at = datetime('now')`,
    )
    .bind(
      variantId,
      snapshotId,
      data.min_price ?? null,
      data.listing_count ?? 0,
      data.traded_28d ?? 0,
    )
    .run();

  const row = await db
    .prepare('SELECT * FROM market_snapshots WHERE id = ?')
    .bind(snapshotId)
    .first<MarketSnapshot>();
  if (!row) throw new Error('Failed to create snapshot');
  return row;
}

export async function latestSnapshot(
  db: D1Database,
  variantId: number,
): Promise<MarketSnapshot | null> {
  return db
    .prepare(
      `SELECT s.* FROM market_latest l
       JOIN market_snapshots s ON s.id = l.snapshot_id
       WHERE l.variant_id = ?`,
    )
    .bind(variantId)
    .first<MarketSnapshot>();
}

export async function upsertBoss(
  db: D1Database,
  data: {
    name: string;
    boss_type?: BossType;
    location?: string | null;
    notes?: string | null;
    external_boss_id?: number | null;
  },
): Promise<Boss> {
  const key = normalizeKey(data.name);
  const existing = await db
    .prepare('SELECT * FROM bosses WHERE name_key = ?')
    .bind(key)
    .first<Boss>();
  if (existing) return existing;

  const result = await db
    .prepare(
      `INSERT INTO bosses (name, name_key, boss_type, location, notes, external_boss_id)
       VALUES (?, ?, ?, ?, ?, ?)`,
    )
    .bind(
      data.name,
      key,
      data.boss_type ?? 'world',
      data.location ?? null,
      data.notes ?? null,
      data.external_boss_id ?? null,
    )
    .run();

  const row = await db
    .prepare('SELECT * FROM bosses WHERE id = ?')
    .bind(Number(result.meta.last_row_id))
    .first<Boss>();
  if (!row) throw new Error('Failed to create boss');
  return row;
}

export async function listBosses(db: D1Database): Promise<Boss[]> {
  return db
    .prepare('SELECT * FROM bosses ORDER BY name')
    .all<Boss>()
    .then((r) => r.results ?? []);
}

export async function addDrop(
  db: D1Database,
  data: {
    item_id: number;
    boss_name: string;
    boss_id?: number | null;
    drop_note?: string | null;
    verified?: number;
  },
): Promise<Drop> {
  let bossId = data.boss_id ?? null;
  if (!bossId) {
    const boss = await upsertBoss(db, { name: data.boss_name });
    bossId = boss.id;
  }

  const existing = await db
    .prepare('SELECT * FROM drops WHERE item_id = ? AND boss_name = ?')
    .bind(data.item_id, data.boss_name)
    .first<Drop>();

  if (existing) {
    await db
      .prepare(
        `UPDATE drops SET boss_id = ?, drop_note = ?, verified = ?
         WHERE id = ?`,
      )
      .bind(bossId, data.drop_note ?? null, data.verified ?? 0, existing.id)
      .run();
    const updated = await db
      .prepare('SELECT * FROM drops WHERE id = ?')
      .bind(existing.id)
      .first<Drop>();
    if (!updated) throw new Error('Failed to update drop');
    return updated;
  }

  const result = await db
    .prepare(
      `INSERT INTO drops (item_id, boss_id, boss_name, drop_note, verified)
       VALUES (?, ?, ?, ?, ?)`,
    )
    .bind(data.item_id, bossId, data.boss_name, data.drop_note ?? null, data.verified ?? 0)
    .run();

  const row = await db
    .prepare('SELECT * FROM drops WHERE id = ?')
    .bind(Number(result.meta.last_row_id))
    .first<Drop>();
  if (!row) throw new Error('Failed to create drop');
  return row;
}

export async function listDropsByBoss(db: D1Database, bossName: string) {
  return db
    .prepare(
      `SELECT d.*, i.name as item_name, i.category, i.rarity
       FROM drops d JOIN items i ON i.id = d.item_id
       WHERE d.boss_name = ?
       ORDER BY i.name`,
    )
    .bind(bossName)
    .all()
    .then((r) => r.results ?? []);
}

export async function listDropsByItem(db: D1Database, itemId: number): Promise<Drop[]> {
  return db
    .prepare('SELECT * FROM drops WHERE item_id = ? ORDER BY boss_name')
    .bind(itemId)
    .all<Drop>()
    .then((r) => r.results ?? []);
}

export async function addSource(
  db: D1Database,
  data: { item_id: number; source_type: string; label: string; ref_note?: string | null },
): Promise<Source> {
  const result = await db
    .prepare(
      'INSERT INTO sources (item_id, source_type, label, ref_note) VALUES (?, ?, ?, ?)',
    )
    .bind(data.item_id, data.source_type, data.label, data.ref_note ?? null)
    .run();

  const row = await db
    .prepare('SELECT * FROM sources WHERE id = ?')
    .bind(Number(result.meta.last_row_id))
    .first<Source>();
  if (!row) throw new Error('Failed to create source');
  return row;
}

export async function listSources(db: D1Database, itemId: number): Promise<Source[]> {
  return db
    .prepare('SELECT * FROM sources WHERE item_id = ? ORDER BY id')
    .bind(itemId)
    .all<Source>()
    .then((r) => r.results ?? []);
}

export async function getItemDetail(db: D1Database, id: number) {
  const item = await getItem(db, id);
  if (!item) return null;

  const [variants, drops, sources, aliases, stats] = await Promise.all([
    listVariants(db, id),
    listDropsByItem(db, id),
    listSources(db, id),
    db
      .prepare('SELECT alias FROM item_aliases WHERE item_id = ?')
      .bind(id)
      .all<{ alias: string }>()
      .then((r) => (r.results ?? []).map((a) => a.alias)),
    db.prepare('SELECT * FROM item_stats WHERE item_id = ?').bind(id).first(),
  ]);

  let extra: Record<string, unknown> | null = null;
  if (stats && typeof (stats as { extra_json?: string }).extra_json === 'string') {
    try {
      extra = JSON.parse((stats as { extra_json: string }).extra_json) as Record<string, unknown>;
    } catch {
      extra = null;
    }
  }

  const markets = [];
  for (const v of variants) {
    const snap = await latestSnapshot(db, v.id);
    markets.push({ variant: v, latest: snap });
  }

  return { item, aliases, variants, drops, sources, markets, stats, extra };
}

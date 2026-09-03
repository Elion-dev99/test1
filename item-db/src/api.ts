import type { Env, ApiResponse, ItemCategory, ItemRarity } from './types';
import * as db from './db';
import { createAdminToken, getAdminPassword, requireAdmin, verifyAdminToken } from './auth';
import { parseStatsText, statsExtraJson } from './statsText';

function json<T>(data: ApiResponse<T>, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Admin-Password',
    },
  });
}

function cors(): Response {
  return new Response(null, {
    status: 204,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Admin-Password',
    },
  });
}

async function parseBody<T>(request: Request): Promise<T | null> {
  try {
    return (await request.json()) as T;
  } catch {
    return null;
  }
}

export async function handleApi(request: Request, env: Env): Promise<Response | null> {
  const url = new URL(request.url);
  const path = url.pathname;

  if (!path.startsWith('/api/')) return null;
  if (request.method === 'OPTIONS') return cors();

  try {
    if (path === '/api/health' && request.method === 'GET') {
      const current = await db.getCurrentVersion(env.DB).catch(() => null);
      return json({
        success: true,
        data: {
          ok: true,
          game: env.GAME_NAME,
          version: current?.version_key ?? env.GAME_VERSION ?? null,
          admin_configured: Boolean(getAdminPassword(env)),
        },
      });
    }

    if (path === '/api/admin/login' && request.method === 'POST') {
      const body = await parseBody<{ password?: string }>(request);
      const expected = getAdminPassword(env);
      if (!expected) return json({ success: false, error: '管理パスワード未設定' }, 503);
      if (!body?.password || body.password !== expected) {
        return json({ success: false, error: 'パスワードが違います' }, 401);
      }
      const token = await createAdminToken(env);
      return json({ success: true, data: { token, expires_in: 60 * 60 * 12 } });
    }

    if (path === '/api/admin/me' && request.method === 'GET') {
      const auth = request.headers.get('Authorization') || '';
      const bearer = auth.startsWith('Bearer ') ? auth.slice(7).trim() : '';
      const ok = await verifyAdminToken(env, bearer);
      if (!ok) return json({ success: false, error: '未ログイン' }, 401);
      return json({ success: true, data: { ok: true, role: 'admin' } });
    }

    if (path === '/api/stats' && request.method === 'GET') {
      const stats = await db.getStats(env.DB);
      return json({ success: true, data: stats });
    }

    if (path === '/api/versions' && request.method === 'GET') {
      const [versions, current] = await Promise.all([
        db.listVersions(env.DB),
        db.getCurrentVersion(env.DB),
      ]);
      return json({ success: true, data: { current, versions } });
    }

    if (path === '/api/versions' && request.method === 'POST') {
      const denied = await requireAdmin(request, env);
      if (denied) return denied;
      const body = await parseBody<{
        code?: string;
        version_key?: string;
        label?: string;
        released_at?: string | null;
        notes?: string | null;
        is_current?: boolean | number;
      }>(request);
      const versionKey = (body?.version_key || body?.code || '').trim();
      if (!versionKey) return json({ success: false, error: 'version_key / code は必須です' }, 400);
      const version = await db.upsertVersion(env.DB, {
        version_key: versionKey,
        label: (body?.label || versionKey).trim(),
        released_at: body?.released_at ?? null,
        notes: body?.notes ?? null,
        is_current: body?.is_current ? 1 : 0,
      });
      return json({ success: true, data: version }, 201);
    }

    if (path === '/api/items' && request.method === 'GET') {
      const items = await db.listItems(env.DB, {
        q: url.searchParams.get('q') ?? undefined,
        category: url.searchParams.get('category') ?? undefined,
        rarity: url.searchParams.get('rarity') ?? undefined,
        slot: url.searchParams.get('slot') ?? undefined,
        version: url.searchParams.get('version') ?? undefined,
        limit: parseInt(url.searchParams.get('limit') ?? '100', 10),
      });
      return json({ success: true, data: items });
    }

    if (path === '/api/items' && request.method === 'POST') {
      const denied = await requireAdmin(request, env);
      if (denied) return denied;
      const body = await parseBody<{
        name: string;
        category?: ItemCategory;
        rarity?: ItemRarity;
        slot?: string;
        tradeable?: number;
        stackable?: number;
        description?: string;
        icon_url?: string;
        verified?: number;
        source_url?: string;
        game_version?: string | null;
        aliases?: string[];
        /** Free-form stats (1 line per attribute). Preferred over structured stats. */
        stats_text?: string;
        stats?: {
          attack?: number | null;
          defense?: number | null;
          accuracy?: number | null;
          crit_rate?: number | null;
          hp?: number | null;
          mp?: number | null;
          evasion?: number | null;
          atk?: number | null;
          def?: number | null;
          hit?: number | null;
          eva?: number | null;
        };
      }>(request);

      if (!body?.name) return json({ success: false, error: 'name は必須です' }, 400);

      try {
        const item = await db.createItem(env.DB, body);
        const parsed = parseStatsText(body.stats_text);
        if (parsed) {
          await db.upsertItemStats(env.DB, item.id, {
            attack: parsed.attack,
            defense: parsed.defense,
            accuracy: parsed.accuracy,
            crit_rate: parsed.crit_rate,
            hp: parsed.hp,
            mp: parsed.mp,
            extra_json: statsExtraJson(parsed),
          });
        } else if (body.stats) {
          const s = body.stats;
          const extra: Record<string, number> = {};
          const eva = s.evasion ?? s.eva;
          if (eva != null) extra.evasion = eva;
          await db.upsertItemStats(env.DB, item.id, {
            attack: s.attack ?? s.atk ?? null,
            defense: s.defense ?? s.def ?? null,
            accuracy: s.accuracy ?? s.hit ?? null,
            crit_rate: s.crit_rate ?? null,
            hp: s.hp ?? null,
            mp: s.mp ?? null,
            extra_json: Object.keys(extra).length ? JSON.stringify(extra) : null,
          });
        }
        return json({ success: true, data: item }, 201);
      } catch (err) {
        const message = err instanceof Error ? err.message : 'create failed';
        if (message.includes('UNIQUE')) {
          return json({ success: false, error: '同名アイテムが既に存在します' }, 409);
        }
        throw err;
      }
    }

    if (path === '/api/seed' && request.method === 'POST') {
      const denied = await requireAdmin(request, env);
      if (denied) return denied;
      const body = await parseBody<{
        bosses?: Array<{
          name: string;
          boss_type?: 'world' | 'gehenna' | 'event' | 'other';
          location?: string;
          notes?: string;
          external_boss_id?: number;
        }>;
        versions?: Array<{
          version_key: string;
          label: string;
          released_at?: string | null;
          notes?: string | null;
          is_current?: number;
        }>;
        items?: Array<{
          name: string;
          category?: ItemCategory;
          rarity?: ItemRarity;
          slot?: string | null;
          tradeable?: number;
          stackable?: number;
          description?: string | null;
          verified?: number;
          source_url?: string | null;
          game_version?: string | null;
          aliases?: string[];
          acquire_sources?: Array<{
            source_type: string;
            label: string;
            ref_note?: string | null;
          }>;
          drops?: Array<{
            boss_name: string;
            drop_note?: string | null;
            verified?: number;
          }>;
          enhance_levels?: Array<{
            enhance_level: number;
            weapon_min_atk?: number;
            weapon_max_atk?: number;
            weapon_add_atk?: number;
            accuracy?: number;
            skill_damage?: number;
          }>;
          stats?: {
            attack?: number | null;
            defense?: number | null;
            accuracy?: number | null;
            extra_json?: unknown;
          };
        }>;
      }>(request);

      if (!body) return json({ success: false, error: 'Invalid JSON' }, 400);

      const summary = {
        bosses_upserted: 0,
        versions_upserted: 0,
        items_created: 0,
        items_existing: 0,
        sources_added: 0,
        drops_added: 0,
        variants_upserted: 0,
        errors: [] as string[],
      };

      for (const ver of body.versions ?? []) {
        try {
          await db.upsertVersion(env.DB, ver);
          summary.versions_upserted += 1;
        } catch (err) {
          summary.errors.push(`version ${ver.version_key}: ${err instanceof Error ? err.message : 'fail'}`);
        }
      }

      for (const boss of body.bosses ?? []) {
        try {
          await db.upsertBoss(env.DB, boss);
          summary.bosses_upserted += 1;
        } catch (err) {
          summary.errors.push(`boss ${boss.name}: ${err instanceof Error ? err.message : 'fail'}`);
        }
      }

      for (const raw of body.items ?? []) {
        try {
          let item = await db.findItemByName(env.DB, raw.name);
          let created = false;
          if (!item) {
            item = await db.createItem(env.DB, {
              name: raw.name,
              category: raw.category,
              rarity: raw.rarity,
              slot: raw.slot,
              tradeable: raw.tradeable,
              stackable: raw.stackable,
              description: raw.description,
              verified: raw.verified,
              source_url: raw.source_url,
              game_version: raw.game_version,
              aliases: raw.aliases,
            });
            summary.items_created += 1;
            created = true;
          } else {
            summary.items_existing += 1;
            await db.updateItem(env.DB, item.id, {
              category: raw.category,
              rarity: raw.rarity,
              slot: raw.slot ?? null,
              tradeable: raw.tradeable,
              stackable: raw.stackable,
              description: raw.description ?? null,
              verified: raw.verified,
              source_url: raw.source_url ?? null,
              ...(raw.game_version !== undefined ? { game_version: raw.game_version } : {}),
            });
          }

          if (created || (await db.listSources(env.DB, item.id)).length === 0) {
            for (const src of raw.acquire_sources ?? []) {
              await db.addSource(env.DB, {
                item_id: item.id,
                source_type: src.source_type,
                label: src.label,
                ref_note: src.ref_note,
              });
              summary.sources_added += 1;
            }
          }

          for (const drop of raw.drops ?? []) {
            await db.addDrop(env.DB, {
              item_id: item.id,
              boss_name: drop.boss_name,
              drop_note: drop.drop_note,
              verified: drop.verified,
            });
            summary.drops_added += 1;
          }

          if (raw.enhance_levels?.length) {
            for (const lv of raw.enhance_levels) {
              const parts: string[] = [];
              if (lv.weapon_add_atk) parts.push(`追加攻撃+${lv.weapon_add_atk}`);
              if (lv.accuracy) parts.push(`命中+${lv.accuracy}`);
              await db.ensureVariant(
                env.DB,
                item.id,
                lv.enhance_level,
                0,
                parts.length ? parts.join(' / ') : '基礎値',
              );
              summary.variants_upserted += 1;
            }
          }

          if (raw.stats || raw.enhance_levels?.length) {
            const extra =
              raw.stats?.extra_json ??
              (raw.enhance_levels
                ? { enhance_table: raw.enhance_levels }
                : undefined);
            await db.upsertItemStats(env.DB, item.id, {
              attack: raw.stats?.attack ?? raw.enhance_levels?.[0]?.weapon_max_atk ?? null,
              defense: raw.stats?.defense ?? null,
              accuracy: raw.stats?.accuracy ?? 0,
              extra_json: extra ? JSON.stringify(extra) : null,
            });
          }
        } catch (err) {
          summary.errors.push(`item ${raw.name}: ${err instanceof Error ? err.message : 'fail'}`);
        }
      }

      return json({ success: summary.errors.length === 0, data: summary }, summary.errors.length ? 207 : 201);
    }

    if (path === '/api/items/lookup' && request.method === 'GET') {
      const name = url.searchParams.get('name');
      if (!name) return json({ success: false, error: 'name クエリが必要です' }, 400);
      const item = await db.findItemByName(env.DB, name);
      if (!item) return json({ success: false, error: '見つかりません' }, 404);
      const detail = await db.getItemDetail(env.DB, item.id);
      return json({ success: true, data: detail });
    }

    const itemMatch = path.match(/^\/api\/items\/(\d+)$/);
    if (itemMatch) {
      const id = parseInt(itemMatch[1], 10);

      if (request.method === 'GET') {
        const detail = await db.getItemDetail(env.DB, id);
        if (!detail) return json({ success: false, error: '見つかりません' }, 404);
        return json({ success: true, data: detail });
      }

      if (request.method === 'PUT') {
        const denied = await requireAdmin(request, env);
        if (denied) return denied;
        const body = await parseBody<Record<string, unknown>>(request);
        if (!body) return json({ success: false, error: 'Invalid JSON' }, 400);
        const item = await db.updateItem(env.DB, id, body as Parameters<typeof db.updateItem>[2]);
        if (!item) return json({ success: false, error: '見つかりません' }, 404);
        return json({ success: true, data: item });
      }

      if (request.method === 'DELETE') {
        const denied = await requireAdmin(request, env);
        if (denied) return denied;
        const ok = await db.deleteItem(env.DB, id);
        if (!ok) return json({ success: false, error: '見つかりません' }, 404);
        return json({ success: true, data: { deleted: true } });
      }
    }

    if (path === '/api/bosses' && request.method === 'GET') {
      const bosses = await db.listBosses(env.DB);
      return json({ success: true, data: bosses });
    }

    if (path === '/api/bosses' && request.method === 'POST') {
      const denied = await requireAdmin(request, env);
      if (denied) return denied;
      const body = await parseBody<{
        name: string;
        boss_type?: 'world' | 'gehenna' | 'event' | 'other';
        location?: string;
        notes?: string;
        external_boss_id?: number;
      }>(request);
      if (!body?.name) return json({ success: false, error: 'name は必須です' }, 400);
      const boss = await db.upsertBoss(env.DB, body);
      return json({ success: true, data: boss }, 201);
    }

    if (path === '/api/drops' && request.method === 'GET') {
      const boss = url.searchParams.get('boss');
      if (!boss) return json({ success: false, error: 'boss クエリが必要です' }, 400);
      const drops = await db.listDropsByBoss(env.DB, boss);
      return json({ success: true, data: drops });
    }

    if (path === '/api/drops' && request.method === 'POST') {
      const denied = await requireAdmin(request, env);
      if (denied) return denied;
      const body = await parseBody<{
        item_id?: number;
        item_name?: string;
        boss_name: string;
        location?: string | null;
        drop_rate?: number | null;
        drop_note?: string | null;
        notes?: string | null;
        verified?: number;
      }>(request);
      if (!body?.boss_name) {
        return json({ success: false, error: 'boss_name は必須です' }, 400);
      }
      let itemId = body.item_id;
      if (!itemId && body.item_name) {
        const found = await db.findItemByName(env.DB, body.item_name);
        if (!found) return json({ success: false, error: `アイテムが見つかりません: ${body.item_name}` }, 404);
        itemId = found.id;
      }
      if (!itemId) {
        return json({ success: false, error: 'item_id または item_name は必須です' }, 400);
      }
      if (body.location) {
        await db.upsertBoss(env.DB, { name: body.boss_name, location: body.location });
      }
      const noteParts: string[] = [];
      if (body.drop_rate != null) noteParts.push(`ドロップ率 ${body.drop_rate}%`);
      if (body.drop_note) noteParts.push(body.drop_note);
      if (body.notes) noteParts.push(body.notes);
      const drop = await db.addDrop(env.DB, {
        item_id: itemId,
        boss_name: body.boss_name,
        drop_note: noteParts.length ? noteParts.join(' / ') : null,
        verified: body.verified,
      });
      return json({ success: true, data: drop }, 201);
    }

    if (path === '/api/sources' && request.method === 'POST') {
      const denied = await requireAdmin(request, env);
      if (denied) return denied;
      const body = await parseBody<{
        item_id: number;
        source_type: string;
        label: string;
        ref_note?: string;
      }>(request);
      if (!body?.item_id || !body?.source_type || !body?.label) {
        return json({ success: false, error: 'item_id, source_type, label は必須です' }, 400);
      }
      const source = await db.addSource(env.DB, body);
      return json({ success: true, data: source }, 201);
    }

    return json({ success: false, error: 'Not found' }, 404);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Internal server error';
    return json({ success: false, error: message }, 500);
  }
}

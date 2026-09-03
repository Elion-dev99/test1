import type { Env, ApiResponse, ItemCategory, ItemRarity } from './types';
import * as db from './db';

function json<T>(data: ApiResponse<T>, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
    },
  });
}

function cors(): Response {
  return new Response(null, {
    status: 204,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
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
      return json({ success: true, data: { ok: true, game: env.GAME_NAME } });
    }

    if (path === '/api/stats' && request.method === 'GET') {
      const stats = await db.getStats(env.DB);
      return json({ success: true, data: stats });
    }

    if (path === '/api/items' && request.method === 'GET') {
      const items = await db.listItems(env.DB, {
        q: url.searchParams.get('q') ?? undefined,
        category: url.searchParams.get('category') ?? undefined,
        rarity: url.searchParams.get('rarity') ?? undefined,
        limit: parseInt(url.searchParams.get('limit') ?? '100', 10),
      });
      return json({ success: true, data: items });
    }

    if (path === '/api/items' && request.method === 'POST') {
      const body = await parseBody<{
        name: string;
        category?: ItemCategory;
        rarity?: ItemRarity;
        slot?: string;
        tradeable?: number;
        description?: string;
        icon_url?: string;
        verified?: number;
        source_url?: string;
        aliases?: string[];
      }>(request);

      if (!body?.name) return json({ success: false, error: 'name は必須です' }, 400);

      try {
        const item = await db.createItem(env.DB, body);
        return json({ success: true, data: item }, 201);
      } catch (err) {
        const message = err instanceof Error ? err.message : 'create failed';
        if (message.includes('UNIQUE')) {
          return json({ success: false, error: '同名アイテムが既に存在します' }, 409);
        }
        throw err;
      }
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
        const body = await parseBody<Record<string, unknown>>(request);
        if (!body) return json({ success: false, error: 'Invalid JSON' }, 400);
        const item = await db.updateItem(env.DB, id, body as Parameters<typeof db.updateItem>[2]);
        if (!item) return json({ success: false, error: '見つかりません' }, 404);
        return json({ success: true, data: item });
      }

      if (request.method === 'DELETE') {
        const ok = await db.deleteItem(env.DB, id);
        if (!ok) return json({ success: false, error: '見つかりません' }, 404);
        return json({ success: true, data: { deleted: true } });
      }
    }

    const priceMatch = path.match(/^\/api\/items\/(\d+)\/price$/);
    if (priceMatch && request.method === 'POST') {
      const itemId = parseInt(priceMatch[1], 10);
      const item = await db.getItem(env.DB, itemId);
      if (!item) return json({ success: false, error: '見つかりません' }, 404);

      const body = await parseBody<{
        enhance_level?: number;
        blessed?: number;
        min_price?: number;
        listing_count?: number;
        stock_qty?: number;
        traded_28d?: number;
        min_trade_price?: number;
        note?: string;
      }>(request);

      const variant = await db.ensureVariant(
        env.DB,
        itemId,
        body?.enhance_level ?? 0,
        body?.blessed ?? 0,
      );
      const snap = await db.addSnapshot(env.DB, variant.id, body ?? {});
      return json({ success: true, data: { variant, snapshot: snap } }, 201);
    }

    if (path === '/api/bosses' && request.method === 'GET') {
      const bosses = await db.listBosses(env.DB);
      return json({ success: true, data: bosses });
    }

    if (path === '/api/bosses' && request.method === 'POST') {
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
      const body = await parseBody<{
        item_id: number;
        boss_name: string;
        drop_note?: string;
        verified?: number;
      }>(request);
      if (!body?.item_id || !body?.boss_name) {
        return json({ success: false, error: 'item_id と boss_name は必須です' }, 400);
      }
      const drop = await db.addDrop(env.DB, body);
      return json({ success: true, data: drop }, 201);
    }

    if (path === '/api/sources' && request.method === 'POST') {
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

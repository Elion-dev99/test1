import type { Env, ApiResponse } from './types';
import * as db from './db';
import { collectNotificationEvents, getNextSpawnTime, getScheduleLabel } from './scheduler';
import { sendDiscordNotification, sendKillNotification, sendTestNotification } from './discord';

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
    // Dashboard stats
    if (path === '/api/stats' && request.method === 'GET') {
      const stats = await db.getDashboardStats(env.DB);
      return json({ success: true, data: stats });
    }

    // Settings
    if (path === '/api/settings' && request.method === 'GET') {
      const settings = await db.getSettings(env.DB);
      return json({ success: true, data: settings });
    }

    if (path === '/api/settings' && request.method === 'PUT') {
      const body = await parseBody<Record<string, unknown>>(request);
      if (!body) return json({ success: false, error: 'Invalid JSON' }, 400);
      const settings = await db.updateSettings(env.DB, body as Parameters<typeof db.updateSettings>[1]);
      return json({ success: true, data: settings });
    }

    if (path === '/api/settings/test' && request.method === 'POST') {
      const settings = await db.getSettings(env.DB);
      if (!settings.discord_webhook_url) {
        return json({ success: false, error: 'Discord Webhook URL が設定されていません' }, 400);
      }
      const result = await sendTestNotification(settings.discord_webhook_url, settings);
      if (!result.ok) return json({ success: false, error: result.error }, 500);
      return json({ success: true, data: { message: 'テスト通知を送信しました' } });
    }

    // Bosses
    if (path === '/api/bosses' && request.method === 'GET') {
      const bosses = await db.listBosses(env.DB);
      return json({ success: true, data: bosses });
    }

    if (path === '/api/bosses' && request.method === 'POST') {
      const body = await parseBody<{
        name: string;
        location?: string;
        description?: string;
        image_url?: string;
        respawn_minutes?: number;
        color?: string;
        enabled?: number;
      }>(request);

      if (!body?.name) return json({ success: false, error: 'ボス名は必須です' }, 400);

      const boss = await db.createBoss(env.DB, {
        name: body.name,
        location: body.location ?? null,
        description: body.description ?? null,
        image_url: body.image_url ?? null,
        respawn_minutes: body.respawn_minutes ?? 0,
        color: body.color ?? '#E74C3C',
        enabled: body.enabled ?? 1,
      });

      return json({ success: true, data: boss }, 201);
    }

    const bossMatch = path.match(/^\/api\/bosses\/(\d+)$/);
    if (bossMatch) {
      const id = parseInt(bossMatch[1], 10);

      if (request.method === 'GET') {
        const boss = await db.getBoss(env.DB, id);
        if (!boss) return json({ success: false, error: 'ボスが見つかりません' }, 404);
        return json({ success: true, data: boss });
      }

      if (request.method === 'PUT') {
        const body = await parseBody<Record<string, unknown>>(request);
        if (!body) return json({ success: false, error: 'Invalid JSON' }, 400);
        const boss = await db.updateBoss(env.DB, id, body as Parameters<typeof db.updateBoss>[2]);
        if (!boss) return json({ success: false, error: 'ボスが見つかりません' }, 404);
        return json({ success: true, data: boss });
      }

      if (request.method === 'DELETE') {
        const deleted = await db.deleteBoss(env.DB, id);
        if (!deleted) return json({ success: false, error: 'ボスが見つかりません' }, 404);
        return json({ success: true, data: { deleted: true } });
      }
    }

    // Schedules
    if (path === '/api/schedules' && request.method === 'GET') {
      const bossId = url.searchParams.get('boss_id');
      const schedules = await db.listSchedules(env.DB, bossId ? parseInt(bossId, 10) : undefined);
      const settings = await db.getSettings(env.DB);
      const now = new Date();

      const enriched = schedules.map((s) => ({
        ...s,
        schedule_label: getScheduleLabel(s, settings.timezone),
        next_spawn: getNextSpawnTime(s, now, settings.timezone)?.toISOString() ?? null,
      }));

      return json({ success: true, data: enriched });
    }

    if (path === '/api/schedules' && request.method === 'POST') {
      const body = await parseBody<{
        boss_id: number;
        schedule_type: string;
        daily_time?: string;
        weekly_days?: string;
        spawn_at?: string;
        last_kill_at?: string;
        notify_minutes?: string;
        enabled?: number;
        notes?: string;
      }>(request);

      if (!body?.boss_id || !body?.schedule_type) {
        return json({ success: false, error: 'boss_id と schedule_type は必須です' }, 400);
      }

      const schedule = await db.createSchedule(env.DB, {
        boss_id: body.boss_id,
        schedule_type: body.schedule_type as 'daily' | 'weekly' | 'respawn' | 'fixed',
        daily_time: body.daily_time ?? null,
        weekly_days: body.weekly_days ?? null,
        spawn_at: body.spawn_at ?? null,
        last_kill_at: body.last_kill_at ?? null,
        notify_minutes: body.notify_minutes ?? null,
        enabled: body.enabled ?? 1,
        notes: body.notes ?? null,
      });

      return json({ success: true, data: schedule }, 201);
    }

    const scheduleMatch = path.match(/^\/api\/schedules\/(\d+)$/);
    if (scheduleMatch) {
      const id = parseInt(scheduleMatch[1], 10);

      if (request.method === 'GET') {
        const schedule = await db.getSchedule(env.DB, id);
        if (!schedule) return json({ success: false, error: 'スケジュールが見つかりません' }, 404);
        return json({ success: true, data: schedule });
      }

      if (request.method === 'PUT') {
        const body = await parseBody<Record<string, unknown>>(request);
        if (!body) return json({ success: false, error: 'Invalid JSON' }, 400);
        const schedule = await db.updateSchedule(env.DB, id, body as Parameters<typeof db.updateSchedule>[2]);
        if (!schedule) return json({ success: false, error: 'スケジュールが見つかりません' }, 404);
        return json({ success: true, data: schedule });
      }

      if (request.method === 'DELETE') {
        const deleted = await db.deleteSchedule(env.DB, id);
        if (!deleted) return json({ success: false, error: 'スケジュールが見つかりません' }, 404);
        return json({ success: true, data: { deleted: true } });
      }
    }

    // Kill boss
    const killMatch = path.match(/^\/api\/schedules\/(\d+)\/kill$/);
    if (killMatch && request.method === 'POST') {
      const id = parseInt(killMatch[1], 10);
      const schedule = await db.getSchedule(env.DB, id);
      if (!schedule) return json({ success: false, error: 'スケジュールが見つかりません' }, 404);

      const updated = await db.markBossKilled(env.DB, id);
      const settings = await db.getSettings(env.DB);

      if (settings.discord_webhook_url) {
        const body = await parseBody<{ notify?: boolean }>(request);
        if (body?.notify !== false) {
          await sendKillNotification(settings.discord_webhook_url, settings, schedule);
        }
      }

      return json({ success: true, data: updated });
    }

    // Manual notify
    const notifyMatch = path.match(/^\/api\/schedules\/(\d+)\/notify$/);
    if (notifyMatch && request.method === 'POST') {
      const id = parseInt(notifyMatch[1], 10);
      const schedule = await db.getSchedule(env.DB, id);
      if (!schedule) return json({ success: false, error: 'スケジュールが見つかりません' }, 404);

      const settings = await db.getSettings(env.DB);
      if (!settings.discord_webhook_url) {
        return json({ success: false, error: 'Discord Webhook URL が設定されていません' }, 400);
      }

      const now = new Date();
      const spawnAt = getNextSpawnTime(schedule, now, settings.timezone) ?? now;
      const body = await parseBody<{ message?: string }>(request);

      const event = {
        schedule,
        type: 'spawn' as const,
        minutesUntil: 0,
        spawnAt,
        dedupeKey: `manual:${id}:${Date.now()}`,
      };

      const result = await sendDiscordNotification(
        settings.discord_webhook_url,
        settings,
        event,
        body?.message,
      );

      if (!result.ok) return json({ success: false, error: result.error }, 500);
      return json({ success: true, data: { message: '通知を送信しました' } });
    }

    // Notification logs
    if (path === '/api/logs' && request.method === 'GET') {
      const limit = parseInt(url.searchParams.get('limit') ?? '50', 10);
      const logs = await db.listNotificationLogs(env.DB, limit);
      return json({ success: true, data: logs });
    }

    // Manual cron trigger (for testing)
    if (path === '/api/cron/run' && request.method === 'POST') {
      const result = await processScheduledNotifications(env);
      return json({ success: true, data: result });
    }

    return json({ success: false, error: 'Not found' }, 404);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Internal server error';
    return json({ success: false, error: message }, 500);
  }
}

export async function processScheduledNotifications(env: Env) {
  const settings = await db.getSettings(env.DB);
  if (!settings.discord_webhook_url) {
    return { sent: 0, skipped: 0, reason: 'No webhook configured' };
  }

  const schedules = await db.listSchedules(env.DB);
  const activeSchedules = schedules.filter((s) => s.enabled);
  const events = collectNotificationEvents(activeSchedules, settings);

  let sent = 0;
  let skipped = 0;

  for (const event of events) {
    const logged = await db.logNotification(
      env.DB,
      event.schedule.boss_id,
      event.schedule.id,
      event.type,
      event.dedupeKey,
      `${event.schedule.boss_name} - ${event.type}`,
    );

    if (!logged) {
      skipped++;
      continue;
    }

    const result = await sendDiscordNotification(settings.discord_webhook_url, settings, event);
    if (result.ok) {
      sent++;
    } else {
      skipped++;
    }
  }

  return { sent, skipped, checked: events.length };
}

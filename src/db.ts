import type { Boss, Schedule, ScheduleWithBoss, Settings } from './types';

export async function getSettings(db: D1Database): Promise<Settings> {
  const row = await db.prepare('SELECT * FROM settings WHERE id = 1').first<Settings>();
  if (!row) throw new Error('Settings not found');
  return row;
}

export async function updateSettings(
  db: D1Database,
  data: Partial<Omit<Settings, 'id' | 'updated_at'>>,
): Promise<Settings> {
  const fields: string[] = [];
  const values: unknown[] = [];

  for (const [key, value] of Object.entries(data)) {
    if (value !== undefined) {
      fields.push(`${key} = ?`);
      values.push(value);
    }
  }

  if (fields.length === 0) return getSettings(db);

  fields.push("updated_at = datetime('now')");
  await db
    .prepare(`UPDATE settings SET ${fields.join(', ')} WHERE id = 1`)
    .bind(...values)
    .run();

  return getSettings(db);
}

export async function listBosses(db: D1Database): Promise<Boss[]> {
  const result = await db.prepare('SELECT * FROM bosses ORDER BY name').all<Boss>();
  return result.results ?? [];
}

export async function getBoss(db: D1Database, id: number): Promise<Boss | null> {
  return db.prepare('SELECT * FROM bosses WHERE id = ?').bind(id).first<Boss>();
}

export async function createBoss(
  db: D1Database,
  data: Omit<Boss, 'id' | 'created_at' | 'updated_at'>,
): Promise<Boss> {
  const result = await db
    .prepare(
      `INSERT INTO bosses (name, location, description, image_url, respawn_minutes, color, enabled)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
    )
    .bind(
      data.name,
      data.location,
      data.description,
      data.image_url,
      data.respawn_minutes,
      data.color,
      data.enabled,
    )
    .run();

  const boss = await getBoss(db, Number(result.meta.last_row_id));
  if (!boss) throw new Error('Failed to create boss');
  return boss;
}

export async function updateBoss(
  db: D1Database,
  id: number,
  data: Partial<Omit<Boss, 'id' | 'created_at' | 'updated_at'>>,
): Promise<Boss | null> {
  const fields: string[] = [];
  const values: unknown[] = [];

  for (const [key, value] of Object.entries(data)) {
    if (value !== undefined) {
      fields.push(`${key} = ?`);
      values.push(value);
    }
  }

  if (fields.length === 0) return getBoss(db, id);

  fields.push("updated_at = datetime('now')");
  values.push(id);

  await db
    .prepare(`UPDATE bosses SET ${fields.join(', ')} WHERE id = ?`)
    .bind(...values)
    .run();

  return getBoss(db, id);
}

export async function deleteBoss(db: D1Database, id: number): Promise<boolean> {
  const result = await db.prepare('DELETE FROM bosses WHERE id = ?').bind(id).run();
  return (result.meta.changes ?? 0) > 0;
}

export async function listSchedules(db: D1Database, bossId?: number): Promise<ScheduleWithBoss[]> {
  const query = `
    SELECT s.*, b.name as boss_name, b.location as boss_location,
           b.description as boss_description, b.image_url as boss_image_url,
           b.respawn_minutes as boss_respawn_minutes, b.color as boss_color
    FROM schedules s
    JOIN bosses b ON b.id = s.boss_id
    ${bossId ? 'WHERE s.boss_id = ?' : ''}
    ORDER BY b.name, s.id
  `;

  const stmt = db.prepare(query);
  const result = bossId
    ? await stmt.bind(bossId).all<ScheduleWithBoss>()
    : await stmt.all<ScheduleWithBoss>();

  return result.results ?? [];
}

export async function getSchedule(db: D1Database, id: number): Promise<ScheduleWithBoss | null> {
  const result = await db
    .prepare(
      `SELECT s.*, b.name as boss_name, b.location as boss_location,
              b.description as boss_description, b.image_url as boss_image_url,
              b.respawn_minutes as boss_respawn_minutes, b.color as boss_color
       FROM schedules s
       JOIN bosses b ON b.id = s.boss_id
       WHERE s.id = ?`,
    )
    .bind(id)
    .first<ScheduleWithBoss>();

  return result;
}

export async function createSchedule(
  db: D1Database,
  data: Omit<Schedule, 'id' | 'created_at' | 'updated_at'>,
): Promise<Schedule> {
  const result = await db
    .prepare(
      `INSERT INTO schedules (boss_id, schedule_type, daily_time, weekly_days, spawn_at,
        last_kill_at, notify_minutes, enabled, notes)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .bind(
      data.boss_id,
      data.schedule_type,
      data.daily_time,
      data.weekly_days,
      data.spawn_at,
      data.last_kill_at,
      data.notify_minutes,
      data.enabled,
      data.notes,
    )
    .run();

  const schedule = await db
    .prepare('SELECT * FROM schedules WHERE id = ?')
    .bind(result.meta.last_row_id)
    .first<Schedule>();

  if (!schedule) throw new Error('Failed to create schedule');
  return schedule;
}

export async function updateSchedule(
  db: D1Database,
  id: number,
  data: Partial<Omit<Schedule, 'id' | 'created_at' | 'updated_at'>>,
): Promise<Schedule | null> {
  const fields: string[] = [];
  const values: unknown[] = [];

  for (const [key, value] of Object.entries(data)) {
    if (value !== undefined) {
      fields.push(`${key} = ?`);
      values.push(value);
    }
  }

  if (fields.length === 0) {
    return db.prepare('SELECT * FROM schedules WHERE id = ?').bind(id).first<Schedule>();
  }

  fields.push("updated_at = datetime('now')");
  values.push(id);

  await db
    .prepare(`UPDATE schedules SET ${fields.join(', ')} WHERE id = ?`)
    .bind(...values)
    .run();

  return db.prepare('SELECT * FROM schedules WHERE id = ?').bind(id).first<Schedule>();
}

export async function deleteSchedule(db: D1Database, id: number): Promise<boolean> {
  const result = await db.prepare('DELETE FROM schedules WHERE id = ?').bind(id).run();
  return (result.meta.changes ?? 0) > 0;
}

export async function markBossKilled(db: D1Database, scheduleId: number): Promise<Schedule | null> {
  const now = new Date().toISOString();
  return updateSchedule(db, scheduleId, { last_kill_at: now });
}

export async function logNotification(
  db: D1Database,
  bossId: number,
  scheduleId: number,
  type: string,
  dedupeKey: string,
  message: string,
): Promise<boolean> {
  try {
    await db
      .prepare(
        `INSERT INTO notification_logs (boss_id, schedule_id, notification_type, dedupe_key, message)
         VALUES (?, ?, ?, ?, ?)`,
      )
      .bind(bossId, scheduleId, type, dedupeKey, message)
      .run();
    return true;
  } catch {
    return false;
  }
}

export async function listNotificationLogs(
  db: D1Database,
  limit = 50,
): Promise<
  Array<{
    id: number;
    boss_id: number;
    schedule_id: number;
    notification_type: string;
    message: string | null;
    sent_at: string;
    boss_name: string;
  }>
> {
  const result = await db
    .prepare(
      `SELECT nl.*, b.name as boss_name
       FROM notification_logs nl
       JOIN bosses b ON b.id = nl.boss_id
       ORDER BY nl.sent_at DESC
       LIMIT ?`,
    )
    .bind(limit)
    .all();

  return (result.results ?? []) as Array<{
    id: number;
    boss_id: number;
    schedule_id: number;
    notification_type: string;
    message: string | null;
    sent_at: string;
    boss_name: string;
  }>;
}

export async function getDashboardStats(db: D1Database) {
  const bosses = await db
    .prepare('SELECT COUNT(*) as count FROM bosses WHERE enabled = 1')
    .first<{ count: number }>();
  const schedules = await db
    .prepare('SELECT COUNT(*) as count FROM schedules WHERE enabled = 1')
    .first<{ count: number }>();
  const notifications = await db
    .prepare("SELECT COUNT(*) as count FROM notification_logs WHERE sent_at > datetime('now', '-24 hours')")
    .first<{ count: number }>();

  return {
    activeBosses: bosses?.count ?? 0,
    activeSchedules: schedules?.count ?? 0,
    notificationsToday: notifications?.count ?? 0,
  };
}

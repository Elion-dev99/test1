import type { NotificationEvent, Settings, ScheduleWithBoss } from './types';

function parseNotifyMinutes(value: string | null, fallback: string): number[] {
  const raw = (value || fallback)
    .split(',')
    .map((s) => parseInt(s.trim(), 10))
    .filter((n) => !isNaN(n) && n >= 0);
  return [...new Set(raw)].sort((a, b) => b - a);
}

function getZonedParts(date: Date, timezone: string) {
  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    weekday: 'short',
    hour12: false,
  });

  const parts = formatter.formatToParts(date);
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? '';

  return {
    year: parseInt(get('year'), 10),
    month: parseInt(get('month'), 10),
    day: parseInt(get('day'), 10),
    hour: parseInt(get('hour'), 10),
    minute: parseInt(get('minute'), 10),
    weekday: get('weekday'),
  };
}

const WEEKDAY_MAP: Record<string, number> = {
  Sun: 0,
  Mon: 1,
  Tue: 2,
  Wed: 3,
  Thu: 4,
  Fri: 5,
  Sat: 6,
};

function buildSpawnDate(
  year: number,
  month: number,
  day: number,
  hour: number,
  minute: number,
  timezone: string,
): Date {
  const guess = new Date(Date.UTC(year, month - 1, day, hour, minute, 0));
  const offset = getTimezoneOffsetMs(guess, timezone);
  return new Date(guess.getTime() - offset);
}

function getTimezoneOffsetMs(date: Date, timezone: string): number {
  const utc = new Date(date.toLocaleString('en-US', { timeZone: 'UTC' }));
  const local = new Date(date.toLocaleString('en-US', { timeZone: timezone }));
  return local.getTime() - utc.getTime();
}

function minutesDiff(a: Date, b: Date): number {
  return Math.round((a.getTime() - b.getTime()) / 60000);
}

function formatDedupeKey(scheduleId: number, type: string, spawnAt: Date, minutesUntil: number): string {
  return `${scheduleId}:${type}:${spawnAt.toISOString()}:${minutesUntil}`;
}

function parseTime(timeStr: string): { hour: number; minute: number } | null {
  const match = timeStr.match(/^(\d{1,2}):(\d{2})$/);
  if (!match) return null;
  const hour = parseInt(match[1], 10);
  const minute = parseInt(match[2], 10);
  if (hour < 0 || hour > 23 || minute < 0 || minute > 59) return null;
  return { hour, minute };
}

function getNextDailySpawn(now: Date, dailyTime: string, timezone: string): Date | null {
  const time = parseTime(dailyTime);
  if (!time) return null;

  const parts = getZonedParts(now, timezone);
  let spawn = buildSpawnDate(parts.year, parts.month, parts.day, time.hour, time.minute, timezone);

  if (spawn.getTime() <= now.getTime()) {
    const tomorrow = new Date(now.getTime() + 24 * 60 * 60 * 1000);
    const tParts = getZonedParts(tomorrow, timezone);
    spawn = buildSpawnDate(tParts.year, tParts.month, tParts.day, time.hour, time.minute, timezone);
  }

  return spawn;
}

function getNextWeeklySpawn(
  now: Date,
  dailyTime: string,
  weeklyDays: string,
  timezone: string,
): Date | null {
  const time = parseTime(dailyTime);
  if (!time) return null;

  const targetDays = weeklyDays
    .split(',')
    .map((d) => parseInt(d.trim(), 10))
    .filter((d) => d >= 0 && d <= 6);

  if (targetDays.length === 0) return null;

  for (let i = 0; i < 8; i++) {
    const check = new Date(now.getTime() + i * 24 * 60 * 60 * 1000);
    const parts = getZonedParts(check, timezone);
    const dayNum = WEEKDAY_MAP[parts.weekday];
    if (dayNum === undefined || !targetDays.includes(dayNum)) continue;

    const spawn = buildSpawnDate(parts.year, parts.month, parts.day, time.hour, time.minute, timezone);
    if (spawn.getTime() > now.getTime()) return spawn;
  }

  return null;
}

function getNextRespawnSpawn(schedule: ScheduleWithBoss): Date | null {
  const respawnMinutes = schedule.boss_respawn_minutes;
  if (!schedule.last_kill_at || respawnMinutes <= 0) return null;
  const killAt = new Date(schedule.last_kill_at);
  return new Date(killAt.getTime() + respawnMinutes * 60 * 1000);
}

function getNextFixedSpawn(schedule: ScheduleWithBoss, now: Date): Date | null {
  if (!schedule.spawn_at) return null;
  const spawn = new Date(schedule.spawn_at);
  if (spawn.getTime() <= now.getTime()) return null;
  return spawn;
}

export function getNextSpawnTime(
  schedule: ScheduleWithBoss,
  now: Date,
  timezone: string,
): Date | null {
  switch (schedule.schedule_type) {
    case 'daily':
      return schedule.daily_time ? getNextDailySpawn(now, schedule.daily_time, timezone) : null;
    case 'weekly':
      return schedule.daily_time && schedule.weekly_days
        ? getNextWeeklySpawn(now, schedule.daily_time, schedule.weekly_days, timezone)
        : null;
    case 'respawn':
      return getNextRespawnSpawn(schedule);
    case 'fixed':
      return getNextFixedSpawn(schedule, now);
    default:
      return null;
  }
}

export function collectNotificationEvents(
  schedules: ScheduleWithBoss[],
  settings: Settings,
  now = new Date(),
): NotificationEvent[] {
  const events: NotificationEvent[] = [];

  for (const schedule of schedules) {
    if (!schedule.enabled) continue;

    const spawnAt = getNextSpawnTime(schedule, now, settings.timezone);
    if (!spawnAt) continue;

    const minutesUntil = minutesDiff(spawnAt, now);
    const notifyMinutes = parseNotifyMinutes(schedule.notify_minutes, settings.default_notify_minutes);

    if (minutesUntil === 0) {
      events.push({
        schedule,
        type: 'spawn',
        minutesUntil: 0,
        spawnAt,
        dedupeKey: formatDedupeKey(schedule.id, 'spawn', spawnAt, 0),
      });
      continue;
    }

    for (const warningMin of notifyMinutes) {
      if (warningMin > 0 && minutesUntil === warningMin) {
        events.push({
          schedule,
          type: 'warning',
          minutesUntil: warningMin,
          spawnAt,
          dedupeKey: formatDedupeKey(schedule.id, 'warning', spawnAt, warningMin),
        });
      }
    }
  }

  return events;
}

export function formatDateTime(date: Date, timezone: string): string {
  return new Intl.DateTimeFormat('ja-JP', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    weekday: 'short',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(date);
}

export function getScheduleLabel(schedule: ScheduleWithBoss, timezone: string): string {
  switch (schedule.schedule_type) {
    case 'daily':
      return `毎日 ${schedule.daily_time}`;
    case 'weekly': {
      const dayNames = ['日', '月', '火', '水', '木', '金', '土'];
      const days = (schedule.weekly_days ?? '')
        .split(',')
        .map((d) => dayNames[parseInt(d.trim(), 10)] ?? d)
        .join('・');
      return `毎週 ${days} ${schedule.daily_time}`;
    }
    case 'respawn':
      return `リスポン ${schedule.boss_respawn_minutes}分`;
    case 'fixed':
      return schedule.spawn_at
        ? `固定 ${formatDateTime(new Date(schedule.spawn_at), timezone)}`
        : '固定（未設定）';
    default:
      return schedule.schedule_type;
  }
}

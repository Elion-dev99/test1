export interface Env {
  DB: D1Database;
  ASSETS: Fetcher;
  DEFAULT_TIMEZONE: string;
}

export interface Settings {
  id: number;
  discord_webhook_url: string | null;
  timezone: string;
  default_notify_minutes: string;
  mention_role_id: string | null;
  mention_everyone: number;
  embed_color: string;
  updated_at: string;
}

export interface Boss {
  id: number;
  name: string;
  location: string | null;
  description: string | null;
  image_url: string | null;
  respawn_minutes: number;
  color: string;
  enabled: number;
  created_at: string;
  updated_at: string;
}

export type ScheduleType = 'daily' | 'weekly' | 'respawn' | 'fixed';

export interface Schedule {
  id: number;
  boss_id: number;
  schedule_type: ScheduleType;
  daily_time: string | null;
  weekly_days: string | null;
  spawn_at: string | null;
  last_kill_at: string | null;
  notify_minutes: string | null;
  enabled: number;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

export interface ScheduleWithBoss extends Schedule {
  boss_name: string;
  boss_location: string | null;
  boss_description: string | null;
  boss_image_url: string | null;
  boss_respawn_minutes: number;
  boss_color: string;
}

export interface NotificationEvent {
  schedule: ScheduleWithBoss;
  type: 'spawn' | 'warning';
  minutesUntil: number;
  spawnAt: Date;
  dedupeKey: string;
}

export interface ApiResponse<T = unknown> {
  success: boolean;
  data?: T;
  error?: string;
}

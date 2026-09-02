import type { NotificationEvent, Settings, ScheduleWithBoss } from './types';
import { formatDateTime, getScheduleLabel } from './scheduler';

function hexToDecimal(color: string): number {
  const hex = color.replace('#', '');
  const parsed = parseInt(hex, 16);
  return isNaN(parsed) ? 0xe74c3c : parsed;
}

function buildMention(settings: Settings): string {
  if (settings.mention_everyone) return '@everyone';
  if (settings.mention_role_id) return `<@&${settings.mention_role_id}>`;
  return '';
}

export async function sendDiscordNotification(
  webhookUrl: string,
  settings: Settings,
  event: NotificationEvent,
  customMessage?: string,
): Promise<{ ok: boolean; error?: string }> {
  const { schedule, type, minutesUntil, spawnAt } = event;
  const mention = buildMention(settings);
  const color = hexToDecimal(schedule.boss_color || settings.embed_color);
  const scheduleLabel = getScheduleLabel(schedule, settings.timezone);
  const spawnFormatted = formatDateTime(spawnAt, settings.timezone);

  let title: string;
  let description: string;

  if (customMessage) {
    title = `🔔 ${schedule.boss_name}`;
    description = customMessage;
  } else if (type === 'spawn') {
    title = `⚔️ ボス出現！ ${schedule.boss_name}`;
    description = `**${schedule.boss_name}** が出現しました！`;
  } else {
    title = `⏰ ボス出現予告 ${schedule.boss_name}`;
    description = `**${schedule.boss_name}** が **${minutesUntil}分後** に出現予定です。`;
  }

  const fields = [
    { name: '📍 出現場所', value: schedule.boss_location || '未設定', inline: true },
    { name: '🕐 出現予定', value: spawnFormatted, inline: true },
    { name: '📅 スケジュール', value: scheduleLabel, inline: true },
  ];

  if (schedule.boss_description) {
    fields.push({ name: '📝 詳細', value: schedule.boss_description, inline: false });
  }

  if (schedule.notes) {
    fields.push({ name: '💬 メモ', value: schedule.notes, inline: false });
  }

  const embed = {
    title,
    description,
    color,
    fields,
    image: schedule.boss_image_url ? { url: schedule.boss_image_url } : undefined,
    footer: { text: 'MMORPG Boss Notifier' },
    timestamp: new Date().toISOString(),
  };

  const content = mention ? `${mention}\n` : undefined;

  const response = await fetch(webhookUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      content,
      embeds: [embed],
      allowed_mentions: {
        parse: settings.mention_everyone ? ['everyone'] : [],
        roles: settings.mention_role_id ? [settings.mention_role_id] : [],
      },
    }),
  });

  if (!response.ok) {
    const text = await response.text();
    return { ok: false, error: `Discord API error: ${response.status} ${text}` };
  }

  return { ok: true };
}

export async function sendKillNotification(
  webhookUrl: string,
  settings: Settings,
  schedule: ScheduleWithBoss,
): Promise<{ ok: boolean; error?: string }> {
  const color = hexToDecimal(schedule.boss_color || settings.embed_color);
  const respawnText =
    schedule.boss_respawn_minutes > 0
      ? `${schedule.boss_respawn_minutes}分後`
      : 'スケジュールに従います';

  const embed = {
    title: `💀 ボス討伐 ${schedule.boss_name}`,
    description: `**${schedule.boss_name}** が討伐されました。次の出現: ${respawnText}`,
    color,
    fields: [
      { name: '📍 場所', value: schedule.boss_location || '未設定', inline: true },
      {
        name: '🕐 討伐時刻',
        value: formatDateTime(new Date(), settings.timezone),
        inline: true,
      },
    ],
    footer: { text: 'MMORPG Boss Notifier' },
    timestamp: new Date().toISOString(),
  };

  const response = await fetch(webhookUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ embeds: [embed] }),
  });

  if (!response.ok) {
    const text = await response.text();
    return { ok: false, error: `Discord API error: ${response.status} ${text}` };
  }

  return { ok: true };
}

export async function sendTestNotification(
  webhookUrl: string,
  settings: Settings,
): Promise<{ ok: boolean; error?: string }> {
  const embed = {
    title: '✅ 接続テスト成功',
    description: 'MMORPG Boss Notifier の Discord 通知が正常に動作しています。',
    color: hexToDecimal('#2ECC71'),
    fields: [
      { name: '🌏 タイムゾーン', value: settings.timezone, inline: true },
      {
        name: '⏰ テスト時刻',
        value: formatDateTime(new Date(), settings.timezone),
        inline: true,
      },
    ],
    footer: { text: 'MMORPG Boss Notifier' },
    timestamp: new Date().toISOString(),
  };

  const response = await fetch(webhookUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ embeds: [embed] }),
  });

  if (!response.ok) {
    const text = await response.text();
    return { ok: false, error: `Discord API error: ${response.status} ${text}` };
  }

  return { ok: true };
}

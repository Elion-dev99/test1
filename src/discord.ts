import type { NotificationEvent, Settings } from './types';
import { formatDateTime, getScheduleLabel } from './scheduler';

function hexToDecimal(color: string): number {
  const hex = color.replace('#', '');
  const parsed = parseInt(hex, 16);
  return isNaN(parsed) ? 0xe74c3c : parsed;
}

function buildMentionContent(settings: Settings): string | undefined {
  if (settings.mention_everyone) return '@everyone';
  if (settings.mention_role_id) return `<@&${settings.mention_role_id}>`;
  return undefined;
}

function buildAllowedMentions(settings: Settings) {
  const allowed: { parse?: string[]; roles?: string[] } = {};
  if (settings.mention_everyone) {
    allowed.parse = ['everyone'];
  }
  if (settings.mention_role_id) {
    allowed.roles = [settings.mention_role_id];
  }
  return allowed;
}

async function postWebhook(
  webhookUrl: string,
  settings: Settings,
  payload: { content?: string; embeds: object[] },
): Promise<{ ok: boolean; error?: string }> {
  const mention = buildMentionContent(settings);
  const content = mention ? `${mention}\n${payload.content ?? ''}`.trim() : payload.content;

  const response = await fetch(webhookUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      content: content || undefined,
      embeds: payload.embeds,
      allowed_mentions: buildAllowedMentions(settings),
    }),
  });

  if (!response.ok) {
    const text = await response.text();
    return { ok: false, error: `Discord API error: ${response.status} ${text}` };
  }

  return { ok: true };
}

export async function sendDiscordNotification(
  webhookUrl: string,
  settings: Settings,
  event: NotificationEvent,
  customMessage?: string,
): Promise<{ ok: boolean; error?: string }> {
  const { schedule, type, minutesUntil, spawnAt } = event;
  const color = hexToDecimal(schedule.boss_color || settings.embed_color);
  const scheduleLabel = getScheduleLabel(schedule, settings.timezone);
  const spawnFormatted = formatDateTime(spawnAt, settings.timezone);

  const locationText = schedule.boss_location || '未設定（ゲーム内ボス情報→マップで確認）';
  const moveHint = '左メニュー「ボス」→マップアイコン→クイック移動';

  let title: string;
  let description: string;

  if (customMessage) {
    title = `🔔 ${schedule.boss_name}`;
    description = `${customMessage}\n\n📍 **出現場所:** ${locationText}`;
  } else if (type === 'spawn') {
    title = `⚔️ ボス出現！ ${schedule.boss_name}`;
    description = `**${schedule.boss_name}** が出現しました！\n\n📍 **出現場所:** ${locationText}`;
  } else {
    title = `⏰ ボス出現予告 ${schedule.boss_name}`;
    description = `**${schedule.boss_name}** が **${minutesUntil}分後** に出現予定です。\n\n📍 **出現場所:** ${locationText}`;
  }

  const fields = [
    { name: '📍 出現場所', value: locationText, inline: false },
    { name: '🕐 出現予定', value: spawnFormatted, inline: true },
    { name: '📅 スケジュール', value: scheduleLabel, inline: true },
    { name: '🗺️ 移動方法', value: moveHint, inline: false },
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

  return postWebhook(webhookUrl, settings, { embeds: [embed] });
}

async function validateWebhookUrl(webhookUrl: string): Promise<{ ok: boolean; error?: string }> {
  const pattern = /^https:\/\/(discord\.com|discordapp\.com)\/api\/webhooks\/\d+\/[\w-]+$/;
  if (!pattern.test(webhookUrl)) {
    return { ok: false, error: 'Discord Webhook URL の形式が正しくありません' };
  }

  const response = await fetch(webhookUrl, { method: 'GET' });
  if (!response.ok) {
    const text = await response.text();
    return { ok: false, error: `Webhook に接続できません: ${response.status} ${text}` };
  }

  return { ok: true };
}

export { validateWebhookUrl };

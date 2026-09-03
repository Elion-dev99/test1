/** Free-form item stat text → DB columns + generic entries. */

export type StatEntry = { label: string; value: string | number };

export type ParsedStats = {
  attack: number | null;
  defense: number | null;
  accuracy: number | null;
  crit_rate: number | null;
  hp: number | null;
  mp: number | null;
  entries: StatEntry[];
  /** Scalar attrs for extra_json (known + unknown labels). */
  attrs: Record<string, string | number>;
  raw: string;
};

/** Canonical DB column keys. */
const COLUMN_ALIASES: Record<string, keyof Pick<ParsedStats, 'attack' | 'defense' | 'accuracy' | 'crit_rate' | 'hp' | 'mp'>> = {
  攻撃: 'attack',
  攻撃力: 'attack',
  武器攻撃: 'attack',
  武器攻撃力: 'attack',
  物理攻撃: 'attack',
  物理攻撃力: 'attack',
  attack: 'attack',
  atk: 'attack',
  防御: 'defense',
  防御力: 'defense',
  defense: 'defense',
  def: 'defense',
  命中: 'accuracy',
  命中力: 'accuracy',
  命中率: 'accuracy',
  accuracy: 'accuracy',
  hit: 'accuracy',
  クリティカル: 'crit_rate',
  クリ率: 'crit_rate',
  クリティカル率: 'crit_rate',
  crit: 'crit_rate',
  crit_rate: 'crit_rate',
  hp: 'hp',
  HP: 'hp',
  体力: 'hp',
  mp: 'mp',
  MP: 'mp',
  魔力: 'mp',
};

/** Well-known extra keys (kept for display / seed compatibility). */
const EXTRA_ALIASES: Record<string, string> = {
  回避: 'evasion',
  回避力: 'evasion',
  回避率: 'evasion',
  evasion: 'evasion',
  eva: 'evasion',
  魔法攻撃: 'magic_attack',
  魔法攻撃力: 'magic_attack',
  スキルダメージ: 'skill_damage',
  スキルダメ: 'skill_damage',
  通常モンスターダメージ: 'normal_monster_damage',
  クリティカルダメージ: 'crit_damage',
  クリダメ: 'crit_damage',
  pvp攻撃: 'pvp_attack',
  pvp攻撃力: 'pvp_attack',
  PvP攻撃: 'pvp_attack',
  PvP攻撃力: 'pvp_attack',
  重量: 'weight',
  weight: 'weight',
  クラス: 'class',
  class: 'class',
  武器種: 'weapon_type',
  武器タイプ: 'weapon_type',
  tier: 'tier',
  Tier: 'tier',
};

function normalizeLabel(label: string): string {
  return label
    .normalize('NFKC')
    .replace(/[：:]/g, '')
    .replace(/\s+/g, '')
    .trim();
}

function parseValue(raw: string): string | number {
  const t = raw.normalize('NFKC').replace(/,/g, '').trim();
  if (/^[+\-]?(\d+\.?\d*|\.\d+)%$/.test(t)) return t; // keep percent as string
  const n = Number(t.replace(/^[＋+]/, '+').replace(/^[－]/, '-'));
  if (Number.isFinite(n) && /[+\-]?\d/.test(t)) return n;
  return t;
}

/**
 * Parse lines like:
 *   攻撃力 120
 *   命中+15
 *   スキルダメージ: 8%
 *   クラス ヴァイパー
 */
export function parseStatsText(text: string | null | undefined): ParsedStats | null {
  if (!text || !String(text).trim()) return null;
  const raw = String(text).replace(/\r\n/g, '\n').trim();
  const entries: StatEntry[] = [];
  const attrs: Record<string, string | number> = {};
  const columns: ParsedStats = {
    attack: null,
    defense: null,
    accuracy: null,
    crit_rate: null,
    hp: null,
    mp: null,
    entries,
    attrs,
    raw,
  };

  for (const line of raw.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;

    // "ラベル+12" / "ラベル：12" / "ラベル 12" / "ラベル -3"
    const m =
      trimmed.match(/^(.+?)\s*[:：]\s*(.+)$/) ||
      trimmed.match(/^(.+?)\s*([+\-＋－]\s*[\d.]+%?)\s*$/) ||
      trimmed.match(/^(.+?)\s+(.+)$/);
    if (!m) {
      entries.push({ label: trimmed, value: '' });
      continue;
    }

    let label = m[1].trim();
    let valueRaw = m[2].trim().replace(/^[＋]/, '+').replace(/^[－]/, '-');
    // "攻撃力+15" split may leave + on value already
    if (/[+\-]$/.test(label) && !/^[+\-]/.test(valueRaw)) {
      valueRaw = label.slice(-1) + valueRaw;
      label = label.slice(0, -1).trim();
    }

    const value = parseValue(valueRaw);
    entries.push({ label, value });

    const key = normalizeLabel(label);
    const col = COLUMN_ALIASES[key] || COLUMN_ALIASES[label];
    if (col && typeof value === 'number') {
      columns[col] = value;
      continue;
    }
    const extraKey = EXTRA_ALIASES[key] || EXTRA_ALIASES[label] || key;
    attrs[extraKey] = value;
  }

  return columns;
}

export function statsExtraJson(parsed: ParsedStats, previousExtra?: Record<string, unknown> | null): string {
  const base: Record<string, unknown> = { ...(previousExtra || {}) };
  // Preserve enhance metadata when updating
  Object.assign(base, parsed.attrs);
  base.stats_text = parsed.raw;
  base.stat_entries = parsed.entries;
  return JSON.stringify(base);
}

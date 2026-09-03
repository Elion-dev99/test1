export interface Env {
  DB: D1Database;
  ASSETS: Fetcher;
  GAME_NAME: string;
  GAME_VERSION?: string;
}

export type ItemCategory =
  | 'equipment'
  | 'skillbook'
  | 'collection'
  | 'material'
  | 'consumable'
  | 'other';

export type ItemRarity = 'common' | 'uncommon' | 'rare' | 'heroic' | 'legendary';

export type BossType = 'world' | 'gehenna' | 'event' | 'other';

export interface Item {
  id: number;
  name: string;
  name_key: string;
  category: ItemCategory;
  rarity: ItemRarity;
  slot: string | null;
  tradeable: number;
  stackable: number;
  description: string | null;
  icon_url: string | null;
  verified: number;
  source_url: string | null;
  game_version: string | null;
  created_at: string;
  updated_at: string;
}

export interface GameVersion {
  id: number;
  version_key: string;
  label: string;
  released_at: string | null;
  notes: string | null;
  is_current: number;
  created_at: string;
}

export interface ItemVariant {
  id: number;
  item_id: number;
  enhance_level: number;
  blessed: number;
  option_summary: string | null;
  created_at: string;
}

export interface MarketSnapshot {
  id: number;
  variant_id: number;
  min_price: number | null;
  listing_count: number;
  stock_qty: number;
  traded_28d: number;
  min_trade_price: number | null;
  note: string | null;
  captured_at: string;
  captured_by: string | null;
}

export interface Boss {
  id: number;
  name: string;
  name_key: string;
  boss_type: BossType;
  location: string | null;
  notes: string | null;
  external_boss_id: number | null;
  created_at: string;
}

export interface Drop {
  id: number;
  item_id: number;
  boss_id: number | null;
  boss_name: string;
  drop_note: string | null;
  verified: number;
  created_at: string;
}

export interface Source {
  id: number;
  item_id: number;
  source_type: string;
  label: string;
  ref_note: string | null;
  created_at: string;
}

export interface ApiResponse<T = unknown> {
  success: boolean;
  data?: T;
  error?: string;
}

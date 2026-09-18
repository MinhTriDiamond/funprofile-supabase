export type BoxTier = 'common' | 'rare' | 'epic' | 'legendary' | 'cosmic';
export type BoxSource =
  | 'daily_login' | 'quest_complete' | 'streak_7d' | 'streak_30d'
  | 'gift_sent' | 'invite_t1' | 'premium_purchase' | 'event';
export type BoxRewardType = 'ls' | 'camly' | 'pet_xp' | 'pet_skin' | 'cosmetic' | 'sbt_trigger' | 'box_upgrade';

export interface BoxDefinition {
  id: string;
  code: string;
  name_vi: string;
  name_en: string;
  tier: BoxTier;
  source_type: BoxSource;
  cost_camly: number | null;
  drop_table: Array<{
    reward_code: string;
    pct: number;
    type: BoxRewardType;
    value_int: number;
    rarity?: string;
    metadata?: Record<string, unknown>;
  }>;
  icon: string | null;
  pity_threshold: number;
  is_active: boolean;
}

export interface BoxInventoryItem {
  id: string;
  user_id: string;
  box_def_id: string;
  source_event: BoxSource;
  source_ref_id: string | null;
  opened_at: string | null;
  reward_jsonb: BoxRewardPayload | null;
  pity_counter: number;
  locked: boolean;
  created_at: string;
  definition?: BoxDefinition;
}

export interface BoxRewardPayload {
  reward_code: string;
  type: BoxRewardType;
  value_int: number;
  metadata: Record<string, unknown>;
  rarity: string;
  tier: BoxTier;
}

export const TIER_COLORS: Record<BoxTier, { bg: string; ring: string; text: string; glow: string }> = {
  common:    { bg: 'from-cyan-300 via-sky-400 to-emerald-400',       ring: 'ring-cyan-200',   text: 'text-white', glow: 'shadow-cyan-400/70' },
  rare:      { bg: 'from-sky-300 via-blue-400 to-indigo-500',         ring: 'ring-sky-200',    text: 'text-white', glow: 'shadow-sky-400/80' },
  epic:      { bg: 'from-fuchsia-400 via-purple-500 to-violet-600',   ring: 'ring-fuchsia-200',text: 'text-white', glow: 'shadow-fuchsia-500/80' },
  legendary: { bg: 'from-yellow-300 via-amber-400 to-orange-500',     ring: 'ring-yellow-200', text: 'text-white', glow: 'shadow-amber-400/90' },
  cosmic:    { bg: 'from-pink-400 via-fuchsia-400 via-purple-400 to-cyan-300', ring: 'ring-pink-200', text: 'text-white', glow: 'shadow-pink-400/90' },
};

export const TIER_LABEL_VI: Record<BoxTier, string> = {
  common: 'Phổ Thông',
  rare: 'Hiếm',
  epic: 'Sử Thi',
  legendary: 'Huyền Thoại',
  cosmic: 'Vũ Trụ',
};

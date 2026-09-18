/**
 * Nhãn Trust Tier dùng chung cho mọi panel Founder Dashboard.
 * Đồng bộ giữa Identity Panel (T0-T4) và User Insights (tier 0-4 trong light_reputation).
 *
 * Theo Identity+Trust Layer v1.0:
 *  T0 = Mới (chưa có TC), T1 = Tìm Kiếm, T2 = Kiến Tạo, T3 = Hộ Vệ, T4 = Toả Sáng.
 *  light_reputation.tier 0..3 map vào T1..T4 (T0 không hiển thị trong reputation).
 */
export const TIER_KEYS = ['T0', 'T1', 'T2', 'T3', 'T4'] as const;
export type TierKey = (typeof TIER_KEYS)[number];

export const TIER_LABEL_VI: Record<TierKey, string> = {
  T0: 'Mới',
  T1: 'Tìm Kiếm',
  T2: 'Kiến Tạo',
  T3: 'Hộ Vệ',
  T4: 'Toả Sáng',
};

export const TIER_COLOR: Record<TierKey, string> = {
  T0: 'bg-muted text-muted-foreground',
  T1: 'bg-blue-500/15 text-blue-600 dark:text-blue-400',
  T2: 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400',
  T3: 'bg-purple-500/15 text-purple-600 dark:text-purple-400',
  T4: 'bg-amber-500/15 text-amber-600 dark:text-amber-400',
};

/** light_reputation.tier (int 0..3) → TierKey hiển thị thống nhất */
export function reputationTierToKey(tier: number): TierKey {
  if (tier <= 0) return 'T1';
  if (tier === 1) return 'T2';
  if (tier === 2) return 'T3';
  return 'T4';
}

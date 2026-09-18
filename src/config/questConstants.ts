export const QUEST_LS_DAILY_CAP = 200;
export const QUEST_LS_PERCENT_CAP = 0.25;

export const STREAK_MULTIPLIERS: Array<{ days: number; mul: number; label: string }> = [
  { days: 30, mul: 1.25, label: 'Đại định 30 ngày' },
  { days: 14, mul: 1.15, label: 'Vững tâm 14 ngày' },
  { days: 7, mul: 1.10, label: 'Tinh tấn 7 ngày' },
  { days: 3, mul: 1.05, label: 'Khởi tâm 3 ngày' },
];

export function getStreakMultiplier(streak: number): number {
  for (const tier of STREAK_MULTIPLIERS) if (streak >= tier.days) return tier.mul;
  return 1.0;
}

export const QUEST_SBT_LABELS: Record<string, string> = {
  quest_first_light: 'First Light',
  quest_pilgrim_7d: '7-Day Pilgrim',
  quest_devotee_30d: '30-Day Devotee',
  quest_founding: 'Founding Quester',
  quest_light_bringer: 'Light Bringer',
};

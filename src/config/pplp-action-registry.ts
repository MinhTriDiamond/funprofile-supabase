// =============================================
// PPLP On-Chain Action Registry — Frontend mirror
// Đồng bộ với supabase/functions/_shared/pplp-action-registry.ts
// =============================================

export const ON_CHAIN_ACTIONS = [
  'INNER_WORK',
  'CHANNELING',
  'GIVING',
  'HELPING',
  'GRATITUDE',
  'SERVICE',
] as const;

export type OnChainAction = typeof ON_CHAIN_ACTIONS[number];

/** Pillar (trụ cột PPLP) tương ứng với từng on-chain action. */
export const ACTION_PILLAR: Record<OnChainAction, string> = {
  INNER_WORK: 'Sám Hối',
  CHANNELING: 'Biết Ơn',
  GIVING: 'Trao Tặng',
  HELPING: 'Giúp Đỡ',
  GRATITUDE: 'Biết Ơn',
  SERVICE: 'Phụng Sự',
};

/** Mô tả hiển thị cho user. */
export const ACTION_DESCRIPTION: Record<OnChainAction, string> = {
  INNER_WORK: 'Nội tâm: viết nhật ký, thực hành biết ơn',
  CHANNELING: 'Sáng tạo: tầm nhìn, bài đăng, livestream',
  GIVING: 'Trao tặng: gửi quà FUN / CAMLY / BTC',
  HELPING: 'Giúp đỡ: bình luận hỗ trợ, hỏi-đáp, mentor',
  GRATITUDE: 'Biết ơn: reaction tích cực với người khác',
  SERVICE: 'Phụng sự: chia sẻ, kết bạn, giới thiệu thành viên mới',
};

export const ACTION_TYPE_MAP: Record<string, OnChainAction> = {
  journal_write: 'INNER_WORK',
  gratitude_practice: 'INNER_WORK',
  vision_create: 'CHANNELING',
  post_create: 'CHANNELING',
  post: 'CHANNELING',
  livestream: 'CHANNELING',
  donate_support: 'GIVING',
  comment_create: 'HELPING',
  comment: 'HELPING',
  question_ask: 'HELPING',
  reaction: 'GRATITUDE',
  share: 'SERVICE',
  friend: 'SERVICE',
  new_user_bonus: 'SERVICE',
};

export const FALLBACK_ACTION: OnChainAction = 'INNER_WORK';
export const LEGACY_ACTION = 'FUN_REWARD';

/** Cap on-chain mỗi action: 1M FUN/day. */
export const ON_CHAIN_DAILY_CAP_PER_ACTION = 1_000_000;

/** Trần lý thuyết tháng = 6 × 1M × 30. */
export const THEORETICAL_MONTHLY_CEILING =
  ON_CHAIN_ACTIONS.length * ON_CHAIN_DAILY_CAP_PER_ACTION * 30;

export function pickOnChainAction(actionTypes: string[]): OnChainAction {
  if (!actionTypes?.length) return FALLBACK_ACTION;
  const counter = new Map<OnChainAction, number>();
  for (const t of actionTypes) {
    const mapped = ACTION_TYPE_MAP[t];
    if (mapped) counter.set(mapped, (counter.get(mapped) ?? 0) + 1);
  }
  if (counter.size === 0) return FALLBACK_ACTION;
  let best: OnChainAction = FALLBACK_ACTION;
  let bestCount = -1;
  for (const [action, count] of counter.entries()) {
    if (count > bestCount) {
      best = action;
      bestCount = count;
    }
  }
  return best;
}

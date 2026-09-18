// =============================================
// PPLP On-Chain Action Registry
// 6 actions registered on FUN Money contract v1.2.1 (BSC Testnet)
// Contract: 0x39A1b047D5d143f8874888cfa1d30Fb2AE6F0CD6
// =============================================
import { keccak256, toBytes } from "npm:viem@^2.38.0";

/**
 * 6 actions on-chain đã được đăng ký bởi guardianGov (bé Trí)
 * vào ngày 21/04/2026. Mỗi action có cap riêng = 1M FUN/day,
 * tổng trần lý thuyết = 6 × 1M × 30 = 180M FUN/tháng.
 */
export const ON_CHAIN_ACTIONS = [
  'INNER_WORK',   // Sám Hối — journal, gratitude practice
  'CHANNELING',   // Biết Ơn — vision, post sáng tạo, livestream
  'GIVING',       // Trao Tặng — donate, gift FUN/CAMLY/BTC
  'HELPING',      // Giúp Đỡ — comment hỗ trợ, mentor, hỏi-đáp
  'GRATITUDE',    // Biết Ơn — reaction tích cực
  'SERVICE',      // Phụng Sự — share, friend, new user bonus
] as const;

export type OnChainAction = typeof ON_CHAIN_ACTIONS[number];

/**
 * Mapping 14 action_type thực tế trong DB → 6 on-chain actions.
 * Source: SELECT action_type, COUNT(*) FROM light_actions GROUP BY 1.
 */
export const ACTION_TYPE_MAP: Record<string, OnChainAction> = {
  // INNER_WORK — Sám Hối / nội tâm
  journal_write: 'INNER_WORK',
  gratitude_practice: 'INNER_WORK',

  // CHANNELING — Sáng tạo / truyền tải
  vision_create: 'CHANNELING',
  post_create: 'CHANNELING',
  post: 'CHANNELING',
  livestream: 'CHANNELING',

  // GIVING — Trao tặng tài sản
  donate_support: 'GIVING',

  // HELPING — Hỗ trợ người khác
  comment_create: 'HELPING',
  comment: 'HELPING',
  question_ask: 'HELPING',

  // GRATITUDE — Cảm xúc tích cực
  reaction: 'GRATITUDE',

  // SERVICE — Phụng sự cộng đồng
  share: 'SERVICE',
  friend: 'SERVICE',
  new_user_bonus: 'SERVICE',
};

/**
 * Fallback action khi không nhận diện được action_type.
 * INNER_WORK an toàn nhất vì khối lượng giao dịch thấp nhất.
 */
export const FALLBACK_ACTION: OnChainAction = 'INNER_WORK';

/**
 * Legacy action — vẫn hoạt động trên contract nhưng đã deprecated.
 * Giữ làm fallback cuối cùng nếu 6 action mới fail vì lý do nào đó.
 */
export const LEGACY_ACTION = 'FUN_REWARD';

/**
 * Chọn on-chain action phù hợp dựa vào danh sách action_type.
 * Quy tắc: chọn action chiếm tỉ trọng cao nhất.
 * Nếu không có hoặc không match → trả FALLBACK_ACTION.
 */
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

/**
 * Group action_types theo on-chain action.
 * Dùng cho auto-split: mỗi nhóm thành 1 mint request con.
 */
export function groupByOnChainAction<T extends { action_type?: string | null }>(
  records: T[],
): Map<OnChainAction, T[]> {
  const groups = new Map<OnChainAction, T[]>();
  for (const r of records) {
    const t = r.action_type ?? '';
    const action = ACTION_TYPE_MAP[t] ?? FALLBACK_ACTION;
    if (!groups.has(action)) groups.set(action, []);
    groups.get(action)!.push(r);
  }
  return groups;
}

/**
 * Compute keccak256 hash of action name — phải khớp với contract:
 *   keccak256(bytes(action))
 */
export function actionHash(name: string): string {
  return keccak256(toBytes(name));
}

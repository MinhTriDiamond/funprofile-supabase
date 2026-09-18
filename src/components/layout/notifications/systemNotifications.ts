/**
 * Nguồn duy nhất cho:
 *  - Danh sách loại thông báo dùng avatar hệ thống (FUN.RICH) / cảnh báo gian lận
 *  - Nội dung (tiêu đề + mô tả) cho các loại thông báo hệ thống
 *  - Bảng định tuyến khi bấm vào thông báo
 *
 * Trước đây các hằng số này bị khai báo trùng ở NotificationDropdown.tsx và
 * pages/Notifications.tsx (lệch nhau) và ~25 loại thông báo không có nội dung
 * nên rơi vào fallback "đã tương tác với bạn".
 */

export const FRAUD_TYPES = [
  'admin_shared_device',
  'admin_email_farm',
  'admin_blacklisted_ip',
  'admin_fraud_daily',
] as const;

export const PET_NOTIFICATION_TYPES = [
  'pet_cheer_received',
  'pet_evolved',
  'pet_cosmetic_received',
  'pet_xp_granted',
  'pet_shop_purchased',
  'pet_shop_failed',
  'pet_battle_challenge',
  'pet_battle_result',
  'pet_lumi_ready',
  'buddy_invite',
] as const;

export const MYSTERY_BOX_TYPES = [
  'mystery_box_received',
  'mystery_box_legendary',
  'mystery_box_expiring',
  'mystery_box_expired',
] as const;

export const QUEST_TYPES = ['quest_completed', 'streak_milestone', 'sbt_issued_quest'] as const;

export const IDENTITY_TYPES = [
  'did_promoted',
  'sbt_issued',
  'dispute_resolved',
  'recovery_initiated',
  'guardian_invited',
  'guardian_accepted',
  'guardian_declined',
  'attestation_received',
] as const;

export const ADMIN_OPS_TYPES = [
  'treasury_low_gas',
  'treasury_low_camly',
  'treasury_ledger_drift',
  'wallet_reconciliation_alert',
] as const;

/** Loại hiển thị avatar logo FUN.RICH thay cho avatar người dùng */
export const SYSTEM_TYPES = [
  'epoch_claim_ready',
  'epoch_reset_info',
  'btc_address_cleared',
  'reward_adjustment',
  'reward_approved',
  'reward_rejected',
  'claim_reward',
  'account_banned',
  'account_unbanned',
  'link_wallet_reminder',
  'mint_request_rejected',
  'fun_mint_signed',
  'fun_mint_confirmed',
  ...QUEST_TYPES,
  ...MYSTERY_BOX_TYPES,
  ...ADMIN_OPS_TYPES,
  'live_auto_ended',
  'live_reconnected',
  'live_recording_missed',
  'live_recording_failed',
  'live_replay_failed',
  'live_replay_expiring',
  'live_replay_expired',
] as const;

type Meta = Record<string, unknown> | null | undefined;

const num = (v: unknown, fallback = 0): number =>
  v == null || Number.isNaN(Number(v)) ? fallback : Number(v);
const vn = (v: unknown): string => num(v).toLocaleString('vi-VN');
const str = (v: unknown): string => (typeof v === 'string' ? v : '');

export interface SystemNotifText {
  title: string;
  desc: string;
  tone?: 'default' | 'success' | 'warning' | 'danger' | 'info';
}

/**
 * Nội dung cho các loại thông báo hệ thống (tiếng Việt — nhất quán với các case
 * mint/live đã có sẵn trong utils.ts).
 */
export const SYSTEM_NOTIF_TEXT: Record<string, (m: Meta) => SystemNotifText> = {
  // ─── Ví BTC ───
  btc_address_cleared: () => ({
    tone: 'warning',
    title: '₿ Địa chỉ BTC đã được xoá',
    desc: 'Địa chỉ Bitcoin bạn khai trước đây không hợp lệ nên đã được xoá để tránh mất tiền. Vui lòng khai lại địa chỉ BTC chính xác trong phần Chỉnh sửa trang cá nhân.',
  }),
  // ─── Nhiệm vụ / chuỗi ngày ───
  quest_completed: (m) => ({
    tone: 'success',
    title: '🎯 Hoàn thành nhiệm vụ',
    desc: `Bạn đã hoàn thành nhiệm vụ${str(m?.quest_title) ? ` "${str(m?.quest_title)}"` : ''}${
      num(m?.ls_reward) ? ` và nhận +${vn(m?.ls_reward)} Light Score` : ''
    }.`,
  }),
  streak_milestone: (m) => ({
    tone: 'success',
    title: '🔥 Cột mốc chuỗi ngày',
    desc: `Bạn đã duy trì chuỗi ${vn(m?.streak_days ?? m?.days ?? 0)} ngày liên tiếp. Tiếp tục giữ nhịp nhé!`,
  }),
  sbt_issued_quest: (m) => ({
    tone: 'success',
    title: '🏅 Nhận huy hiệu từ nhiệm vụ',
    desc: `Bạn được cấp huy hiệu${str(m?.sbt_type) ? ` ${str(m?.sbt_type)}` : ''} sau khi hoàn thành nhiệm vụ.`,
  }),

  // ─── Hộp bí ẩn ───
  mystery_box_received: (m) => ({
    tone: 'info',
    title: '🎁 Bạn nhận được hộp bí ẩn',
    desc: `Một hộp ${str(m?.tier) || 'bí ẩn'} đã vào kho của bạn. Mở ngay để nhận thưởng.`,
  }),
  mystery_box_legendary: (m) => ({
    tone: 'success',
    title: '🌟 Hộp huyền thoại!',
    desc: `Bạn vừa mở được phần thưởng hiếm${str(m?.reward_label) ? `: ${str(m?.reward_label)}` : ''}.`,
  }),
  mystery_box_expiring: (m) => ({
    tone: 'warning',
    title: '⏰ Hộp bí ẩn sắp hết hạn',
    desc: `Bạn còn ${vn(m?.count ?? 1)} hộp chưa mở sẽ hết hạn sớm. Mở trước khi mất nhé.`,
  }),
  mystery_box_expired: (m) => ({
    title: '🗑️ Hộp bí ẩn đã hết hạn',
    desc: `${vn(m?.count ?? 1)} hộp chưa mở đã hết hạn và bị thu hồi.`,
  }),

  // ─── Linh thú Lumi ───
  pet_evolved: (m) => ({
    tone: 'success',
    title: '✨ Lumi đã tiến hoá',
    desc: `Lumi của bạn đã tiến hoá${str(m?.stage) ? ` lên giai đoạn ${str(m?.stage)}` : ''}. Vào xem hình dáng mới!`,
  }),
  pet_cheer_received: (m) => ({
    tone: 'info',
    title: '👏 Lumi được cổ vũ',
    desc: `Có người vừa cổ vũ Lumi của bạn${num(m?.xp) ? `, +${vn(m?.xp)} XP` : ''}.`,
  }),
  pet_cosmetic_received: (m) => ({
    tone: 'info',
    title: '🎀 Nhận phụ kiện cho Lumi',
    desc: `Bạn nhận được phụ kiện${str(m?.item_name) ? ` "${str(m?.item_name)}"` : ''} cho Lumi.`,
  }),
  pet_xp_granted: (m) => ({
    tone: 'info',
    title: '⚡ Lumi nhận XP',
    desc: `Lumi của bạn được cộng ${vn(m?.xp ?? m?.amount)} XP.`,
  }),
  pet_shop_purchased: (m) => ({
    tone: 'success',
    title: '🛍️ Mua phụ kiện thành công',
    desc: `Đơn hàng${str(m?.item_name) ? ` "${str(m?.item_name)}"` : ''} đã được xác nhận on-chain.`,
  }),
  pet_shop_failed: () => ({
    tone: 'danger',
    title: '⛔ Mua phụ kiện thất bại',
    desc: 'Giao dịch không được xác nhận. Số CAMLY (nếu đã trừ) sẽ được đối soát lại.',
  }),
  pet_battle_challenge: () => ({
    tone: 'info',
    title: '⚔️ Có lời thách đấu',
    desc: 'Lumi của bạn vừa bị thách đấu tại Đấu trường. Vào nhận trận nhé.',
  }),
  pet_battle_result: (m) => ({
    tone: 'info',
    title: '🏆 Kết quả đấu trường',
    desc: `Trận đấu đã kết thúc${str(m?.result) ? `: ${str(m?.result)}` : ''}. Xem chi tiết tại Đấu trường.`,
  }),
  pet_lumi_ready: () => ({
    tone: 'success',
    title: '🐣 Lumi của bạn đã sẵn sàng',
    desc: 'Linh thú Lumi đã được tạo cho bạn. Vào chăm sóc để nhận Light Score mỗi ngày.',
  }),
  buddy_invite: () => ({
    tone: 'info',
    title: '🤝 Lời mời vào Buddy Circle',
    desc: 'Bạn được mời tham gia một vòng bạn đồng hành. Bấm để xem lời mời.',
  }),

  // ─── Identity ───
  guardian_accepted: () => ({
    tone: 'success',
    title: '🛡️ Guardian đã đồng ý',
    desc: 'Một người bảo hộ đã chấp nhận lời mời guardian của bạn.',
  }),
  guardian_declined: () => ({
    tone: 'warning',
    title: '🛡️ Guardian đã từ chối',
    desc: 'Một người bảo hộ đã từ chối lời mời. Hãy mời người khác để đủ điều kiện phục hồi.',
  }),
  attestation_received: () => ({
    tone: 'success',
    title: '✍️ Nhận chứng thực mới',
    desc: 'Có người vừa chứng thực cho danh tính của bạn, điểm Trust sẽ được tính lại.',
  }),

  // ─── Live (vận hành) ───
  live_auto_ended: (m) => ({
    tone: 'warning',
    title: '⏹️ Phiên live đã tự kết thúc',
    desc: `Phiên live của bạn được hệ thống kết thúc tự động${str(m?.reason) ? ` (${str(m?.reason)})` : ''}.`,
  }),
  live_reconnected: () => ({
    tone: 'info',
    title: '🔄 Phiên live đã kết nối lại',
    desc: 'Tín hiệu phát đã được phục hồi, phiên live tiếp tục bình thường.',
  }),
  live_recording_missed: () => ({
    tone: 'warning',
    title: '⚠️ Không ghi được bản lưu live',
    desc: 'Hệ thống không bắt được bản ghi cho phiên live này nên sẽ không có video phát lại.',
  }),
  live_recording_failed: () => ({
    tone: 'danger',
    title: '⛔ Ghi hình live thất bại',
    desc: 'Quá trình ghi hình gặp lỗi. Bài đăng vẫn còn nhưng không có video phát lại.',
  }),
  live_replay_failed: () => ({
    tone: 'danger',
    title: '⛔ Xử lý video phát lại thất bại',
    desc: 'Video phát lại không xử lý được. Kỹ thuật đã nhận thông tin để kiểm tra.',
  }),

  // ─── Tài khoản ───
  account_unbanned: () => ({
    tone: 'success',
    title: '✅ Tài khoản đã được mở lại',
    desc: 'Hạn chế trên tài khoản của bạn đã được gỡ. Bạn có thể sử dụng bình thường.',
  }),
  link_wallet_reminder: () => ({
    tone: 'info',
    title: '🔗 Hãy liên kết ví của bạn',
    desc: 'Liên kết ví để nhận phần thưởng FUN/CAMLY vào đúng địa chỉ của bạn.',
  }),

  // ─── Vận hành / Admin ───
  treasury_low_gas: (m) => ({
    tone: 'warning',
    title: '⛽ Ví treasury sắp hết gas',
    desc: `Số dư BNB còn ${str(m?.balance) || vn(m?.balance_bnb)} — hãy nạp thêm để không nghẽn giao dịch.`,
  }),
  treasury_low_camly: (m) => ({
    tone: 'warning',
    title: '💰 Treasury sắp hết CAMLY',
    desc: `Số dư CAMLY còn ${str(m?.balance) || vn(m?.balance_camly)} — cần bổ sung cho việc trả thưởng.`,
  }),
  treasury_ledger_drift: () => ({
    tone: 'danger',
    title: '⚠️ Lệch sổ treasury',
    desc: 'Phát hiện chênh lệch giữa sổ nội bộ và số dư on-chain. Cần đối soát ngay.',
  }),
  wallet_reconciliation_alert: (m) => ({
    tone: 'info',
    title: '🧾 Kết quả đối soát ví',
    desc: `Đã bổ sung ${vn(m?.txs_backfilled)} giao dịch thiếu${
      num(m?.errors) ? `, ${vn(m?.errors)} lỗi cần xem` : ''
    }${num(m?.runs) > 1 ? ` (gộp ${vn(m?.runs)} lượt quét trong 24h)` : ''}.`,
  }),
};

/**
 * Đường dẫn khi bấm vào một thông báo. Trả về null nếu không có đích phù hợp.
 */
export function notificationRoute(n: {
  type: string;
  post_id?: string | null;
  actor?: { id?: string } | null;
  metadata?: unknown;
}): string | null {
  const { type } = n;
  const actorId = n.actor?.id;

  if ((FRAUD_TYPES as readonly string[]).includes(type)) return '/admin?tab=fraud';
  if (type === 'wallet_reconciliation_alert') return '/admin?tab=wallets';
  if (type === 'btc_address_cleared') return '/profile?tab=edit';
  if (type.startsWith('treasury_')) return '/admin?tab=treasury';

  if (type === 'donation') return actorId ? `/profile/${actorId}` : '/wallet/history';
  if (type === 'epoch_claim_ready') return '/wallet/fun_money';
  if (
    ['claim_reward', 'reward_approved', 'reward_rejected', 'reward_adjustment', 'link_wallet_reminder', 'epoch_reset_info'].includes(type)
  ) return '/wallet';
  if (['mint_request_rejected', 'fun_mint_signed', 'fun_mint_confirmed'].includes(type)) return '/wallet/fun_money';

  if ((QUEST_TYPES as readonly string[]).includes(type)) return '/quests';
  if ((MYSTERY_BOX_TYPES as readonly string[]).includes(type)) return '/mystery-box';

  if ((PET_NOTIFICATION_TYPES as readonly string[]).includes(type)) {
    if (type === 'pet_cheer_received' && actorId) return `/profile/${actorId}`;
    if (type === 'pet_shop_purchased' || type === 'pet_shop_failed') return '/pet/shop';
    if (type === 'pet_battle_challenge' || type === 'pet_battle_result') return '/pet/arena';
    if (type === 'buddy_invite') return '/pet';
    return '/pet';
  }

  if ((IDENTITY_TYPES as readonly string[]).includes(type)) return '/identity';

  if (type === 'live_started' && n.post_id) return `/post/${n.post_id}`;
  if (['live_auto_ended', 'live_reconnected', 'live_recording_missed', 'live_recording_failed', 'live_replay_failed'].includes(type)) {
    return n.post_id ? `/post/${n.post_id}` : '/live';
  }

  if (n.post_id) return `/post/${n.post_id}`;
  if (['friend_request', 'friend_accepted', 'friend_removed'].includes(type) && actorId) return `/profile/${actorId}`;
  if (actorId) return `/profile/${actorId}`;
  return null;
}

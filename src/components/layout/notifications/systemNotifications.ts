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
  'impersonation_alert',
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
const str = (v: unknown): string => (typeof v === 'string' ? v : '');

export interface SystemNotifText {
  title: string;
  desc: string;
  tone?: 'default' | 'success' | 'warning' | 'danger' | 'info';
}

export type SystemNotifTranslator = (key: string) => string;
export type SystemNotifFormatter = (v: unknown) => string;

/**
 * Nội dung cho các loại thông báo hệ thống (tiếng Việt — nhất quán với các case
 * mint/live đã có sẵn trong utils.ts).
 */
export const SYSTEM_NOTIF_TEXT: Record<
  string,
  (m: Meta, t: SystemNotifTranslator, fmt: SystemNotifFormatter) => SystemNotifText
> = {
  // ─── Ví BTC ───
  btc_address_cleared: (_m, t) => ({
    tone: 'warning',
    title: t('sntBtcClearedTitle'),
    desc: t('sntBtcClearedDesc'),
  }),
  // ─── Nhiệm vụ / chuỗi ngày ───
  quest_completed: (m, t, fmt) => ({
    tone: 'success',
    title: t('sntQuestDoneTitle'),
    desc: `${t('sntQuestDoneDescA')}${str(m?.quest_title) ? ` "${str(m?.quest_title)}"` : ''}${
      num(m?.ls_reward) ? `${t('sntQuestDoneDescRewardA')}${fmt(m?.ls_reward)}${t('sntQuestDoneDescRewardB')}` : ''
    }.`,
  }),
  streak_milestone: (m, t, fmt) => ({
    tone: 'success',
    title: t('sntStreakTitle'),
    desc: `${t('sntStreakDescA')}${fmt(m?.streak_days ?? m?.days ?? 0)}${t('sntStreakDescB')}`,
  }),
  sbt_issued_quest: (m, t) => ({
    tone: 'success',
    title: t('sntSbtQuestTitle'),
    desc: `${t('sntSbtQuestDescA')}${str(m?.sbt_type) ? ` ${str(m?.sbt_type)}` : ''}${t('sntSbtQuestDescB')}`,
  }),

  // ─── Hộp bí ẩn ───
  mystery_box_received: (m, t) => ({
    tone: 'info',
    title: t('sntMysteryReceivedTitle'),
    desc: `${t('sntMysteryReceivedDescA')}${str(m?.tier) || t('sntMysteryTierDefault')}${t('sntMysteryReceivedDescB')}`,
  }),
  mystery_box_legendary: (m, t) => ({
    tone: 'success',
    title: t('sntMysteryLegendaryTitle'),
    desc: `${t('sntMysteryLegendaryDesc')}${str(m?.reward_label) ? `: ${str(m?.reward_label)}` : ''}.`,
  }),
  mystery_box_expiring: (m, t, fmt) => ({
    tone: 'warning',
    title: t('sntMysteryExpiringTitle'),
    desc: `${t('sntMysteryExpiringDescA')}${fmt(m?.count ?? 1)}${t('sntMysteryExpiringDescB')}`,
  }),
  mystery_box_expired: (m, t, fmt) => ({
    title: t('sntMysteryExpiredTitle'),
    desc: `${fmt(m?.count ?? 1)}${t('sntMysteryExpiredDescSuffix')}`,
  }),

  // ─── Linh thú Lumi ───
  pet_evolved: (m, t) => ({
    tone: 'success',
    title: t('sntPetEvolvedTitle'),
    desc: `${t('sntPetEvolvedDescA')}${str(m?.stage) ? `${t('sntPetEvolvedDescStageA')}${str(m?.stage)}` : ''}${t('sntPetEvolvedDescB')}`,
  }),
  pet_cheer_received: (m, t, fmt) => ({
    tone: 'info',
    title: t('sntPetCheerTitle'),
    desc: `${t('sntPetCheerDescA')}${num(m?.xp) ? `${t('sntPetCheerDescXpA')}${fmt(m?.xp)}${t('sntPetCheerDescXpB')}` : ''}.`,
  }),
  pet_cosmetic_received: (m, t) => ({
    tone: 'info',
    title: t('sntPetCosmeticTitle'),
    desc: `${t('sntPetCosmeticDescA')}${str(m?.item_name) ? ` "${str(m?.item_name)}"` : ''}${t('sntPetCosmeticDescB')}`,
  }),
  pet_xp_granted: (m, t, fmt) => ({
    tone: 'info',
    title: t('sntPetXpTitle'),
    desc: `${t('sntPetXpDescA')}${fmt(m?.xp ?? m?.amount)}${t('sntPetXpDescB')}`,
  }),
  pet_shop_purchased: (m, t) => ({
    tone: 'success',
    title: t('sntPetShopBoughtTitle'),
    desc: `${t('sntPetShopBoughtDescA')}${str(m?.item_name) ? ` "${str(m?.item_name)}"` : ''}${t('sntPetShopBoughtDescB')}`,
  }),
  pet_shop_failed: (_m, t) => ({
    tone: 'danger',
    title: t('sntPetShopFailedTitle'),
    desc: t('sntPetShopFailedDesc'),
  }),
  pet_battle_challenge: (_m, t) => ({
    tone: 'info',
    title: t('sntPetBattleChallengeTitle'),
    desc: t('sntPetBattleChallengeDesc'),
  }),
  pet_battle_result: (m, t) => ({
    tone: 'info',
    title: t('sntPetBattleResultTitle'),
    desc: `${t('sntPetBattleResultDescA')}${str(m?.result) ? `: ${str(m?.result)}` : ''}${t('sntPetBattleResultDescB')}`,
  }),
  pet_lumi_ready: (_m, t) => ({
    tone: 'success',
    title: t('sntPetLumiReadyTitle'),
    desc: t('sntPetLumiReadyDesc'),
  }),
  buddy_invite: (_m, t) => ({
    tone: 'info',
    title: t('sntBuddyInviteTitle'),
    desc: t('sntBuddyInviteDesc'),
  }),

  // ─── Identity ───
  guardian_accepted: (_m, t) => ({
    tone: 'success',
    title: t('sntGuardianAcceptedTitle'),
    desc: t('sntGuardianAcceptedDesc'),
  }),
  guardian_declined: (_m, t) => ({
    tone: 'warning',
    title: t('sntGuardianDeclinedTitle'),
    desc: t('sntGuardianDeclinedDesc'),
  }),
  attestation_received: (_m, t) => ({
    tone: 'success',
    title: t('sntAttestationTitle'),
    desc: t('sntAttestationDesc'),
  }),

  // ─── Live (vận hành) ───
  live_auto_ended: (m, t) => ({
    tone: 'warning',
    title: t('sntLiveAutoEndedTitle'),
    desc: `${t('sntLiveAutoEndedDesc')}${str(m?.reason) ? ` (${str(m?.reason)})` : ''}.`,
  }),
  live_reconnected: (_m, t) => ({
    tone: 'info',
    title: t('sntLiveReconnectedTitle'),
    desc: t('sntLiveReconnectedDesc'),
  }),
  live_recording_missed: (_m, t) => ({
    tone: 'warning',
    title: t('sntLiveRecordingMissedTitle'),
    desc: t('sntLiveRecordingMissedDesc'),
  }),
  live_recording_failed: (_m, t) => ({
    tone: 'danger',
    title: t('sntLiveRecordingFailedTitle'),
    desc: t('sntLiveRecordingFailedDesc'),
  }),
  live_replay_failed: (_m, t) => ({
    tone: 'danger',
    title: t('sntLiveReplayFailedTitle'),
    desc: t('sntLiveReplayFailedDesc'),
  }),

  // ─── Tài khoản ───
  account_unbanned: (_m, t) => ({
    tone: 'success',
    title: t('sntAccountUnbannedTitle'),
    desc: t('sntAccountUnbannedDesc'),
  }),
  link_wallet_reminder: (_m, t) => ({
    tone: 'info',
    title: t('sntLinkWalletTitle'),
    desc: t('sntLinkWalletDesc'),
  }),

  // ─── Giả mạo (cảnh báo cộng đồng) ───
  impersonation_alert: (m, t, fmt) => {
    const sim = m?.similar as { username?: unknown } | undefined;
    const exi = m?.existing as { username?: unknown } | undefined;
    const suspectName = str(sim?.username) || str(m?.suspect_username);
    const victimName = str(exi?.username) || str(m?.victim_username);
    const score = num(m?.overall_score);
    const avatarScore = num(m?.avatar_similarity);
    if (!suspectName) {
      return { tone: 'danger', title: t('sntImpersonationTitle'), desc: t('sntImpersonationDescGeneric') };
    }
    const b = avatarScore > 0 ? t('sntImpersonationDescBNameAvatar') : t('sntImpersonationDescBName');
    return {
      tone: 'danger',
      title: t('sntImpersonationTitle'),
      desc: `${t('sntImpersonationDescA')}${suspectName}${victimName ? `${b}${victimName}` : ''}${t('sntImpersonationDescC')}${
        score ? `${t('sntImpersonationDescScoreA')}${fmt(score)}${t('sntImpersonationDescScoreB')}` : ''
      }`,
    };
  },

  // ─── Vận hành / Admin ───
  treasury_low_gas: (m, t, fmt) => ({
    tone: 'warning',
    title: t('sntTreasuryGasTitle'),
    desc: `${t('sntTreasuryGasDescA')}${str(m?.balance) || fmt(m?.balance_bnb)}${t('sntTreasuryGasDescB')}`,
  }),
  treasury_low_camly: (m, t, fmt) => ({
    tone: 'warning',
    title: t('sntTreasuryCamlyTitle'),
    desc: `${t('sntTreasuryCamlyDescA')}${str(m?.balance) || fmt(m?.balance_camly)}${t('sntTreasuryCamlyDescB')}`,
  }),
  treasury_ledger_drift: (_m, t) => ({
    tone: 'danger',
    title: t('sntTreasuryDriftTitle'),
    desc: t('sntTreasuryDriftDesc'),
  }),
  wallet_reconciliation_alert: (m, t, fmt) => ({
    tone: 'info',
    title: t('sntWalletReconTitle'),
    desc: `${t('sntWalletReconDescA')}${fmt(m?.txs_backfilled)}${t('sntWalletReconDescB')}${
      num(m?.errors) ? `, ${fmt(m?.errors)}${t('sntWalletReconDescErrSuffix')}` : ''
    }${num(m?.runs) > 1 ? `${t('sntWalletReconDescRunsA')}${fmt(m?.runs)}${t('sntWalletReconDescRunsB')}` : ''}.`,
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
  if (type === 'impersonation_alert') {
    const md = (n.metadata ?? {}) as { similar?: { id?: string }; suspect_id?: string };
    const sid = md.similar?.id || md.suspect_id;
    return sid ? `/profile/${sid}` : null;
  }
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

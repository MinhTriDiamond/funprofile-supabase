/**
 * Notification Utility Functions
 */

import { NotificationWithDetails, NotificationGroups, NotificationMetadata, REACTION_ICONS } from './types';
import { Bell, MessageCircle, Share2, Gift, Shield, UserPlus, UserCheck, UserX, Wallet, Radio, Sparkles, ShieldCheck, Award, Scale, KeyRound, Users, Clock, Trash2, Tags, PenLine, CheckCircle2, Target, Flame, Package, PawPrint, Swords, ShoppingBag, HeartHandshake, Fuel, Coins, FileSearch, VideoOff, RefreshCw, Square } from 'lucide-react';
import React from 'react';
import { SYSTEM_NOTIF_TEXT } from './systemNotifications';


/** Icon riêng cho các loại thông báo hệ thống bổ sung */
const EXTRA_ICONS: Record<string, { icon: React.ElementType; className: string }> = {
  btc_address_cleared: { icon: Wallet, className: 'w-4 h-4 text-amber-500' },
  quest_completed: { icon: Target, className: 'w-4 h-4 text-emerald-500' },
  streak_milestone: { icon: Flame, className: 'w-4 h-4 text-orange-500' },
  sbt_issued_quest: { icon: Award, className: 'w-4 h-4 text-amber-500' },
  mystery_box_received: { icon: Package, className: 'w-4 h-4 text-primary' },
  mystery_box_legendary: { icon: Sparkles, className: 'w-4 h-4 text-amber-500' },
  mystery_box_expiring: { icon: Clock, className: 'w-4 h-4 text-amber-500' },
  mystery_box_expired: { icon: Trash2, className: 'w-4 h-4 text-muted-foreground' },
  pet_evolved: { icon: Sparkles, className: 'w-4 h-4 text-violet-500' },
  pet_cheer_received: { icon: HeartHandshake, className: 'w-4 h-4 text-pink-500' },
  pet_cosmetic_received: { icon: ShoppingBag, className: 'w-4 h-4 text-primary' },
  pet_xp_granted: { icon: PawPrint, className: 'w-4 h-4 text-emerald-500' },
  pet_shop_purchased: { icon: ShoppingBag, className: 'w-4 h-4 text-green-500' },
  pet_shop_failed: { icon: ShoppingBag, className: 'w-4 h-4 text-destructive' },
  pet_battle_challenge: { icon: Swords, className: 'w-4 h-4 text-orange-500' },
  pet_battle_result: { icon: Swords, className: 'w-4 h-4 text-primary' },
  pet_lumi_ready: { icon: PawPrint, className: 'w-4 h-4 text-emerald-500' },
  buddy_invite: { icon: Users, className: 'w-4 h-4 text-purple-500' },
  guardian_accepted: { icon: ShieldCheck, className: 'w-4 h-4 text-emerald-500' },
  guardian_declined: { icon: Shield, className: 'w-4 h-4 text-muted-foreground' },
  attestation_received: { icon: PenLine, className: 'w-4 h-4 text-blue-500' },
  account_unbanned: { icon: ShieldCheck, className: 'w-4 h-4 text-emerald-500' },
  link_wallet_reminder: { icon: Wallet, className: 'w-4 h-4 text-primary' },
  treasury_low_gas: { icon: Fuel, className: 'w-4 h-4 text-amber-500' },
  treasury_low_camly: { icon: Coins, className: 'w-4 h-4 text-amber-500' },
  treasury_ledger_drift: { icon: Scale, className: 'w-4 h-4 text-destructive' },
  wallet_reconciliation_alert: { icon: FileSearch, className: 'w-4 h-4 text-primary' },
  live_auto_ended: { icon: Square, className: 'w-4 h-4 text-amber-500' },
  live_reconnected: { icon: RefreshCw, className: 'w-4 h-4 text-emerald-500' },
  live_recording_missed: { icon: VideoOff, className: 'w-4 h-4 text-amber-500' },
  live_recording_failed: { icon: VideoOff, className: 'w-4 h-4 text-destructive' },
  live_replay_failed: { icon: VideoOff, className: 'w-4 h-4 text-destructive' },
};

const TONE_CLASS: Record<string, string> = {
  default: '',
  success: 'text-green-600 dark:text-green-400',
  info: 'text-primary',
  warning: 'text-amber-600 dark:text-amber-400',
  danger: 'text-destructive',
};


type Translator = (key: string, vars?: Record<string, string | number>) => string;

/**
 * Group notifications by time periods
 */
export const groupNotificationsByTime = (notifications: NotificationWithDetails[]): NotificationGroups => {
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const yesterday = new Date(today.getTime() - 24 * 60 * 60 * 1000);
  const weekAgo = new Date(today.getTime() - 7 * 24 * 60 * 60 * 1000);
  const hourAgo = new Date(now.getTime() - 60 * 60 * 1000);

  const groups: NotificationGroups = {
    new: [],
    today: [],
    yesterday: [],
    thisWeek: [],
    earlier: []
  };

  notifications.forEach(n => {
    const createdAt = new Date(n.created_at);

    if (createdAt >= hourAgo) {
      groups.new.push(n);
    } else if (createdAt >= today) {
      groups.today.push(n);
    } else if (createdAt >= yesterday) {
      groups.yesterday.push(n);
    } else if (createdAt >= weekAgo) {
      groups.thisWeek.push(n);
    } else {
      groups.earlier.push(n);
    }
  });

  return groups;
};

/**
 * Get notification icon element based on type
 */
export const getNotificationIcon = (type: string): React.ReactNode => {
  switch (type) {
    case 'like':
      return React.createElement('span', { className: 'text-lg' }, REACTION_ICONS.like.icon);
    case 'love':
      return React.createElement('span', { className: 'text-lg' }, REACTION_ICONS.love.icon);
    case 'care':
      return React.createElement('span', { className: 'text-lg' }, REACTION_ICONS.care.icon);
    case 'haha':
      return React.createElement('span', { className: 'text-lg' }, REACTION_ICONS.haha.icon);
    case 'wow':
      return React.createElement('span', { className: 'text-lg' }, REACTION_ICONS.wow.icon);
    case 'sad':
      return React.createElement('span', { className: 'text-lg' }, REACTION_ICONS.sad.icon);
    case 'angry':
      return React.createElement('span', { className: 'text-lg' }, REACTION_ICONS.angry.icon);
    case 'pray':
      return React.createElement('span', { className: 'text-lg' }, REACTION_ICONS.pray.icon);
    case 'comment':
    case 'comment_like':
    case 'comment_reply':
      return React.createElement(MessageCircle, { className: 'w-4 h-4 text-primary' });
    case 'share':
      return React.createElement(Share2, { className: 'w-4 h-4 text-green-500' });
    case 'post_tagged':
      return React.createElement(Tags, { className: 'w-4 h-4 text-primary' });
    case 'donation':
      return React.createElement(Gift, { className: 'w-4 h-4 text-green-500' });
    case 'reward_approved':
    case 'reward_rejected':
      return React.createElement(Gift, { className: 'w-4 h-4 text-gold' });
    case 'claim_reward':
      return React.createElement(Wallet, { className: 'w-4 h-4 text-gold' });
    case 'account_banned':
      return React.createElement(Shield, { className: 'w-4 h-4 text-destructive' });
    case 'admin_shared_device':
    case 'admin_email_farm':
    case 'admin_blacklisted_ip':
    case 'admin_fraud_daily':
      return React.createElement(Shield, { className: 'w-4 h-4 text-orange-500' });
    case 'reward_adjustment':
      return React.createElement(Wallet, { className: 'w-4 h-4 text-orange-500' });
    case 'epoch_claim_ready':
    case 'epoch_reset_info':
      return React.createElement(Sparkles, { className: 'w-4 h-4 text-amber-500' });
    case 'mint_request_rejected':
      return React.createElement(Shield, { className: 'w-4 h-4 text-destructive' });
    case 'fun_mint_signed':
      return React.createElement(PenLine, { className: 'w-4 h-4 text-blue-500' });
    case 'fun_mint_confirmed':
      return React.createElement(CheckCircle2, { className: 'w-4 h-4 text-green-500' });
    case 'live_started':
      return React.createElement(Radio, { className: 'w-4 h-4 text-destructive' });
    case 'live_replay_expiring':
      return React.createElement(Clock, { className: 'w-4 h-4 text-amber-500' });
    case 'live_replay_expired':
      return React.createElement(Trash2, { className: 'w-4 h-4 text-muted-foreground' });
    case 'friend_request':
      return React.createElement(UserPlus, { className: 'w-4 h-4 text-purple-500' });
    case 'friend_accepted':
      return React.createElement(UserCheck, { className: 'w-4 h-4 text-green-500' });
    case 'friend_removed':
      return React.createElement(UserX, { className: 'w-4 h-4 text-destructive' });
    // ─── Identity Layer ───
    case 'did_promoted':
      return React.createElement(ShieldCheck, { className: 'w-4 h-4 text-violet-500' });
    case 'sbt_issued':
      return React.createElement(Award, { className: 'w-4 h-4 text-amber-500' });
    case 'dispute_resolved':
      return React.createElement(Scale, { className: 'w-4 h-4 text-blue-500' });
    case 'recovery_initiated':
      return React.createElement(KeyRound, { className: 'w-4 h-4 text-orange-500' });
    case 'guardian_invited':
      return React.createElement(Users, { className: 'w-4 h-4 text-purple-500' });
    case 'impersonation_alert':
      return React.createElement(Shield, { className: 'w-4 h-4 text-orange-500' });
    case 'impersonation_confirmed':
      return React.createElement(ShieldCheck, { className: 'w-4 h-4 text-emerald-500' });
    case 'impersonation_dismissed':
      return React.createElement(Shield, { className: 'w-4 h-4 text-muted-foreground' });
    default: {
      const extra = EXTRA_ICONS[type];
      if (extra) return React.createElement(extra.icon, { className: extra.className });
      return React.createElement(Bell, { className: 'w-4 h-4 text-muted-foreground' });
    }

  }
};

/**
 * Truncate content to specified length
 */
export const truncateContent = (content: string | null | undefined, maxLength: number = 50): string => {
  if (!content) return '';
  return content.length > maxLength ? content.slice(0, maxLength) + '...' : content;
};

/**
 * Render a translated template that contains a {user} placeholder.
 * The username gets wrapped in <strong>.
 */
const renderUserTemplate = (template: string, username: string): React.ReactNode => {
  const parts = template.split('{user}');
  if (parts.length === 1) return template;
  return React.createElement(
    React.Fragment,
    null,
    parts[0],
    React.createElement('strong', null, username),
    parts.slice(1).join('{user}')
  );
};

/**
 * Get notification text with optional post snippet — i18n-aware.
 * Pass the `t` function from useLanguage.
 */
export const getNotificationText = (
  type: string,
  username: string,
  postContent?: string | null,
  metadata?: NotificationMetadata | null,
  t?: Translator
): { main: React.ReactNode; snippet?: string } => {
  const snippet = postContent ? truncateContent(postContent, 50) : undefined;
  // Fallback translator: returns the key itself (keeps things working if t is missing)
  const tr: Translator = t || ((k) => k);

  let main: React.ReactNode;

  // Simple "{user} did X" templates
  const simpleKeys: Record<string, string> = {
    like: 'notifLike',
    love: 'notifLove',
    care: 'notifCare',
    haha: 'notifHaha',
    wow: 'notifWow',
    sad: 'notifSad',
    angry: 'notifAngry',
    pray: 'notifPray',
    comment: 'notifComment',
    comment_like: 'notifCommentLike',
    comment_reply: 'notifCommentReply',
    share: 'notifShare',
    post_tagged: 'notifPostTagged',
    donation: 'notifDonation',
    friend_request: 'notifFriendRequest',
    friend_accepted: 'notifFriendAccepted',
    friend_removed: 'notifFriendRemoved',
    live_started: 'notifLiveStarted',
  };

  if (simpleKeys[type]) {
    main = renderUserTemplate(tr(simpleKeys[type]), username);
    return { main, snippet };
  }

  switch (type) {
    case 'reward_approved':
      main = React.createElement(React.Fragment, null,
        tr('notifRewardApprovedPrefix'),
        React.createElement('strong', null, tr('notifRewardApprovedStrong')),
        tr('notifRewardApprovedTail')
      );
      break;
    case 'reward_rejected':
      main = React.createElement(React.Fragment, null, tr('notifRewardRejected'));
      break;
    case 'account_banned':
      main = React.createElement(React.Fragment, null, tr('notifAccountBanned'));
      break;
    case 'admin_shared_device': {
      const m = metadata;
      const detail = m?.device_hash
        ? tr('notifSharedDeviceDetail', { hash: m.device_hash.slice(0, 8), count: m.user_count || '?' })
        : tr('notifSharedDeviceFallback');
      main = React.createElement(React.Fragment, null,
        '🔴 ',
        React.createElement('strong', null, tr('notifAlertStrong')),
        detail
      );
      break;
    }
    case 'admin_email_farm': {
      const m = metadata;
      const detail = m?.email_base
        ? tr('notifEmailFarmDetail', { base: m.email_base, count: m.count || '?' })
        : tr('notifEmailFarmFallback');
      main = React.createElement(React.Fragment, null,
        '🔴 ',
        React.createElement('strong', null, tr('notifAlertStrong')),
        detail
      );
      break;
    }
    case 'admin_blacklisted_ip': {
      const m = metadata;
      const detail = m?.ip_address
        ? tr('notifBlacklistedIpDetail', { ip: m.ip_address })
        : tr('notifBlacklistedIpFallback');
      main = React.createElement(React.Fragment, null,
        '🔴 ',
        React.createElement('strong', null, tr('notifAlertStrong')),
        detail
      );
      break;
    }
    case 'admin_fraud_daily': {
      const m = metadata;
      const summary = m?.alerts_count
        ? tr('notifFraudDailySummary', {
            count: m.alerts_count,
            suspended: m?.accounts_held ? tr('notifFraudDailySuspended', { count: m.accounts_held }) : '',
          })
        : tr('notifFraudDailyFallback');
      main = React.createElement(React.Fragment, null,
        '📊 ',
        React.createElement('strong', null, tr('notifFraudReportStrong')),
        summary
      );
      break;
    }
    case 'claim_reward':
      main = React.createElement(React.Fragment, null,
        React.createElement('strong', null, tr('notifClaimRewardStrong')),
        tr('notifClaimRewardTail')
      );
      break;
    case 'epoch_claim_ready': {
      const epochMonth = metadata?.epoch_month || '';
      const amount = metadata?.amount ? Number(metadata.amount).toLocaleString() : '';
      main = React.createElement(React.Fragment, null,
        tr('notifEpochClaimPrefix'),
        React.createElement('strong', null, tr('notifEpochClaimSender')),
        tr('notifEpochClaimMid'),
        React.createElement('strong', null, tr('notifEpochClaimLabel', { month: epochMonth })),
        amount ? tr('notifEpochClaimAmount', { amount }) : tr('notifEpochClaimNoAmount')
      );
      break;
    }
    case 'reward_adjustment': {
      const adjustMsg = metadata?.message || tr('notifRewardAdjustmentDefault');
      main = React.createElement(React.Fragment, null,
        '⚖️ ',
        React.createElement('strong', null, tr('notifRewardAdjustmentSender')),
        ` — ${adjustMsg}`
      );
      break;
    }
    case 'epoch_reset_info': {
      const title = (metadata as Record<string, unknown>)?.title as string | undefined
        || tr('notifEpochResetTitle');
      const message = (metadata as Record<string, unknown>)?.message as string | undefined
        || tr('notifEpochResetMessage');
      main = React.createElement(React.Fragment, null,
        React.createElement('strong', { className: 'block mb-0.5' }, title),
        React.createElement('span', { className: 'block text-muted-foreground' }, message)
      );
      break;
    }
    case 'mint_request_rejected': {
      const m = (metadata as Record<string, unknown>) || {};
      const title = (m.title as string) || 'Lệnh mint FUN bị từ chối';
      const message = (m.message as string) || 'Lệnh mint của bạn đã bị huỷ tự động.';
      const reason = m.reason as string | undefined;
      main = React.createElement(React.Fragment, null,
        React.createElement('strong', { className: 'block mb-0.5 text-destructive' }, '⛔ ' + title),
        React.createElement('span', { className: 'block text-muted-foreground' }, message),
        reason
          ? React.createElement('span', { className: 'block mt-1 text-[11px] text-destructive/80 italic' }, 'Lý do: ' + reason)
          : null
      );
      break;
    }
    case 'live_replay_expiring': {
      const expiresAt = (metadata as Record<string, unknown>)?.expires_at as string | undefined;
      const days = expiresAt
        ? Math.max(0, Math.ceil((new Date(expiresAt).getTime() - Date.now()) / (24 * 3600 * 1000)))
        : 5;
      main = React.createElement(React.Fragment, null,
        React.createElement('strong', { className: 'block mb-0.5 text-amber-600 dark:text-amber-400' },
          '⏰ Video live sắp tự xoá'),
        React.createElement('span', { className: 'block text-muted-foreground' },
          `Video live của bạn sẽ tự xoá sau ${days} ngày. Hãy bấm vào bài đăng và "Tải về" để lưu MP4 trước khi hết hạn.`)
      );
      break;
    }
    case 'live_replay_expired': {
      main = React.createElement(React.Fragment, null,
        React.createElement('strong', { className: 'block mb-0.5' }, '🗑️ Video live đã hết hạn'),
        React.createElement('span', { className: 'block text-muted-foreground' },
          'Video live đã được tự xoá sau 30 ngày. Bài đăng vẫn còn nhưng không còn video phát lại.')
      );
      break;
    }
    case 'fun_mint_signed': {
      const m = (metadata as Record<string, unknown>) || {};
      const amount = m.amount != null ? Number(m.amount).toLocaleString('vi-VN') : '';
      const action = (m.action as string) || '';
      const isChild = !!m.is_split_child;
      main = React.createElement(React.Fragment, null,
        React.createElement('strong', { className: 'block mb-0.5 text-blue-600 dark:text-blue-400' },
          '✍️ Lệnh mint đã được ký' + (isChild ? ' (phần tách)' : '')),
        React.createElement('span', { className: 'block text-muted-foreground' },
          `Lệnh mint ${amount} FUN${action ? ` (${action})` : ''} đã đủ chữ ký multisig, chờ lên on-chain.`)
      );
      break;
    }
    case 'fun_mint_confirmed': {
      const m = (metadata as Record<string, unknown>) || {};
      const amount = m.amount != null ? Number(m.amount).toLocaleString('vi-VN') : '';
      const action = (m.action as string) || '';
      const txHash = (m.tx_hash as string) || '';
      const isChild = !!m.is_split_child;
      main = React.createElement(React.Fragment, null,
        React.createElement('strong', { className: 'block mb-0.5 text-green-600 dark:text-green-400' },
          '✅ Mint thành công' + (isChild ? ' (phần tách)' : '')),
        React.createElement('span', { className: 'block text-muted-foreground' },
          `Đã mint ${amount} FUN${action ? ` (${action})` : ''} lên on-chain. Bấm để xem giao dịch.`),
        txHash
          ? React.createElement('span', { className: 'block mt-1 text-[11px] text-muted-foreground/80 font-mono' },
              txHash.slice(0, 10) + '...' + txHash.slice(-8))
          : null
      );
      break;
    }
    case 'impersonation_alert': {
      const m = (metadata as Record<string, unknown>) || {};
      const nameSim = (m.name_similarity as number) ?? 0;
      const avatarSim = (m.avatar_similarity as number) ?? 0;
      main = React.createElement(React.Fragment, null,
        React.createElement('strong', { className: 'block mb-0.5 text-orange-600 dark:text-orange-400' },
          '⚠️ Cảnh báo: có tài khoản mới giống bạn'),
        React.createElement('span', { className: 'block text-muted-foreground' },
          `Tài khoản @${(m.suspect_username as string) || ''} có tên giống ${nameSim}% và ảnh giống ${avatarSim}%. Bấm để xác minh.`)
      );
      break;
    }
    case 'impersonation_confirmed': {
      main = React.createElement(React.Fragment, null,
        React.createElement('strong', { className: 'block mb-0.5 text-emerald-600 dark:text-emerald-400' },
          '✅ Báo cáo mạo danh đã được xử lý'),
        React.createElement('span', { className: 'block text-muted-foreground' },
          'Quản trị viên đã xem xét và xử lý tài khoản mạo danh bạn báo cáo.')
      );
      break;
    }
    case 'impersonation_dismissed': {
      main = React.createElement(React.Fragment, null,
        React.createElement('strong', { className: 'block mb-0.5' },
          'ℹ️ Cảnh báo mạo danh đã được đóng'),
        React.createElement('span', { className: 'block text-muted-foreground' },
          'Quản trị viên đánh giá đây không phải tài khoản mạo danh.')
      );
      break;
    }
    default: {
      // Các loại thông báo hệ thống (nhiệm vụ, hộp bí ẩn, Lumi, identity, treasury, live…)
      const build = SYSTEM_NOTIF_TEXT[type];
      if (build) {
        const { title, desc, tone } = build(metadata as Record<string, unknown> | null | undefined);
        main = React.createElement(React.Fragment, null,
          React.createElement('strong', { className: `block mb-0.5 ${TONE_CLASS[tone || 'default']}` }, title),
          React.createElement('span', { className: 'block text-muted-foreground' }, desc)
        );
      } else {
        main = React.createElement(React.Fragment, null, tr('notifSystemGeneric'));
      }
    }

  }

  return { main, snippet };
};

/**
 * Get section title for time group — i18n-aware.
 */
export const getSectionTitle = (key: keyof NotificationGroups, t?: Translator): string => {
  const tr: Translator = t || ((k) => k);
  const keyMap: Record<keyof NotificationGroups, string> = {
    new: 'notifGroupNew',
    today: 'notifGroupToday',
    yesterday: 'notifGroupYesterday',
    thisWeek: 'notifGroupThisWeek',
    earlier: 'notifGroupEarlier',
  };
  return tr(keyMap[key]);
};

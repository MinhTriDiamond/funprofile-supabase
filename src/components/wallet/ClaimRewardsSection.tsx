import { useState, useEffect } from 'react';
import { useLanguage } from '@/i18n/LanguageContext';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { Textarea } from '@/components/ui/textarea';
import { Gift, Wallet, AlertTriangle, Info, Clock, CheckCircle2, TrendingUp, MessageCircle, Send, Loader2, ShieldAlert, Lock, ClipboardCheck, PartyPopper, RefreshCw } from 'lucide-react';
import { useQueryClient } from '@tanstack/react-query';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { toast } from 'sonner';
import { RewardStats } from './RewardBreakdown';
import camlyLogo from '@/assets/tokens/camly-logo.webp';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { useWalletSecurity } from '@/hooks/useWalletSecurity';
import { usePendingClaims } from '@/hooks/usePendingClaims';
import { chatRpc } from '@/modules/chat/chatRpc';

const MINIMUM_THRESHOLD = 200000;
const DAILY_LIMIT = 500000;

interface ClaimRewardsSectionProps {
  claimableReward: number;
  claimedAmount: number;
  dailyClaimed: number;
  rewardStats: RewardStats | null;
  camlyPrice: number | null;
  isConnected: boolean;
  rewardStatus: string;
  adminNotes?: string | null;
  isLoading: boolean;
  hasAvatar: boolean;
  hasCover: boolean;
  hasTodayPost: boolean;
  hasFullName: boolean;
  hasSocialLinks: boolean;
  accountAgeDays: number;
  onClaimClick: () => void;
  onConnectClick: () => void;
}

const formatNumber = (num: number) => {
  return num.toLocaleString('vi-VN');
};

export const ClaimRewardsSection = ({
  claimableReward,
  claimedAmount,
  dailyClaimed,
  rewardStats,
  camlyPrice,
  isConnected,
  rewardStatus,
  adminNotes,
  isLoading,
  hasAvatar,
  hasCover,
  hasTodayPost,
  hasFullName,
  hasSocialLinks,
  accountAgeDays,
  onClaimClick,
  onConnectClick,
}: ClaimRewardsSectionProps) => {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { t } = useLanguage();
  const [adminMessage, setAdminMessage] = useState('');
  const [isSendingMessage, setIsSendingMessage] = useState(false);
  const [userId, setUserId] = useState<string | null>(null);
  
  // Get current user for wallet security check
  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      if (data.session?.user) setUserId(data.session.user.id);
    });
  }, []);
  
  const { data: walletSecurity } = useWalletSecurity(userId);
  const { data: activePendingClaims } = usePendingClaims(userId);
  const hasPendingClaim = (activePendingClaims?.length ?? 0) > 0;
  const pendingClaimTotal = activePendingClaims?.reduce((sum, c) => sum + Number(c.amount), 0) || 0;
  
  const totalReward = rewardStats?.total_reward || 0;
  const pendingAmount = Math.max(0, totalReward - claimedAmount - claimableReward);
  const dailyRemaining = Math.max(0, DAILY_LIMIT - dailyClaimed);

  const [isRequestingApproval, setIsRequestingApproval] = useState(false);

  const statusConfig: Record<string, { label: string; color: string; disabled: boolean }> = {
    loading: { label: t('crsLoadingRewardStatus'), color: 'text-gray-600', disabled: true },
    inactive: { label: t('crsNotRequested'), color: 'text-gray-600', disabled: true },
    pending: { label: t('crsWaitingAdminApproval'), color: 'text-yellow-600', disabled: true },
    approved: { label: t('crsClaimAmount', { amount: formatNumber(claimableReward) }), color: 'text-green-600', disabled: false },
    on_hold: { label: t('crsOnHold'), color: 'text-orange-600', disabled: true },
    rejected: { label: t('adminReject'), color: 'text-red-600', disabled: true },
  };

  const config = statusConfig[rewardStatus] || statusConfig.inactive;
  const isStatusLoading = rewardStatus === 'loading';

  const handleRequestApproval = async () => {
    const missing: string[] = [];
    if (!hasFullName) missing.push(t('crsFullNameCond'));
    if (!hasAvatar) missing.push(t('profilePhoto'));
    if (!hasCover) missing.push(t('crsCoverPhoto'));
    if (!hasSocialLinks) missing.push(t('crsSocialLinksCond'));
    if (!hasTodayPost) missing.push(t('crsPostTodayCond'));
    if (!isConnected) missing.push(t('connectWallet'));
    if (accountAgeDays < 7) missing.push(t('crsAccountAgeCond', { days: accountAgeDays }));
    
    if (missing.length > 0) {
      toast.error(t('crsNotEligibleToRequest'), {
        description: missing.map(m => `• ${m}`).join('\n'),
        duration: 6000,
      });
      return;
    }

    setIsRequestingApproval(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.user) { toast.error(t('crsLoginRequired')); return; }

      const { error } = await supabase
        .from('profiles')
        .update({ reward_status: 'pending' })
        .eq('id', session.user.id);
      
      if (error) throw error;
      toast.success(t('crsRequestSentSuccess'), {
        description: t('crsRequestSentDesc'),
      });
      // Force page reload to reflect new status
      window.location.reload();
    } catch (err) {
      console.error('Error requesting approval:', err);
      toast.error(t('crsRequestFailed'));
    } finally {
      setIsRequestingApproval(false);
    }
  };

  const allConditionsMet = hasAvatar && hasCover && hasTodayPost && hasFullName && hasSocialLinks && isConnected && !hasPendingClaim;

  const handleClaimClick = () => {
    if (!isConnected) {
      onConnectClick();
      return;
    }
    if (hasPendingClaim) {
      toast.info(t('crsPendingClaimsToast', { count: activePendingClaims?.length }));
      return;
    }
    if (walletSecurity?.isBlocked) {
      toast.error(t('crsAccountBlockedToast'));
      return;
    }
    if (walletSecurity?.isFrozen) {
      toast.warning(t('crsFrozenToast', { hours: walletSecurity.freezeHoursLeft }));
      return;
    }
    if (config.disabled) {
      if (rewardStatus === 'pending') toast.info(t('crsNeedApprovalToast'));
      else if (rewardStatus === 'on_hold') toast.warning(t('crsOnHoldToast'));
      else if (rewardStatus === 'rejected') toast.error(t('crsRejectedToast'));
      return;
    }
    if (!allConditionsMet) {
      const missing: string[] = [];
      if (!hasFullName) missing.push(t('crsUpdateFullName'));
      if (!hasAvatar) missing.push(t('crsAddAvatar'));
      if (!hasCover) missing.push(t('crsAddCover'));
      if (!hasSocialLinks) missing.push(t('crsAddSocialLink'));
      if (!hasTodayPost) missing.push(t('crsPostTodayBullet'));
      if (!isConnected) missing.push(t('crsConnectWalletBullet'));
      toast.warning(t('crsNotEligibleToClaim'), {
        description: missing.join('\n'),
        duration: 6000,
      });
      return;
    }
    onClaimClick();
  };

  const ADMIN_ID = '70640edc-337f-4e89-bd7e-9501bd79ec9f';

  const handleSendToAdmin = async () => {
    if (!adminMessage.trim()) {
      toast.warning(t('crsEnterMessage'));
      return;
    }
    setIsSendingMessage(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.user) {
        toast.error(t('crsLoginRequired'));
        return;
      }
      const userId = session.user.id;
      const messageContent = `[Hỗ trợ Claim Rewards] ${adminMessage.trim()}`;
      const conversationId = await chatRpc.createDirectConversation(ADMIN_ID);

      // Send the message
      const { error: msgErr } = await supabase.from('messages').insert({
        conversation_id: conversationId,
        sender_id: userId,
        content: messageContent,
      });
      if (msgErr) throw msgErr;

      // Create notification for admin
      await supabase.from('notifications').insert({
        user_id: ADMIN_ID,
        actor_id: userId,
        type: 'comment', // reuse existing type for bell notification
      });

      toast.success(t('crsMessageSentSuccess'), {
        description: t('crsMessageSentDesc'),
      });
      setAdminMessage('');
    } catch (err) {
      console.error('Error sending admin message:', err);
      toast.error(t('crsMessageFailed'));
    } finally {
      setIsSendingMessage(false);
    }
  };

  const minThresholdProgress = Math.min(100, (claimableReward / MINIMUM_THRESHOLD) * 100);
  const dailyProgress = Math.min(100, (dailyClaimed / DAILY_LIMIT) * 100);

  // Hiện skeleton khi đang tải VÀ chưa có dữ liệu nào (tránh chớp khi refetch background)
  const showSkeleton = isLoading && claimableReward === 0 && claimedAmount === 0 && totalReward === 0 && pendingAmount === 0;
  const SkeletonValue = () => (
    <div className="h-5 w-20 bg-gray-200/80 rounded animate-pulse" />
  );

  const handleManualRefresh = () => {
    queryClient.invalidateQueries({ queryKey: ['reward-stats'] });
    queryClient.invalidateQueries({ queryKey: ['pending-claims'] });
    queryClient.invalidateQueries({ queryKey: ['wallet-security'] });
    // Trigger event để WalletCenterContainer refetch (nó listen window event)
    window.dispatchEvent(new CustomEvent('wallet:refetch-rewards'));
    toast.success(t('crsRefreshingBalance'));
  };

  return (
    <Card className="overflow-hidden border-0 shadow-lg">
      {/* Header */}
      <CardHeader className="bg-gradient-to-r from-amber-500 via-yellow-500 to-orange-400 text-white pb-4">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-white/20 backdrop-blur-sm rounded-full flex items-center justify-center">
              <Gift className="w-5 h-5" />
            </div>
            <div>
              <CardTitle className="text-lg text-white">Claim Rewards</CardTitle>
              <CardDescription className="text-white/80 text-xs">
                {t('crsHeaderDesc')}
              </CardDescription>
            </div>
          </div>
          <button
            type="button"
            onClick={handleManualRefresh}
            disabled={isLoading}
            className="w-9 h-9 rounded-full bg-white/20 hover:bg-white/30 active:bg-white/40 transition flex items-center justify-center shrink-0 disabled:opacity-50"
            title={t('crsRefreshBalance')}
            aria-label={t('crsRefreshBalance')}
          >
            <RefreshCw className={`w-4 h-4 ${isLoading ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </CardHeader>

      <CardContent className="pt-5 space-y-5">
        {/* 2x2 Stats Grid */}
        <div className="grid grid-cols-2 gap-3">
          {/* Có thể Claim */}
          <div className="bg-gradient-to-br from-green-50 to-emerald-50 border border-green-200 rounded-xl p-3.5">
            <div className="flex items-center gap-1.5 mb-1.5">
              <CheckCircle2 className="w-4 h-4 text-green-600" />
              <span className="text-xs text-green-700 font-medium">{t('crsClaimableLabel')}</span>
            </div>
            <div className="flex items-center gap-1.5">
              <img src={camlyLogo} alt="CAMLY" className="w-5 h-5 rounded-full" />
              {showSkeleton ? <SkeletonValue /> : <span className="text-lg font-bold text-green-800">{formatNumber(claimableReward)}</span>}
            </div>
            <p className="text-xs text-green-600 mt-0.5">{camlyPrice === null ? t('ggsNoPrice') : `~$${(claimableReward * camlyPrice).toFixed(2)}`}</p>
          </div>

          {/* Chờ duyệt */}
          <div className="bg-gradient-to-br from-yellow-50 to-amber-50 border border-yellow-200 rounded-xl p-3.5">
            <div className="flex items-center gap-1.5 mb-1.5">
              <Clock className="w-4 h-4 text-yellow-600" />
              <span className="text-xs text-yellow-700 font-medium">{t('adminPendingReview')}</span>
            </div>
            <div className="flex items-center gap-1.5">
              <img src={camlyLogo} alt="CAMLY" className="w-5 h-5 rounded-full" />
              {showSkeleton ? <SkeletonValue /> : <span className="text-lg font-bold text-yellow-800">{formatNumber(pendingAmount)}</span>}
            </div>
            <p className="text-xs text-yellow-600 mt-0.5">{camlyPrice === null ? t('ggsNoPrice') : `~$${(pendingAmount * camlyPrice).toFixed(2)}`}</p>
          </div>

          {/* Đã Claim */}
          <div className="bg-gradient-to-br from-blue-50 to-indigo-50 border border-blue-200 rounded-xl p-3.5">
            <div className="flex items-center gap-1.5 mb-1.5">
              <Wallet className="w-4 h-4 text-blue-600" />
              <span className="text-xs text-blue-700 font-medium">{t('walletClaimed')}</span>
            </div>
            <div className="flex items-center gap-1.5">
              <img src={camlyLogo} alt="CAMLY" className="w-5 h-5 rounded-full" />
              {showSkeleton ? <SkeletonValue /> : <span className="text-lg font-bold text-blue-800">{formatNumber(claimedAmount)}</span>}
            </div>
            <p className="text-xs text-blue-600 mt-0.5">{camlyPrice === null ? t('ggsNoPrice') : `~$${(claimedAmount * camlyPrice).toFixed(2)}`}</p>
          </div>

          {/* Tổng đã nhận */}
          <div className="bg-gradient-to-br from-purple-50 to-violet-50 border border-purple-200 rounded-xl p-3.5">
            <div className="flex items-center gap-1.5 mb-1.5">
              <TrendingUp className="w-4 h-4 text-purple-600" />
              <span className="text-xs text-purple-700 font-medium">{t('crsTotalReceived')}</span>
            </div>
            <div className="flex items-center gap-1.5">
              <img src={camlyLogo} alt="CAMLY" className="w-5 h-5 rounded-full" />
              {showSkeleton ? <SkeletonValue /> : <span className="text-lg font-bold text-purple-800">{formatNumber(totalReward)}</span>}
            </div>
            <p className="text-xs text-purple-600 mt-0.5">{camlyPrice === null ? t('ggsNoPrice') : `~$${(totalReward * camlyPrice).toFixed(2)}`}</p>
          </div>
        </div>

        {/* Inactive / Request Approval */}
        {(rewardStatus === 'inactive' || rewardStatus === 'rejected') && (
          <div className="bg-blue-50 border border-blue-300 rounded-xl p-3.5">
            <div className="flex items-start gap-2">
              <ClipboardCheck className="w-5 h-5 text-blue-600 shrink-0 mt-0.5" />
              <div className="flex-1">
                <p className="text-sm font-semibold text-blue-800">
                  {rewardStatus === 'rejected' ? t('crsRequestRejectedTitle') : t('crsRequestTitle')}
                </p>
                <p className="text-xs text-blue-700 mt-1">
                  {t('crsRequestDesc')}
                </p>
                {rewardStatus === 'rejected' && adminNotes && (
                  <p className="text-xs text-red-600 mt-1">{t('crsRejectReason', { reason: adminNotes })}</p>
                )}
                <Button
                  onClick={handleRequestApproval}
                  disabled={isRequestingApproval}
                  size="sm"
                  className="mt-2 bg-blue-600 hover:bg-blue-700 text-white"
                >
                  {isRequestingApproval ? (
                    <><Loader2 className="w-4 h-4 mr-1.5 animate-spin" />{t('claimSending')}</>
                  ) : (
                    <><Send className="w-4 h-4 mr-1.5" />{t('crsSendRequestBtn')}</>
                  )}
                </Button>
              </div>
            </div>
          </div>
        )}

        {/* Pending Approval Alert */}
        {rewardStatus === 'pending' && (
          <div className="bg-yellow-50 border border-yellow-300 rounded-xl p-3.5">
            <div className="flex items-start gap-2">
              <Clock className="w-5 h-5 text-yellow-600 shrink-0 mt-0.5" />
              <div>
                <p className="text-sm font-semibold text-yellow-800">{t('crsWaitingApprovalTitle')}</p>
                <p className="text-xs text-yellow-700 mt-1">
                  {t('crsWaitingApprovalDesc')}
                </p>
              </div>
            </div>
          </div>
        )}

        {/* On Hold Alert */}
        {rewardStatus === 'on_hold' && adminNotes && (
          <div className="bg-amber-50 border border-amber-300 rounded-xl p-3.5">
            <div className="flex items-start gap-2">
              <Info className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
              <div>
                <p className="text-sm font-semibold text-amber-800">{t('crsVerifyTitle')}</p>
                <p className="text-xs text-amber-700 mt-1">{adminNotes}</p>
                <p className="text-xs text-amber-600 mt-2">
                  {t('crsVerifyDesc')}
                </p>
              </div>
            </div>
          </div>
        )}

        {/* Wallet Freeze Banner */}
        {walletSecurity?.isFrozen && !walletSecurity?.isBlocked && (
          <div className="bg-red-50 border border-red-300 rounded-xl p-3.5">
            <div className="flex items-start gap-2">
              <Lock className="w-5 h-5 text-red-600 shrink-0 mt-0.5" />
              <div>
                <p className="text-sm font-semibold text-red-800">{t('crsFreezeTitle')}</p>
                <p className="text-xs text-red-700 mt-1">
                  {t('crsFreezeDesc', { hours: walletSecurity.freezeHoursLeft })}
                </p>
                {walletSecurity.claimFreezeUntil && (
                  <p className="text-xs text-red-600 mt-1">
                    {t('crsUnlockAt', { time: new Date(walletSecurity.claimFreezeUntil).toLocaleString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh' }) })}
                  </p>
                )}
              </div>
            </div>
          </div>
        )}

        {/* Wallet Blocked Banner */}
        {walletSecurity?.isBlocked && (
          <div className="bg-red-100 border-2 border-red-400 rounded-xl p-3.5">
            <div className="flex items-start gap-2">
              <ShieldAlert className="w-5 h-5 text-red-700 shrink-0 mt-0.5" />
              <div>
                <p className="text-sm font-semibold text-red-900">{t('crsBlockedTitle')}</p>
                <p className="text-xs text-red-800 mt-1">
                  {t('crsBlockedDesc')}
                </p>
              </div>
            </div>
          </div>
        )}

        {/* Message Admin Section - shown when user can't claim */}
        {(rewardStatus === 'pending' || rewardStatus === 'on_hold' || walletSecurity?.isBlocked) && (
          <div className="bg-blue-50 dark:bg-blue-950/20 border border-blue-200 dark:border-blue-800 rounded-xl p-3.5 space-y-3">
            <div className="flex items-center gap-2">
              <MessageCircle className="w-4 h-4 text-blue-600" />
              <p className="text-sm font-semibold text-blue-800 dark:text-blue-300">{t('crsMessageAdminTitle')}</p>
            </div>
            <Textarea
              value={adminMessage}
              onChange={(e) => setAdminMessage(e.target.value)}
              placeholder={t('crsMessagePlaceholder')}
              className="min-h-[80px] text-sm resize-none bg-white dark:bg-background"
              maxLength={500}
            />
            <div className="flex items-center justify-between">
              <span className="text-xs text-muted-foreground">{adminMessage.length}/500</span>
              <Button
                onClick={handleSendToAdmin}
                disabled={isSendingMessage || !adminMessage.trim()}
                size="sm"
                className="bg-blue-600 hover:bg-blue-700 text-white"
              >
                {isSendingMessage ? (
                  <><Loader2 className="w-4 h-4 mr-1.5 animate-spin" />{t('claimSending')}</>
                ) : (
                  <><Send className="w-4 h-4 mr-1.5" />{t('sendMsgBtn')}</>
                )}
              </Button>
            </div>
          </div>
        )}

        {/* Pending Claims Banner */}
        {hasPendingClaim && (
          <div className="bg-amber-50 border border-amber-300 rounded-xl p-3.5">
            <div className="flex items-start gap-2">
              <Clock className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
              <div>
                <p className="text-sm font-semibold text-amber-800">{t('crsPendingClaimBannerTitle')}</p>
                <p className="text-xs text-amber-700 mt-1">
                  {t('crsPendingClaimBannerDesc', { count: activePendingClaims?.length, amount: formatNumber(pendingClaimTotal) })}
                </p>
              </div>
            </div>
          </div>
        )}

        {/* Claim CTA — luôn render 1 nút với reason rõ ràng */}
        {(() => {
          // Tính state cụ thể để user luôn thấy 1 CTA và biết tại sao không bấm được
          const dailyExhausted = dailyClaimed >= DAILY_LIMIT;
          const belowThreshold = claimableReward < MINIMUM_THRESHOLD;

          // 1. Đang tải trạng thái profile
          if (isStatusLoading) {
            return (
              <Button
                data-testid="claim-cta"
                disabled
                aria-disabled="true"
                className="w-full py-6 text-base rounded-xl font-bold shadow-lg bg-gray-200 text-gray-600"
              >
                <Loader2 className="w-5 h-5 mr-2 animate-spin" />
                {t('crsLoadingRewardStatus')}
              </Button>
            );
          }

          // 2. Chưa kết nối ví
          if (!isConnected) {
            return (
              <Button
                data-testid="claim-cta"
                onClick={onConnectClick}
                className="w-full bg-gradient-to-r from-emerald-600 to-green-500 hover:from-emerald-700 hover:to-green-600 text-white font-bold py-6 text-base rounded-xl shadow-lg"
              >
                <Wallet className="w-5 h-5 mr-2" />
                {t('crsConnectWalletToClaim')}
              </Button>
            );
          }

          // 3. Inactive / Rejected → Gửi yêu cầu duyệt
          if (rewardStatus === 'inactive' || rewardStatus === 'rejected') {
            return (
              <Button
                data-testid="claim-cta"
                onClick={handleRequestApproval}
                disabled={isRequestingApproval || walletSecurity?.isBlocked}
                className="w-full py-6 text-base rounded-xl font-bold shadow-lg transition-all bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 text-white hover:shadow-xl hover:scale-[1.01]"
              >
                {isRequestingApproval ? (
                  <span className="flex items-center gap-2">
                    <Loader2 className="w-5 h-5 animate-spin" />{t('crsSendingRequest')}
                  </span>
                ) : (
                  <span className="flex items-center gap-2">
                    <Send className="w-5 h-5" />
                    {rewardStatus === 'rejected' ? t('crsSendRequestAgain') : t('crsSendRequestToClaim')}
                  </span>
                )}
              </Button>
            );
          }

          // 4. Pending Admin duyệt
          if (rewardStatus === 'pending') {
            return (
              <Button
                data-testid="claim-cta"
                onClick={() => setAdminMessage(adminMessage || t('crsPresetAdminMessage'))}
                aria-disabled="true"
                className="w-full py-6 text-base rounded-xl font-bold shadow-lg bg-gradient-to-r from-yellow-400 to-amber-400 text-white"
                title={t('crsWaitingCtaTitle')}
              >
                <Clock className="w-5 h-5 mr-2" />
                {t('crsWaitingCtaLabel')}
              </Button>
            );
          }

          // 5. On hold
          if (rewardStatus === 'on_hold') {
            return (
              <Button
                data-testid="claim-cta"
                aria-disabled="true"
                disabled
                className="w-full py-6 text-base rounded-xl font-bold shadow-lg bg-amber-200 text-amber-800"
                title={adminNotes || t('crsOnHoldCtaTitle')}
              >
                <AlertTriangle className="w-5 h-5 mr-2" />
                {t('crsOnHoldCtaLabel')}
              </Button>
            );
          }

          // 5b. Banned
          if (rewardStatus === 'banned') {
            return (
              <Button
                data-testid="claim-cta"
                aria-disabled="true"
                disabled
                className="w-full py-6 text-base rounded-xl font-bold shadow-lg bg-red-200 text-red-800"
                title={adminNotes || t('crsBannedCtaTitle')}
              >
                <ShieldAlert className="w-5 h-5 mr-2" />
                {t('crsBannedCtaLabel')}
              </Button>
            );
          }

          // 6. Wallet blocked
          if (walletSecurity?.isBlocked) {
            return (
              <Button
                data-testid="claim-cta"
                aria-disabled="true"
                disabled
                className="w-full py-6 text-base rounded-xl font-bold shadow-lg bg-red-200 text-red-800"
                title={t('crsBlockedCtaTitle')}
              >
                <ShieldAlert className="w-5 h-5 mr-2" />
                {t('crsBlockedCtaLabel')}
              </Button>
            );
          }

          // 7. Wallet frozen
          if (walletSecurity?.isFrozen) {
            return (
              <Button
                data-testid="claim-cta"
                aria-disabled="true"
                disabled
                className="w-full py-6 text-base rounded-xl font-bold shadow-lg bg-red-100 text-red-700"
                title={t('crsFrozenCtaTitle', { hours: walletSecurity.freezeHoursLeft })}
              >
                <Lock className="w-5 h-5 mr-2" />
                {t('crsFrozenCtaLabel', { hours: walletSecurity.freezeHoursLeft })}
              </Button>
            );
          }

          // 8. Có lệnh claim đang chờ
          if (hasPendingClaim) {
            return (
              <Button
                data-testid="claim-cta"
                aria-disabled="true"
                disabled
                className="w-full py-6 text-base rounded-xl font-bold shadow-lg bg-amber-100 text-amber-800 border border-amber-300"
                title={t('crsPendingCtaTitle', { count: activePendingClaims?.length })}
              >
                <Clock className="w-5 h-5 mr-2" />
                {t('crsPendingCtaLabel', { count: activePendingClaims?.length })}
              </Button>
            );
          }

          // 9. Daily exhausted
          if (dailyExhausted) {
            return (
              <Button
                data-testid="claim-cta"
                aria-disabled="true"
                disabled
                className="w-full py-6 text-base rounded-xl font-bold shadow-lg bg-gray-200 text-gray-700"
                title={t('crsDailyDoneTitle')}
              >
                <Clock className="w-5 h-5 mr-2" />
                {t('crsDailyDoneLabel')}
              </Button>
            );
          }

          // 10. Below threshold (approved nhưng chưa đủ 200K)
          if (rewardStatus === 'approved' && belowThreshold) {
            const needed = MINIMUM_THRESHOLD - claimableReward;
            return (
              <Button
                data-testid="claim-cta"
                aria-disabled="true"
                disabled
                className="w-full py-6 text-base rounded-xl font-bold shadow-lg bg-white text-orange-700 border-2 border-orange-300"
                title={t('crsNeedMoreTitle', { needed: formatNumber(needed), threshold: formatNumber(MINIMUM_THRESHOLD) })}
              >
                <Gift className="w-5 h-5 mr-2" />
                {t('crsNeedMoreLabel', { needed: formatNumber(needed) })}
              </Button>
            );
          }

          // 11. Ready → Claim
          if (rewardStatus === 'approved' && claimableReward >= MINIMUM_THRESHOLD) {
            return (
              <Button
                data-testid="claim-cta"
                onClick={handleClaimClick}
                className="w-full py-6 text-base rounded-xl font-bold shadow-lg transition-all bg-gradient-to-r from-yellow-500 to-amber-500 hover:from-yellow-600 hover:to-amber-600 text-white hover:shadow-xl hover:scale-[1.01]"
              >
                <Gift className="w-5 h-5 mr-2" />
                {t('crsClaimAmount', { amount: formatNumber(claimableReward) })}
              </Button>
            );
          }

          // Fallback an toàn — không bao giờ ẩn nút
          return (
            <Button
              data-testid="claim-cta"
              aria-disabled="true"
              disabled
              className="w-full py-6 text-base rounded-xl font-bold shadow-lg bg-gray-200 text-gray-700"
              title={t('crsStatusFallbackTitle', { status: rewardStatus })}
            >
              <Info className="w-5 h-5 mr-2" />
              {t('crsStatusFallbackLabel', { status: rewardStatus })}
            </Button>
          );
        })()}

        {/* Debug badge — chỉ hiện khi ?debug=claim */}
        {typeof window !== 'undefined' && new URLSearchParams(window.location.search).get('debug') === 'claim' && (
          <div className="text-[10px] font-mono bg-slate-900 text-slate-100 rounded-lg p-2 space-y-0.5">
            <div>status: <b>{rewardStatus}</b></div>
            <div>isConnected: <b>{String(isConnected)}</b></div>
            <div>claimable: <b>{claimableReward}</b> / min {MINIMUM_THRESHOLD}</div>
            <div>dailyClaimed: <b>{dailyClaimed}</b> / cap {DAILY_LIMIT}</div>
            <div>pendingClaims: <b>{activePendingClaims?.length ?? 0}</b></div>
            <div>frozen: <b>{String(!!walletSecurity?.isFrozen)}</b> / blocked: <b>{String(!!walletSecurity?.isBlocked)}</b></div>
          </div>
        )}

        {/* Progress Bars */}
        <div className="space-y-3">
          {/* Minimum Threshold */}
          <div>
            <div className="flex justify-between items-center mb-1.5">
              <span className="text-xs text-muted-foreground font-medium">{t('crsMinThresholdLabel')}</span>
              <span className="text-xs font-semibold text-gray-700">
                {formatNumber(Math.min(claimableReward, MINIMUM_THRESHOLD))} / {formatNumber(MINIMUM_THRESHOLD)} CAMLY
              </span>
            </div>
            <Progress value={minThresholdProgress} className="h-2.5 bg-gray-100" />
            {claimableReward < MINIMUM_THRESHOLD && (
              <p className="text-xs text-orange-600 mt-1">
                {t('crsMinThresholdNote', { amount: formatNumber(MINIMUM_THRESHOLD) })}
              </p>
            )}
          </div>

          {/* Daily Limit */}
          <div>
            <div className="flex justify-between items-center mb-1.5">
              <span className="text-xs text-muted-foreground font-medium">{t('crsDailyLimitLabel')}</span>
              <span className="text-xs font-semibold text-gray-700">
                {formatNumber(dailyClaimed)} / {formatNumber(DAILY_LIMIT)} CAMLY
              </span>
            </div>
            <Progress value={dailyProgress} className="h-2.5 bg-gray-100" />
            {dailyRemaining <= 0 && (
              <p className="text-xs text-red-600 mt-1">
                {t('crsDailyExhaustedNote')}
              </p>
            )}
          </div>
        </div>

        {/* Bảng Điều Kiện Claim Thưởng */}
        {(() => {
          const conditions = [
            { label: t('crsFullNameCond'), met: hasFullName },
            { label: t('crsAvatarRealPhoto'), met: hasAvatar },
            { label: t('crsCoverPhoto'), met: hasCover },
            { label: t('crsSocialLinksCond'), met: hasSocialLinks },
            { label: t('crsPostTodayCond'), met: hasTodayPost },
            { label: t('crsConnectWalletCond'), met: isConnected },
            { label: t('crsAccountAge7Days'), met: accountAgeDays >= 7 },
            { label: t('crsAdminApprovedCond'), met: rewardStatus === 'approved' || rewardStatus === 'claimed' },
            { label: t('crsMinAmountCond', { amount: formatNumber(MINIMUM_THRESHOLD) }), met: claimableReward >= MINIMUM_THRESHOLD },
            { label: t('crsDailyCapCond', { amount: formatNumber(DAILY_LIMIT) }), met: dailyClaimed < DAILY_LIMIT },
          ];
          const metCount = conditions.filter(c => c.met).length;
          const total = conditions.length;
          const allMet = metCount === total;
          const progressPercent = Math.round((metCount / total) * 100);
          const needsProfileUpdate = !hasFullName || !hasAvatar || !hasCover || !hasSocialLinks;

          return (
            <div className={`border rounded-xl overflow-hidden ${allMet ? 'border-green-300 bg-green-50/50' : 'border-orange-200 bg-orange-50/30'}`}>
              <div className={`px-3.5 py-2.5 flex items-center justify-between ${allMet ? 'bg-green-100/60' : 'bg-orange-100/60'}`}>
                <div className="flex items-center gap-2">
                  <ClipboardCheck className={`w-4 h-4 ${allMet ? 'text-green-600' : 'text-orange-600'}`} />
                  <span className={`text-sm font-semibold ${allMet ? 'text-green-800' : 'text-orange-800'}`}>
                    {t('crsConditionsTitle')}
                  </span>
                </div>
                <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${allMet ? 'bg-green-200 text-green-800' : 'bg-orange-200 text-orange-800'}`}>
                  {metCount}/{total}
                </span>
              </div>

              <div className="px-3.5 pt-2 pb-1">
                <Progress value={progressPercent} className={`h-1.5 ${allMet ? 'bg-green-100' : 'bg-orange-100'}`} />
                <p className={`text-[10px] mt-1 text-right ${allMet ? 'text-green-600' : 'text-orange-500'}`}>{progressPercent}%</p>
              </div>

              <div className="px-3.5 pb-3 space-y-1.5">
                {conditions.map((c, i) => (
                  <div key={i} className="flex items-center gap-2 text-xs">
                    <span className={c.met ? 'text-green-600' : 'text-red-500'}>{c.met ? '✅' : '❌'}</span>
                    <span className={c.met ? 'text-green-700' : 'text-orange-700'}>{c.label}</span>
                  </div>
                ))}
              </div>

              {allMet && (
                <div className="px-3.5 pb-3">
                  <div className="flex items-center gap-2 bg-green-100 rounded-lg px-3 py-2">
                    <PartyPopper className="w-4 h-4 text-green-600" />
                    <span className="text-sm font-semibold text-green-800">{t('crsReadyToClaim')}</span>
                  </div>
                </div>
              )}

              {needsProfileUpdate && (
                <div className="px-3.5 pb-3">
                  <Button
                    variant="outline"
                    size="sm"
                    className="w-full border-orange-300 text-orange-700 hover:bg-orange-100"
                    onClick={() => navigate('/profile')}
                  >
                    {t('crsUpdateProfile')}
                  </Button>
                </div>
              )}
            </div>
          );
        })()}
      </CardContent>
    </Card>
  );
};

import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Sparkles, Gift, Loader2, Rocket, RefreshCw, Calendar, TrendingUp, Users, Lock, CheckCircle2, ExternalLink, AlertTriangle, Clock, Wallet as WalletIcon } from 'lucide-react';
import { useEpochAllocation, EpochWithAllocation } from '@/hooks/useEpochAllocation';
import { useLinkedWallet } from '@/hooks/useLinkedWallet';
import { formatFUN } from '@/config/pplp';
import funLogo from '@/assets/tokens/fun-logo.png';
import { useLanguage } from '@/i18n/LanguageContext';
import { Link } from 'react-router-dom';
import { MintBlockedAlert } from '@/components/wallet/MintBlockedAlert';
import { CASCADE_CONFIG } from '@/config/cascade-constants';

interface ClaimRewardsCardProps {
  onClaimSuccess?: (requestId: string) => void;
}

const getEpochStatusInfo = (status: string | undefined) => {
  switch (status) {
    case 'snapshot':
      return { labelKey: 'walletReadyToClaim', color: 'bg-green-50 text-green-700 border-green-200 dark:bg-green-950/30 dark:text-green-400 dark:border-green-800', emoji: '✅' };
    case 'finalized':
      return { labelKey: 'crcEpochFinalized', color: 'bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-950/30 dark:text-blue-400 dark:border-blue-800', emoji: '🔒' };
    default:
      return { labelKey: 'crcEpochAccumulating', color: 'bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-950/30 dark:text-amber-400 dark:border-amber-800', emoji: '⏳' };
  }
};

const formatMonth = (epochMonth: string, t: (key: string, params?: Record<string, string | number>) => string) => {
  if (!epochMonth) return '';
  const [y, m] = epochMonth.split('-');
  return t('crcMonthShort', { month: parseInt(m), year: y });
};

const EpochBlock = ({ epochData, onClaim, isClaiming, hasLinkedWallet }: { epochData: EpochWithAllocation; onClaim: (id: string) => void; isClaiming: boolean; hasLinkedWallet: boolean }) => {
  const { epoch, allocation } = epochData;
  const { t } = useLanguage();
  const epochStatus = getEpochStatusInfo(epoch.status);
  const canClaim = allocation && allocation.is_eligible && allocation.status === 'pending' && allocation.allocation_amount_capped > 0;
  const reqStatus = allocation?.mint_request_status;
  const isMinted = reqStatus === 'confirmed' || reqStatus === 'split_parent' || allocation?.status === 'minted' || !!allocation?.mint_tx_hash;
  const isOnChainPending = reqStatus === 'submitted' || reqStatus === 'signing';
  const isAwaitingSig = reqStatus === 'pending_sig' || reqStatus === 'signed' || (allocation?.status === 'claimed' && !reqStatus);
  const isMintFailed = reqStatus === 'failed' || reqStatus === 'rejected';
  const sigCount = allocation?.mint_completed_groups?.length ?? 0;

  return (
    <div className="rounded-lg border border-border p-3.5 space-y-3">
      <div className="flex items-center gap-2">
        <TrendingUp className="w-4 h-4 text-muted-foreground" />
        <span className="font-semibold text-sm text-foreground">{formatMonth(epoch.epoch_month, t)}</span>
        <Badge variant="outline" className={`${epochStatus.color} text-[10px]`}>
          {epochStatus.emoji} {t(epochStatus.labelKey)}
        </Badge>
      </div>

      <div className="grid grid-cols-3 gap-2">
        <div className="text-center p-2 rounded-md bg-muted/40">
          <div className="font-bold text-sm text-foreground">{formatFUN(epoch.mint_pool)}</div>
          <div className="text-[10px] text-muted-foreground">Pool</div>
        </div>
        <div className="text-center p-2 rounded-md bg-muted/40">
          <div className="font-bold text-sm text-foreground">{formatFUN(epoch.total_light_score)}</div>
          <div className="text-[10px] text-muted-foreground">Total Light</div>
        </div>
        <div className="text-center p-2 rounded-md bg-muted/40">
          <div className="font-bold text-sm text-foreground flex items-center justify-center gap-1">
            <Users className="w-3 h-3" />{epoch.eligible_users}
          </div>
          <div className="text-[10px] text-muted-foreground">Users</div>
        </div>
      </div>

      {allocation ? (
        <div className="border-t border-border pt-3 space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <div className="text-[11px] text-muted-foreground">{t('crcYourLightScore')}</div>
              <div className="text-lg font-bold text-foreground">{formatFUN(allocation.light_score_total)}</div>
            </div>
            <div>
              <div className="text-[11px] text-muted-foreground">{t('crcSharePercent')}</div>
              <div className="text-lg font-bold text-foreground">{allocation.share_percent.toFixed(2)}%</div>
            </div>
          </div>

          {!allocation.is_eligible && (
            <div className="bg-destructive/10 border border-destructive/20 rounded-md p-2.5 text-sm text-destructive">
              {t('crcNotEligible', { reasons: allocation.reason_codes.join(', ') })}
            </div>
          )}

          <div className="flex items-center justify-between bg-primary/5 rounded-lg p-3 border border-primary/10">
            <span className="font-semibold text-sm text-foreground">{t('crcFunAllocated')}</span>
            <div className="flex items-center gap-2">
              <img src={funLogo} alt="FUN" className="w-5 h-5 rounded-full" />
              <span className="text-xl font-bold text-amber-600">{formatFUN(allocation.allocation_amount_capped)} FUN</span>
            </div>
          </div>

          {isMinted ? (
            <div className="text-center py-2 space-y-1.5">
              <Badge variant="outline" className="bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/30 dark:text-emerald-400 dark:border-emerald-800">
                <CheckCircle2 className="w-3 h-3 mr-1" /> {t('crcMintedSuccess')}
              </Badge>
              {allocation?.mint_tx_hash && (
                <a
                  href={`https://testnet.bscscan.com/tx/${allocation.mint_tx_hash}`}
                  target="_blank" rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 text-[11px] text-primary hover:underline"
                >
                  {t('viewTransaction')} <ExternalLink className="w-3 h-3" />
                </a>
              )}
            </div>
          ) : isOnChainPending ? (
            <div className="text-center py-2">
              <Badge variant="outline" className="bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-950/30 dark:text-blue-400 dark:border-blue-800">
                <Loader2 className="w-3 h-3 mr-1 animate-spin" /> {t('crcSendingToChain')}
              </Badge>
            </div>
          ) : isMintFailed ? (
            <div className="space-y-2">
              <div className="text-center">
                <Badge variant="outline" className="bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-950/30 dark:text-amber-400 dark:border-amber-800">
                  <AlertTriangle className="w-3 h-3 mr-1" /> {t('crcMintCancelled')}
                </Badge>
              </div>
              {hasLinkedWallet ? (
                <Button
                  onClick={() => onClaim(allocation!.id)}
                  disabled={isClaiming}
                  className="w-full bg-primary hover:bg-primary/90 text-primary-foreground font-bold py-5"
                >
                  {isClaiming ? (
                    <><Loader2 className="w-4 h-4 mr-2 animate-spin" />{t('walletProcessing')}</>
                  ) : (
                    <><Rocket className="w-4 h-4 mr-2" />{t('crcClaimAgain', { amount: formatFUN(allocation!.allocation_amount_capped) })}</>
                  )}
                </Button>
              ) : (
                <Link to="/wallet/asset" className="block">
                  <Button variant="outline" size="sm" className="w-full border-amber-400 text-amber-800 dark:text-amber-300 hover:bg-amber-100 dark:hover:bg-amber-900/40">
                    <WalletIcon className="w-3.5 h-3.5 mr-2" /> {t('crcLinkWalletClaimAgain')}
                  </Button>
                </Link>
              )}
            </div>
          ) : isAwaitingSig ? (
            <div className="text-center py-2">
              <Badge variant="outline" className="bg-violet-50 text-violet-700 border-violet-200 dark:bg-violet-950/30 dark:text-violet-400 dark:border-violet-800">
                <Clock className="w-3 h-3 mr-1" /> {t('crcAwaitingSignature', { signed: sigCount })}
              </Badge>
            </div>
          ) : canClaim ? (
            hasLinkedWallet ? (
              <Button
                onClick={() => onClaim(allocation.id)}
                disabled={isClaiming}
                className="w-full bg-primary hover:bg-primary/90 text-primary-foreground font-bold py-5"
              >
                {isClaiming ? (
                  <><Loader2 className="w-4 h-4 mr-2 animate-spin" />{t('walletProcessing')}</>
                ) : (
                  <><Rocket className="w-4 h-4 mr-2" />{t('crcClaimFun', { amount: formatFUN(allocation.allocation_amount_capped) })}</>
                )}
              </Button>
            ) : (
              <div className="rounded-md border border-amber-300 dark:border-amber-800 bg-amber-50 dark:bg-amber-950/30 p-3 space-y-2">
                <div className="flex items-start gap-2 text-xs text-amber-800 dark:text-amber-300 leading-relaxed">
                  <AlertTriangle className="w-4 h-4 flex-shrink-0 mt-0.5" />
                  <div>
                    <strong>{t('crcMintBlockedTitle')}</strong>{t('crcMintBlockedBefore')}<strong>{formatFUN(allocation.allocation_amount_capped)} FUN</strong>{t('crcMintBlockedMid')}<strong>BSC</strong>{t('crcMintBlockedAfter')}
                  </div>
                </div>
                <Link to="/wallet/asset" className="block">
                  <Button variant="outline" size="sm" className="w-full border-amber-400 text-amber-800 dark:text-amber-300 hover:bg-amber-100 dark:hover:bg-amber-900/40">
                    <WalletIcon className="w-3.5 h-3.5 mr-2" /> {t('crcLinkWalletToClaim')}
                  </Button>
                </Link>
              </div>
            )
          ) : null}
        </div>
      ) : (
        <p className="text-center py-2 text-sm text-muted-foreground">{t('crcNoAllocation')}</p>
      )}
    </div>
  );
};

export const ClaimRewardsCard = ({ onClaimSuccess }: ClaimRewardsCardProps) => {
  const { currentMonth, allEpochs, isLoading, refetch, claim, isClaiming, lastBlock, clearBlock } = useEpochAllocation();
  const { linkedWalletAddress } = useLinkedWallet();
  const hasLinkedWallet = !!linkedWalletAddress;
  const [isRefreshing, setIsRefreshing] = useState(false);
  const { t } = useLanguage();

  // Tổng FUN đang chờ (allocations pending mà user chưa claim được)
  const totalPendingFun = allEpochs.reduce((sum, e) => {
    const a = e.allocation;
    if (a && a.is_eligible && a.status === 'pending' && a.allocation_amount_capped > 0) {
      return sum + Number(a.allocation_amount_capped);
    }
    return sum;
  }, 0);

  const handleRefresh = async () => {
    setIsRefreshing(true);
    await refetch();
    setTimeout(() => setIsRefreshing(false), 500);
  };

  const handleClaim = async (allocationId: string) => {
    const result = await claim(allocationId);
    if (result.success && result.requestId && onClaimSuccess) {
      onClaimSuccess(result.requestId);
    }
  };

  if (isLoading) {
    return (
      <Card className="shadow-md border-border">
        <CardContent className="py-12 text-center">
          <Loader2 className="w-6 h-6 mx-auto animate-spin text-primary" />
          <p className="text-muted-foreground mt-2 text-sm">{t('walletLoadingActions')}</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="shadow-md border-border overflow-hidden">
      <CardHeader className="pb-3 border-b border-border">
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2 text-base">
            <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center">
              <Sparkles className="w-4 h-4 text-primary" />
            </div>
            Epoch Minting
          </CardTitle>
          <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground hover:text-foreground" onClick={handleRefresh} disabled={isLoading || isRefreshing}>
            <RefreshCw className={`w-4 h-4 ${isRefreshing ? 'animate-spin' : ''}`} />
          </Button>
        </div>
      </CardHeader>

      <CardContent className="pt-4 space-y-4">
        {/* Mint blocked alert (pending request / generic / no wallet / soft ceiling từ lần claim gần nhất) */}
        {lastBlock && (
          <MintBlockedAlert
            reason={lastBlock.reason}
            message={lastBlock.message}
            existingRequestId={lastBlock.existingRequestId}
            rawAmount={lastBlock.rawAmount}
            cappedAmount={lastBlock.cappedAmount}
            softCeiling={lastBlock.softCeiling}
            onRetry={clearBlock}
          />
        )}

        {/* Pre-emptive SOFT_CEILING banner: phát hiện allocation pending bị cắt trước cả khi user bấm claim */}
        {!lastBlock && (() => {
          const cutAlloc = allEpochs.find(e =>
            e.allocation &&
            e.allocation.status === 'pending' &&
            e.allocation.is_eligible &&
            e.allocation.allocation_amount - e.allocation.allocation_amount_capped > 1
          )?.allocation;
          if (!cutAlloc) return null;
          return (
            <MintBlockedAlert
              reason="SOFT_CEILING"
              message={t('crcSoftCeilingCut')}
              rawAmount={cutAlloc.allocation_amount}
              cappedAmount={cutAlloc.allocation_amount_capped}
              softCeiling={CASCADE_CONFIG.softCeiling}
            />
          );
        })()}

        {/* Banner: chưa liên kết ví — giải thích vì sao chưa mint được */}
        {!hasLinkedWallet && totalPendingFun > 0 && (
          <div className="rounded-lg border border-amber-300 dark:border-amber-800 bg-gradient-to-br from-amber-50 to-orange-50 dark:from-amber-950/30 dark:to-orange-950/20 p-3.5 space-y-2.5">
            <div className="flex items-center gap-2">
              <WalletIcon className="w-4 h-4 text-amber-700 dark:text-amber-400" />
              <span className="font-semibold text-sm text-amber-900 dark:text-amber-200">{t('crcPendingMintTitle', { amount: formatFUN(totalPendingFun) })}</span>
            </div>
            <p className="text-xs text-amber-800 dark:text-amber-300 leading-relaxed">
              {t('crcPendingMintBefore')}<strong>{t('crcAllocatedFunStrong')}</strong>{t('crcPendingMintMid1')}<strong>BSC</strong>{t('crcPendingMintMid2')}<strong>{t('crcWeb3WalletAddressStrong')}</strong>{t('crcPendingMintMid3')}<em>{t('crcClaimRightEm')}</em>{t('crcPendingMintAfter')}
            </p>
            <Link to="/wallet/asset">
              <Button size="sm" className="w-full bg-amber-600 hover:bg-amber-700 text-white">
                <WalletIcon className="w-3.5 h-3.5 mr-2" /> {t('crcLinkWeb3WalletNow')}
              </Button>
            </Link>
          </div>
        )}

        {/* Current Month */}
        <div className="rounded-lg border border-border p-3.5 space-y-3">
          <div className="flex items-center gap-2">
            <Calendar className="w-4 h-4 text-muted-foreground" />
            <span className="font-semibold text-sm text-foreground">{formatMonth(currentMonth.epoch_month, t)}</span>
            <Badge variant="outline" className="bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-950/30 dark:text-amber-400 dark:border-amber-800 text-[10px]">
              ⏳ {t('crcEpochAccumulating')}
            </Badge>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="rounded-md bg-muted/40 p-2.5 text-center">
              <div className="text-lg font-bold text-foreground">{formatFUN(currentMonth.total_light_score)}</div>
              <div className="text-[10px] text-muted-foreground">Light Score</div>
            </div>
            <div className="rounded-md bg-muted/40 p-2.5 text-center">
              <div className="text-lg font-bold text-foreground">{currentMonth.actions_count}</div>
              <div className="text-[10px] text-muted-foreground">Actions</div>
            </div>
          </div>
          <div className="rounded-md bg-amber-50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-900/40 p-2.5 text-xs text-amber-800 dark:text-amber-300 leading-relaxed">
            {t('crcCycleNoteBefore')}<strong>{t('crcCycleNoteStrong')}</strong>{t('crcCycleNoteAfter')}
          </div>
        </div>

        {/* All Epochs */}
        {allEpochs.length > 0 ? (
          allEpochs.map((epochData) => (
            <EpochBlock key={epochData.epoch.id} epochData={epochData} onClaim={handleClaim} isClaiming={isClaiming} hasLinkedWallet={hasLinkedWallet} />
          ))
        ) : (
          <div className="text-center py-8">
            <Gift className="w-10 h-10 mx-auto text-muted-foreground/40 mb-3" />
            <p className="text-sm text-muted-foreground">{t('crcNoEpochSnapshot')}</p>
            <p className="text-xs text-muted-foreground mt-1">{t('crcKeepEarning')}</p>
          </div>
        )}
      </CardContent>
    </Card>
  );
};

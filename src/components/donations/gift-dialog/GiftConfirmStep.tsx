/**
 * SR-2: Gift Dialog — Confirm Step (Step 2)
 * Extracted from UnifiedGiftSendDialog.
 */

import { useEffect, useState } from 'react';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import {
  Loader2, Copy, AlertTriangle, ExternalLink,
  CheckCircle2, RefreshCw, ArrowLeft, Shield, Users, AlertCircle, X, Smartphone,
} from 'lucide-react';
import { getChainDisplayName, BTC_MAINNET } from '@/lib/chainTokenMapping';
import type { TokenOption } from '@/components/donations/TokenSelector';
import type { ResolvedRecipient, MultiSendResult } from './types';
import { BtcWalletPanel } from './BtcWalletPanel';
import { useLanguage } from '@/i18n/LanguageContext';

interface SenderProfile {
  username: string;
  display_name: string | null;
  avatar_url: string | null;
  btc_address?: string | null;
}

export interface GiftConfirmStepProps {
  senderProfile: SenderProfile | null;
  address: string | undefined;
  selectedToken: TokenOption;
  amount: string;
  parsedAmountNum: number;
  totalAmount: number;
  totalEstimatedUsd: number;
  selectedTokenPrice: number | null;
  isMultiMode: boolean;
  selectedChainId: number;
  recipientsWithWallet: ResolvedRecipient[];
  customMessage: string;
  multiSendProgress: { current: number; total: number; results: MultiSendResult[] } | null;
  isMultiSending: boolean;
  currentSendingIndex: number;
  txStep: string;
  stepInfo: { label: string; progress: number };
  isInProgress: boolean;
  isPending: boolean;
  txHash: string | undefined;
  scanUrl: string | null;
  isSendDisabled: boolean;
  onSend: () => void;
  onGoBack: () => void;
  onClose: () => void;
  onRecheckReceipt: () => void;
  onCopyAddress: (addr: string) => void;
  /** Reset toàn bộ state gửi (dùng khi MetaMask không phản hồi trên mobile). Optional. */
  onForceCancel?: () => void;
  /** Mobile: mở lại app ví (deep-link) khi user lỡ tay swipe khỏi ví. Optional. */
  onReopenWallet?: () => void;
  // BTC panel props
  isBtcSigning?: boolean;
  btcBip21Url?: string;
  btcRecipientAddress?: string;
  btcAmount?: string;
  btcPollingStatus?: 'idle' | 'polling' | 'found' | 'timeout';
  btcTxid?: string | null;
  onBtcMarkManualSend?: () => void;
  btcManualConfirmEnabled?: boolean;
  onBtcCancelPolling?: () => void;
}

export function GiftConfirmStep(props: GiftConfirmStepProps) {
  const { t } = useLanguage();
  const {
    senderProfile, address,
    selectedToken, amount, parsedAmountNum, totalAmount, totalEstimatedUsd, selectedTokenPrice,
    isMultiMode, selectedChainId, recipientsWithWallet,
    customMessage,
    multiSendProgress, isMultiSending, currentSendingIndex,
    txStep, stepInfo, isInProgress, isPending, txHash, scanUrl,
    isSendDisabled, onSend, onGoBack, onClose, onRecheckReceipt, onCopyAddress, onForceCancel, onReopenWallet,
  } = props;

  const isBtcConfirm = selectedChainId === BTC_MAINNET;
  const senderDisplayAddr = isBtcConfirm ? senderProfile?.btc_address : address;

  // Hiển thị nút "Huỷ giao dịch" sau 8s khi vẫn đang ở 'signing' (MetaMask đứng im trên mobile)
  const [showForceCancel, setShowForceCancel] = useState(false);
  useEffect(() => {
    if (txStep === 'signing') {
      setShowForceCancel(false);
      const timer = setTimeout(() => setShowForceCancel(true), 8000);
      return () => clearTimeout(timer);
    }
    setShowForceCancel(false);
  }, [txStep]);

  return (
    <div className="space-y-3 sm:space-y-4 py-2">
      <div className="bg-muted/30 rounded-xl p-3 sm:p-4 space-y-3 sm:space-y-4 border">
        {/* Sender */}
        <div className="flex items-center gap-3">
          <Avatar className="w-10 h-10 border-2 border-primary/30">
            <AvatarImage src={senderProfile?.avatar_url || ''} />
            <AvatarFallback className="bg-primary/20 text-primary">{senderProfile?.username?.[0]?.toUpperCase() || '?'}</AvatarFallback>
          </Avatar>
          <div className="flex-1 min-w-0">
            <p className="font-medium text-sm">{senderProfile?.display_name || senderProfile?.username}</p>
            <p className="text-xs text-muted-foreground">@{senderProfile?.username}</p>
            {senderDisplayAddr && (
              <div className="flex items-center gap-1">
                <span className="text-xs text-muted-foreground font-mono break-all">{senderDisplayAddr.slice(0, 8)}...{senderDisplayAddr.slice(-6)}</span>
                <button type="button" onClick={() => onCopyAddress(senderDisplayAddr)} className="p-0.5 hover:bg-muted rounded shrink-0"><Copy className="w-3 h-3 text-muted-foreground" /></button>
              </div>
            )}
          </div>
        </div>

        {/* Arrow + Amount */}
        <div className="flex items-center justify-center gap-2 py-1.5">
          <div className="h-px flex-1 bg-border" />
          <div className="flex flex-col items-center gap-1 px-4 py-2 rounded-full bg-gradient-to-r from-gold/20 to-amber-500/20 border border-gold/50">
            <span className="text-lg font-bold text-amber-800">
              {isMultiMode
                ? `${Number(amount).toLocaleString(undefined, { maximumFractionDigits: 8 })} × ${recipientsWithWallet.length}`
                : Number(amount).toLocaleString(undefined, { maximumFractionDigits: 8 })
              } {selectedToken.symbol}
            </span>
            {isMultiMode && (
              <span className="text-xs text-amber-700 font-medium">{t('totalLabel')} {totalAmount.toLocaleString(undefined, { maximumFractionDigits: 8 })} {selectedToken.symbol}</span>
            )}
            {selectedTokenPrice && totalEstimatedUsd > 0 && (
              <span className="text-xs text-amber-600">≈ ${totalEstimatedUsd.toFixed(2)} USD</span>
            )}
          </div>
          <div className="h-px flex-1 bg-border" />
        </div>

        {/* Recipients */}
        {isMultiMode ? (
          <div>
            <div className="flex items-center gap-2 mb-2">
              <Users className="w-4 h-4 text-gold" />
              <span className="text-sm font-medium">{recipientsWithWallet.length} {t('recipientsPerPerson')} {Number(amount).toLocaleString(undefined, { maximumFractionDigits: 8 })} {selectedToken.symbol}</span>
            </div>
            <div className="max-h-40 overflow-y-auto space-y-1.5 pr-1">
              {recipientsWithWallet.map((recipient, idx) => {
                const result = multiSendProgress?.results.find(r => r.recipient.id === recipient.id);
                const isSendingNow = currentSendingIndex === idx && isMultiSending && !result;
                return (
                  <div key={recipient.id} className={`flex items-center gap-2.5 p-2 rounded-lg border ${
                    result?.success ? 'bg-emerald-50 border-emerald-200' :
                    result && !result.success ? 'bg-destructive/5 border-destructive/20' :
                    isSendingNow ? 'bg-primary/5 border-primary/30' : 'bg-muted/30'
                  }`}>
                    <Avatar className="w-8 h-8 border border-gold/20">
                      <AvatarImage src={recipient.avatarUrl || ''} />
                      <AvatarFallback className="bg-primary/20 text-primary text-xs">{recipient.username[0]?.toUpperCase()}</AvatarFallback>
                    </Avatar>
                    <div className="flex-1 min-w-0">
                      <p className="font-medium text-sm truncate">{recipient.displayName || recipient.username}</p>
                      <p className="text-[10px] text-muted-foreground truncate">@{recipient.username}</p>
                      {result?.txHash && <p className="text-[10px] text-emerald-600 font-mono truncate">{result.txHash.slice(0, 10)}...</p>}
                      {result?.error && <p className="text-[10px] text-destructive truncate">{result.error}</p>}
                    </div>
                    {result?.success && <CheckCircle2 className="w-4 h-4 text-emerald-500 shrink-0" />}
                    {result && !result.success && <AlertCircle className="w-4 h-4 text-destructive shrink-0" />}
                    {isSendingNow && <Loader2 className="w-4 h-4 animate-spin text-primary shrink-0" />}
                  </div>
                );
              })}
            </div>
          </div>
        ) : (
          <SingleRecipientDisplay recipient={recipientsWithWallet[0]} onCopyAddress={onCopyAddress} isBtc={isBtcConfirm} />
        )}

        {/* Message */}
        {customMessage && (
          <div className="bg-white/80 rounded-lg p-2 sm:p-3 border">
            <p className="text-sm text-muted-foreground mb-1">{t('messageNoteLabel')}</p>
            <p className="text-sm italic">"{customMessage}"</p>
          </div>
        )}

        {/* Chain info */}
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Shield className="w-4 h-4" />
          <span>Chain: {getChainDisplayName(selectedChainId)}</span>
        </div>
      </div>

      {/* Warning */}
      <div className={`flex items-start gap-2 p-2 sm:p-3 rounded-lg border ${
        isMultiMode && recipientsWithWallet.length > 20
          ? 'bg-destructive/10 border-destructive/40'
          : 'bg-amber-500/10 border-amber-500/30'
      }`}>
        <AlertTriangle className={`w-4 h-4 shrink-0 mt-0.5 ${
          isMultiMode && recipientsWithWallet.length > 20 ? 'text-destructive' : 'text-amber-600'
        }`} />
        <div className="text-xs font-medium space-y-0.5">
          <p className={isMultiMode && recipientsWithWallet.length > 20 ? 'text-destructive' : 'text-amber-700'}>
            {isMultiMode
              ? `Bạn sắp ký ${recipientsWithWallet.length} giao dịch liên tiếp trong ví — không thể hoàn tác.`
              : t('singleSendWarning')
            }
          </p>
          {isMultiMode && recipientsWithWallet.length > 20 && (
            <p className="text-destructive/80 font-normal">
              Hãy chuẩn bị bấm "Confirm" {recipientsWithWallet.length} lần. Không đóng dialog giữa chừng.
            </p>
          )}
        </div>
      </div>

      {/* Multi-send progress */}
      {multiSendProgress && (
        <div className="space-y-2">
          <div className="flex items-center gap-2">
            {isMultiSending
              ? <Loader2 className="w-4 h-4 animate-spin text-primary shrink-0" />
              : <CheckCircle2 className="w-4 h-4 text-primary shrink-0" />
            }
            <p className="text-sm font-medium">
              {isMultiSending
                ? `${t('sendingProgress')} ${multiSendProgress.current}/${multiSendProgress.total}...`
                : `${t('completedProgress')} ${multiSendProgress.results.filter(r => r.success).length}/${multiSendProgress.total} ${t('multiTransaction')}`
              }
            </p>
          </div>
          <Progress value={(multiSendProgress.current / multiSendProgress.total) * 100} className="h-2" />
          {multiSendProgress.results.length > 0 && (
            <p className="text-xs text-muted-foreground">
              ✅ {multiSendProgress.results.filter(r => r.success).length} {t('multiSuccessCount')}
              {multiSendProgress.results.some(r => !r.success) && ` · ❌ ${multiSendProgress.results.filter(r => !r.success).length} ${t('multiFailCount')}`}
            </p>
          )}
        </div>
      )}

      {/* BTC Wallet Panel — shown when signing BTC */}
      {props.isBtcSigning && props.btcBip21Url && (
        <BtcWalletPanel
          bip21Url={props.btcBip21Url}
          recipientAddress={props.btcRecipientAddress || ''}
          amount={props.btcAmount || ''}
          pollingStatus={props.btcPollingStatus || 'idle'}
          txid={props.btcTxid || null}
          onMarkManualSend={props.onBtcMarkManualSend || (() => {})}
          manualConfirmEnabled={props.btcManualConfirmEnabled ?? false}
          onCancel={props.onBtcCancelPolling || (() => {})}
        />
      )}

      {/* Single send TX Progress (non-BTC) */}
      {!isMultiMode && !props.isBtcSigning && (isInProgress || txStep === 'success' || txStep === 'timeout') && (
        <div className="space-y-2">
          <div className="flex items-center gap-2">
            {txStep === 'success' ? <CheckCircle2 className="w-4 h-4 text-primary shrink-0" /> :
             txStep === 'timeout' ? <AlertTriangle className="w-4 h-4 text-destructive shrink-0" /> :
             <Loader2 className="w-4 h-4 animate-spin text-primary shrink-0" />}
            <p className="text-sm font-medium">{stepInfo.label}</p>
          </div>
          <Progress value={stepInfo.progress} className="h-2" />
        </div>
      )}

      {scanUrl && !isMultiMode && (
        <Button variant="outline" size="sm" className="w-full gap-2" onClick={() => window.open(scanUrl, '_blank')}>
          <ExternalLink className="w-3.5 h-3.5" />{t('viewOnBscScan')}
        </Button>
      )}

      {/* Actions — sticky bottom để luôn hiển thị trên mobile dù nội dung dài */}
      <div className="sticky bottom-0 -mx-3 sm:-mx-6 px-3 sm:px-6 pt-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))] sm:pb-3 bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/80 border-t z-10 space-y-2">
        {props.isBtcSigning ? (
          // BTC native: BtcWalletPanel ở trên đã có nút Huỷ + Tôi đã gửi xong.
          // Chỉ giữ 2 nút điều hướng để tránh rối UI.
          <div className="flex gap-3">
            <Button variant="outline" onClick={onGoBack} className="flex-1 gap-2">
              <ArrowLeft className="w-4 h-4" />{t('goBackLabel')}
            </Button>
            <Button variant="outline" onClick={onClose} className="flex-1">
              {t('closeLabel')}
            </Button>
          </div>
        ) : (
          <>
            {/* Mobile: nút "Mở lại ví" — hiện ngay khi đang signing để user dễ quay lại app ví */}
            {txStep === 'signing' && onReopenWallet && (
              <Button
                variant="outline"
                size="sm"
                onClick={onReopenWallet}
                className="w-full gap-2 border-primary/40 text-primary hover:bg-primary/10"
              >
                <Smartphone className="w-4 h-4" />
                Mở lại app ví để xác nhận
              </Button>
            )}

            {/* Nút Huỷ giao dịch — hiện sau 8s nếu đang kẹt 'signing' (MetaMask không phản hồi) */}
            {showForceCancel && txStep === 'signing' && onForceCancel && (
              <Button
                variant="outline"
                size="sm"
                onClick={onForceCancel}
                className="w-full gap-2 border-destructive/40 text-destructive hover:bg-destructive/10"
              >
                <X className="w-4 h-4" />
                {t('cancel') || 'Huỷ giao dịch'} — Ví không phản hồi?
              </Button>
            )}

            <div className="flex gap-3">
              {txStep === 'timeout' && !isMultiMode ? (
                <>
                  <Button variant="outline" onClick={onClose} className="flex-1">{t('closeLabel')}</Button>
                  <Button onClick={onRecheckReceipt} className="flex-1 gap-2"><RefreshCw className="w-3.5 h-3.5" />{t('checkAgainLabel')}</Button>
                </>
              ) : (
                <>
                  <Button variant="outline" onClick={onGoBack} className="flex-1 gap-2" disabled={isInProgress || isMultiSending}>
                    <ArrowLeft className="w-4 h-4" />{t('goBackLabel')}
                  </Button>
                  <Button onClick={onSend} disabled={isSendDisabled} className="flex-1 bg-gradient-to-r from-gold to-amber-500 hover:from-gold/90 hover:to-amber-500/90 text-primary-foreground">
                    {isPending || isInProgress || isMultiSending ? (
                      <><Loader2 className="w-4 h-4 mr-2 animate-spin" />{t('processingLabel')}</>
                    ) : (
                      <><CheckCircle2 className="w-4 h-4 mr-2" />
                        {isMultiMode ? t('confirmGiftMultiBtn').replace('{count}', String(recipientsWithWallet.length)) : t('confirmGiftBtn')}
                      </>
                    )}
                  </Button>
                </>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}

function SingleRecipientDisplay({ recipient, onCopyAddress, isBtc }: { recipient?: ResolvedRecipient; onCopyAddress: (a: string) => void; isBtc?: boolean }) {
  if (!recipient) return null;
  const displayAddr = isBtc ? recipient.btcAddress : recipient.walletAddress;
  return (
    <div className="flex items-center gap-3">
      <Avatar className="w-10 h-10 border-2 border-gold/30">
        <AvatarImage src={recipient.avatarUrl || ''} />
        <AvatarFallback className="bg-primary/20 text-primary">{recipient.username?.[0]?.toUpperCase() || '?'}</AvatarFallback>
      </Avatar>
      <div className="flex-1 min-w-0">
        <p className="font-medium text-sm">{recipient.displayName || recipient.username}</p>
        <p className="text-xs text-muted-foreground">@{recipient.username}</p>
        {displayAddr && (
          <div className="flex items-center gap-1">
            <span className="text-xs text-muted-foreground font-mono break-all">{displayAddr.slice(0, 8)}...{displayAddr.slice(-6)}</span>
            <button type="button" onClick={() => onCopyAddress(displayAddr)} className="p-0.5 hover:bg-muted rounded shrink-0"><Copy className="w-3 h-3 text-muted-foreground" /></button>
          </div>
        )}
      </div>
    </div>
  );
}

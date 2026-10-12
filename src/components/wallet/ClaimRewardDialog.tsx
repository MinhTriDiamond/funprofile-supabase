import { useState, useEffect, useRef } from 'react';
import { useLanguage } from '@/i18n/LanguageContext';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Gift, Wallet, Loader2, AlertCircle, Clock } from 'lucide-react';
import { useClaimReward } from '@/hooks/useClaimReward';

const MINIMUM_CLAIM = 200000;
const DAILY_CLAIM_CAP = 500000;

interface ClaimRewardDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  claimableAmount: number;
  externalWallet: string | null;
  camlyPrice: number | null;
  dailyClaimed: number;
  rewardStatus?: string;
  onSuccess: () => void;
}

type ClaimStep = 'input' | 'confirming' | 'pending' | 'error';

export const ClaimRewardDialog = ({
  open,
  onOpenChange,
  claimableAmount,
  externalWallet,
  camlyPrice,
  dailyClaimed,
  rewardStatus = 'pending',
  onSuccess,
}: ClaimRewardDialogProps) => {
  const { t } = useLanguage();
  const [amount, setAmount] = useState('');
  const [step, setStep] = useState<ClaimStep>('input');

  const { claimReward, isLoading, error, result, reset } = useClaimReward();

  useEffect(() => {
    if (open) {
      setAmount('');
      setStep('input');
      reset();
    }
  }, [open, reset]);

  const formatNumber = (num: number) => num.toLocaleString('vi-VN');
  const formatUsd = (num: number) =>
    camlyPrice === null ? t('ggsNoPrice') : `$${(num * camlyPrice).toFixed(2)}`;

  const dailyRemaining = Math.max(0, DAILY_CLAIM_CAP - dailyClaimed);
  const maxClaimable = Math.min(claimableAmount, dailyRemaining);

  const handleMaxClick = () => setAmount(maxClaimable.toString());

  const handleAmountChange = (value: string) => {
    setAmount(value.replace(/[^0-9]/g, ''));
  };

  const isValidAmount = () => {
    const numAmount = Number(amount);
    return numAmount >= MINIMUM_CLAIM && numAmount <= maxClaimable;
  };

  const handleClaim = async () => {
    if (!externalWallet) return;
    setStep('confirming');
    const claimResult = await claimReward(Number(amount), externalWallet);
    if (claimResult) {
      setStep('pending');
      onSuccess();
    } else {
      setStep('error');
    }
  };

  const handleClose = () => {
    onOpenChange(false);
  };

  const renderInputStep = () => (
    <>
      <DialogHeader>
        <DialogTitle className="flex items-center gap-2 text-xl">
          <Gift className="w-6 h-6 text-yellow-500" />
          Claim CAMLY Rewards
        </DialogTitle>
        <DialogDescription>
          {t('crdDialogDesc')}
        </DialogDescription>
      </DialogHeader>

      {rewardStatus !== 'approved' && (
        <div className="bg-yellow-50 border-2 border-yellow-300 rounded-xl p-4 my-4 text-center">
          <div className="text-3xl mb-2">⏳</div>
          <p className="font-bold text-yellow-700 text-base mb-1">{t('crdWaitingTitle')}</p>
          <p className="text-yellow-600 text-sm">
            {t('crdWaitingDesc')}
          </p>
        </div>
      )}

      {rewardStatus === 'approved' && (
        <div className="space-y-6 py-4">
          <div className="bg-gradient-to-r from-yellow-50 to-amber-50 border border-yellow-200 rounded-xl p-4">
            <p className="text-sm text-yellow-700 mb-1">{t('crdAvailableBalance')}</p>
            <p className="text-2xl font-bold text-yellow-800">
              {formatNumber(claimableAmount)} CAMLY
            </p>
            <p className="text-sm text-yellow-600">~{formatUsd(claimableAmount)}</p>
          </div>

          <div className="bg-gradient-to-r from-blue-50 to-indigo-50 border border-blue-200 rounded-xl p-4">
            <div className="flex justify-between items-center mb-2">
              <p className="text-sm text-blue-700">{t('crdClaimedToday')}</p>
              <p className="text-sm font-semibold text-blue-800">{formatNumber(dailyClaimed)} / {formatNumber(DAILY_CLAIM_CAP)}</p>
            </div>
            <div className="w-full bg-blue-100 rounded-full h-2 mb-2">
              <div
                className="bg-blue-500 h-2 rounded-full transition-all"
                style={{ width: `${Math.min(100, (dailyClaimed / DAILY_CLAIM_CAP) * 100)}%` }}
              />
            </div>
            <p className="text-sm text-blue-600">
              {t('crdRemainingToday')}<span className="font-bold">{formatNumber(dailyRemaining)} CAMLY</span>
            </p>
            {dailyRemaining <= 0 && (
              <p className="text-sm text-red-500 font-medium mt-1">{t('crdDailyLimitReached')}</p>
            )}
          </div>

          <div className="space-y-2">
            <Label htmlFor="amount">{t('crdAmountLabel')}</Label>
            <div className="relative">
              <Input
                id="amount"
                type="text"
                placeholder={t('crdAmountPlaceholder')}
                value={amount ? formatNumber(Number(amount)) : ''}
                onChange={(e) => handleAmountChange(e.target.value.replace(/\./g, ''))}
                className="pr-16 text-lg font-medium"
              />
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={handleMaxClick}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-xs text-primary hover:text-primary/80"
              >
                MAX
              </Button>
            </div>
            {amount && Number(amount) > 0 && (
              <p className="text-sm text-muted-foreground">~{formatUsd(Number(amount))}</p>
            )}
            {amount && Number(amount) > maxClaimable && (
              <p className="text-sm text-red-500">
                {Number(amount) > claimableAmount ? t('crdExceedBalance') : t('crdExceedDailyLimit')}
              </p>
            )}
          </div>

          {externalWallet ? (
            <div className="space-y-2">
              <Label>{t('crdReceivingWallet')}</Label>
              <div className="flex items-center gap-2 p-3 bg-gray-50 rounded-lg border">
                <Wallet className="w-5 h-5 text-amber-600" />
                <span className="text-sm font-mono">
                  {externalWallet.slice(0, 6)}...{externalWallet.slice(-4)}
                </span>
              </div>
            </div>
          ) : (
            <div className="bg-red-50 border border-red-200 rounded-lg p-3 text-center">
              <p className="text-sm text-red-600">{t('crdConnectWalletPrompt')}</p>
            </div>
          )}

          <div className="flex items-center gap-2 text-sm text-muted-foreground bg-gray-50 rounded-lg p-3">
            <Wallet className="w-4 h-4" />
            <span>{t('crdNetworkLabel')}</span>
          </div>
        </div>
      )}

      <div className="flex gap-3">
        <Button variant="outline" onClick={() => onOpenChange(false)} className="flex-1">
          {rewardStatus === 'approved' ? t('cancel') : t('close')}
        </Button>
        {rewardStatus === 'approved' && (
          <Button
            onClick={handleClaim}
            disabled={!isValidAmount() || !externalWallet}
            className="flex-1 bg-gradient-to-r from-yellow-500 to-amber-500 hover:from-yellow-600 hover:to-amber-600 text-white"
          >
            <Gift className="w-4 h-4 mr-2" />
            {t('crdSubmitClaim')}
          </Button>
        )}
      </div>
    </>
  );

  const renderConfirmingStep = () => (
    <div className="py-12 text-center">
      <div className="w-20 h-20 bg-yellow-100 rounded-full flex items-center justify-center mx-auto mb-6 animate-pulse">
        <Loader2 className="w-10 h-10 text-yellow-600 animate-spin" />
      </div>
      <h3 className="text-xl font-semibold mb-2">{t('crsSendingRequest')}</h3>
      <p className="text-muted-foreground mb-4">
        {t('crdWaitingProcessDesc')}
      </p>
      <div className="flex items-center justify-center gap-2 text-sm text-muted-foreground">
        <div className="w-2 h-2 bg-yellow-500 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
        <div className="w-2 h-2 bg-yellow-500 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
        <div className="w-2 h-2 bg-yellow-500 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
      </div>
    </div>
  );

  const renderPendingStep = () => (
    <div className="py-8 text-center">
      <div className="w-20 h-20 bg-amber-100 rounded-full flex items-center justify-center mx-auto mb-6">
        <Clock className="w-12 h-12 text-amber-600" />
      </div>
      <h3 className="text-xl font-semibold text-amber-700 mb-2">{t('crdPendingTitle')}</h3>
      <p className="text-muted-foreground mb-4">
        {t('crdClaimSentBefore')}<span className="font-bold text-amber-700">{formatNumber(result?.amount || 0)} CAMLY</span>{t('crdClaimSentAfter')}
      </p>
      <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 mx-4 mb-6 text-left">
        <p className="text-sm text-amber-800 mb-2">📋 <strong>{t('crdNextSteps')}</strong></p>
        <ul className="text-sm text-amber-700 space-y-1">
          <li>{t('crdNextStep1')}</li>
          <li>{t('crdNextStep2')}</li>
          <li>{t('crdNextStep3')}</li>
        </ul>
      </div>
      <Button
        onClick={handleClose}
        className="w-full bg-gradient-to-r from-amber-500 to-yellow-500 hover:from-amber-600 hover:to-yellow-600 text-white font-bold"
      >
        {t('crdUnderstoodClose')}
      </Button>
    </div>
  );

  const renderErrorStep = () => (
    <div className="py-8 text-center">
      <div className="w-20 h-20 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-6">
        <AlertCircle className="w-12 h-12 text-red-600" />
      </div>
      <h3 className="text-xl font-semibold text-red-700 mb-2">{t('crdErrorTitle')}</h3>
      <p className="text-muted-foreground mb-6">
        {error || t('crdErrorFallback')}
      </p>
      <div className="flex gap-3">
        <Button variant="outline" onClick={() => onOpenChange(false)} className="flex-1">{t('close')}</Button>
        <Button onClick={() => setStep('input')} className="flex-1">{t('walletRetry')}</Button>
      </div>
    </div>
  );

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-md max-h-[90vh] overflow-y-auto">
        {step === 'input' && renderInputStep()}
        {step === 'confirming' && renderConfirmingStep()}
        {step === 'pending' && renderPendingStep()}
        {step === 'error' && renderErrorStep()}
      </DialogContent>
    </Dialog>
  );
};

export default ClaimRewardDialog;

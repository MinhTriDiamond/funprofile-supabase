/**
 * MintBlockedAlert — Hiển thị lý do mint bị chặn + hướng dẫn retry.
 *
 * 3 loại blocker:
 * - PENDING_REQUEST   : Đang có 1 lệnh chờ ký (409 từ pplp-mint-fun)
 * - SOFT_CEILING      : Allocation bị cắt do trần tháng 20M FUN
 * - NO_PUBLIC_WALLET  : Chưa cài địa chỉ ví công khai
 */
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { useLanguage } from '@/i18n/LanguageContext';
import { Button } from '@/components/ui/button';
import { AlertTriangle, Clock, Wallet, Gauge, ExternalLink } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

export type MintBlockReason =
  | 'PENDING_REQUEST'
  | 'SOFT_CEILING'
  | 'NO_PUBLIC_WALLET'
  | 'GENERIC';

interface MintBlockedAlertProps {
  reason: MintBlockReason;
  /** Message gốc từ server (nếu có) */
  message?: string;
  /** Cho PENDING_REQUEST */
  existingRequestId?: string;
  /** Cho SOFT_CEILING */
  rawAmount?: number;
  cappedAmount?: number;
  softCeiling?: number;
  /** Action retry tuỳ ý */
  onRetry?: () => void;
}

const REASON_META: Record<
  MintBlockReason,
  { icon: typeof AlertTriangle; titleKey: string; tone: string }
> = {
  PENDING_REQUEST: { icon: Clock, titleKey: 'mbaPendingTitle', tone: 'border-amber-500/50 bg-amber-500/10' },
  SOFT_CEILING: { icon: Gauge, titleKey: 'mbaCeilingTitle', tone: 'border-blue-500/50 bg-blue-500/10' },
  NO_PUBLIC_WALLET: { icon: Wallet, titleKey: 'mbaNoWalletTitle', tone: 'border-rose-500/50 bg-rose-500/10' },
  GENERIC: { icon: AlertTriangle, titleKey: 'mbaGenericTitle', tone: 'border-destructive/50 bg-destructive/10' },
};

export function MintBlockedAlert({
  reason,
  message,
  existingRequestId,
  rawAmount,
  cappedAmount,
  softCeiling,
  onRetry,
}: MintBlockedAlertProps) {
  const navigate = useNavigate();
  const { t } = useLanguage();
  const meta = REASON_META[reason];
  const Icon = meta.icon;

  const renderBody = () => {
    switch (reason) {
      case 'PENDING_REQUEST':
        return (
          <>
            <p>
              {t('mbaPendingBody1')}<strong>{t('mbaPendingBodyStrong')}</strong>{t('mbaPendingBody2')}
            </p>
            <p className="mt-2 text-sm opacity-90">
              <strong>{t('mbaHowToHandle')}</strong>{t('mbaPendingHow1')}<em>confirmed</em>{t('mbaPendingHowMid')}<em>rejected</em>{t('mbaPendingHow2')}
            </p>
            {existingRequestId && (
              <Button
                variant="outline"
                size="sm"
                className="mt-3"
                onClick={() => navigate(`/wallet?tab=mint&request=${existingRequestId}`)}
              >
                <ExternalLink className="w-3.5 h-3.5 mr-1.5" />
                {t('mbaViewPendingRequest')}
              </Button>
            )}
          </>
        );

      case 'SOFT_CEILING': {
        const cut = rawAmount && cappedAmount ? rawAmount - cappedAmount : 0;
        const cutPct = rawAmount ? Math.round((cut / rawAmount) * 100) : 0;
        return (
          <>
            <p>
              {t('mbaCeilingBody1')}<strong>{t('mbaCeilingStrong', { amount: (softCeiling ?? 50_000_000).toLocaleString('vi-VN') })}</strong>{t('mbaCeilingBody2')}
            </p>
            {rawAmount !== undefined && cappedAmount !== undefined && (
              <div className="mt-2 text-sm space-y-1">
                <div>{t('mbaRawAllocation')}<strong>{rawAmount.toLocaleString('vi-VN')} FUN</strong></div>
                <div>{t('mbaCappedAllocation')}<strong>{cappedAmount.toLocaleString('vi-VN')} FUN</strong></div>
                <div className="text-amber-600 dark:text-amber-400">
                  {t('mbaCutAmount')}<strong>{cut.toLocaleString('vi-VN')} FUN ({cutPct}%)</strong>
                </div>
              </div>
            )}
            <p className="mt-2 text-sm opacity-90">
              <strong>{t('mbaHowToHandle')}</strong>{t('mbaCeilingHow1')}<em>{t('mbaCeilingHowEm')}</em>{t('mbaCeilingHow2')}
            </p>
          </>
        );
      }

      case 'NO_PUBLIC_WALLET':
        return (
          <>
            <p>
              {t('mbaNoWalletBody1')}<strong>{t('mbaNoWalletBodyStrong')}</strong>{t('mbaNoWalletBody2')}
            </p>
            <Button
              variant="outline"
              size="sm"
              className="mt-3"
              onClick={() => navigate('/settings?tab=wallet')}
            >
              <Wallet className="w-3.5 h-3.5 mr-1.5" />
              {t('mbaSetupPublicWallet')}
            </Button>
          </>
        );

      default:
        return (
          <>
            <p>{message || t('mbaGenericError')}</p>
            {onRetry && (
              <Button variant="outline" size="sm" className="mt-3" onClick={onRetry}>
                {t('walletRetry')}
              </Button>
            )}
          </>
        );
    }
  };

  return (
    <Alert className={meta.tone}>
      <Icon className="h-4 w-4" />
      <AlertTitle>{t(meta.titleKey)}</AlertTitle>
      <AlertDescription className="mt-1">{renderBody()}</AlertDescription>
    </Alert>
  );
}

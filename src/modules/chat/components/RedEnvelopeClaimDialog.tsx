import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import type { RedEnvelope } from '../types';
import { useLanguage } from '@/i18n/LanguageContext';

interface RedEnvelopeClaimDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  envelope: RedEnvelope;
  userId: string | null;
  onClaim: () => Promise<void>;
}

export function RedEnvelopeClaimDialog({
  open,
  onOpenChange,
  envelope,
  userId,
  onClaim,
}: RedEnvelopeClaimDialogProps) {
  const { t } = useLanguage();
  const isExpired = envelope.status === 'expired' || new Date(envelope.expires_at) < new Date();
  const isFullyClaimed = envelope.remaining_count <= 0;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle className="text-center text-red-500">{t('redEnvelopeClaim')}</DialogTitle>
        </DialogHeader>
        <div className="text-center space-y-4 py-4">
          <div className="text-3xl">🧧</div>
          <div>
            <p className="text-lg font-medium">{envelope.total_amount} {envelope.token}</p>
            <p className="text-sm text-muted-foreground">
              {t('redEnvelopeRemaining').replace('{remaining}', String(envelope.remaining_count)).replace('{total}', String(envelope.total_count))}
            </p>
          </div>
          {isExpired ? (
            <p className="text-sm text-destructive">{t('redEnvelopeExpired')}</p>
          ) : isFullyClaimed ? (
            <p className="text-sm text-muted-foreground">{t('redEnvelopeEmpty')}</p>
          ) : (
            <Button onClick={onClaim} className="bg-red-500 hover:bg-red-600 text-white w-full">
              {t('redEnvelopeOpen')}
            </Button>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

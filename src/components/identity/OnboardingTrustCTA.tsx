import { Link } from 'react-router-dom';
import { ArrowRight, Sparkles } from 'lucide-react';
import { useDID } from '@/hooks/useDID';
import { useMyGuardians } from '@/hooks/useGuardians';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

interface Props {
  variant?: 'banner' | 'compact';
  className?: string;
}

/**
 * Hiển thị CTA Onboarding Trust khi user chưa đủ ≥2 guardian.
 * - banner: card đầy đủ
 * - compact: pill nhỏ cạnh badge
 */
export function OnboardingTrustCTA({ variant = 'banner', className }: Props) {
  const { data: did } = useDID();
  const { data: guardians = [] } = useMyGuardians();

  if (!did?.did_id) return null;
  const active = guardians.filter((g: any) => g.status !== 'revoked').length;
  if (active >= 2) return null;

  if (variant === 'compact') {
    return (
      <Button
        asChild
        size="sm"
        variant="outline"
        className={cn('h-6 px-2 gap-1 text-[10px] border-primary/40 text-primary hover:bg-primary/10', className)}
      >
        <Link to="/identity/onboarding">
          <Sparkles className="w-3 h-3" />
          Hoàn tất Trust
        </Link>
      </Button>
    );
  }

  return (
    <div
      className={cn(
        'rounded-xl border border-primary/30 bg-gradient-to-r from-primary/10 via-accent/5 to-primary/10 p-3 flex items-center gap-3 shadow-sm',
        className
      )}
    >
      <div className="w-9 h-9 rounded-lg bg-primary/15 flex items-center justify-center shrink-0">
        <Sparkles className="w-4 h-4 text-primary" />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-semibold leading-tight">Hoàn tất Onboarding Trust</p>
        <p className="text-[11px] text-muted-foreground leading-tight mt-0.5">
          Mời guardian & gửi attestation để bật khôi phục tài khoản.
        </p>
      </div>
      <Button asChild size="sm" className="gap-1 shrink-0">
        <Link to="/identity/onboarding">
          Bắt đầu <ArrowRight className="w-3.5 h-3.5" />
        </Link>
      </Button>
    </div>
  );
}

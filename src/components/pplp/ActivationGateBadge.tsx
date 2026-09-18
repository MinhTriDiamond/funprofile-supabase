import { Lock } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { useLightScoreParams } from '@/hooks/useLightScoreParams';
import { useLightScore } from '@/hooks/useLightScore';
import { useTrustProfile } from '@/hooks/useTrustProfile';
import { checkActivation, featureLabel, type GatedFeature, type TrustTier } from '@/lib/lightScoreGates';

interface Props {
  feature: GatedFeature;
  className?: string;
  /** Override score (mặc định lấy từ useLightScore) */
  score?: number;
  /** Override TC (mặc định lấy từ trust_profile) */
  tc?: number;
  /** Override trust tier (mặc định lấy từ trust_profile) */
  trustTier?: TrustTier;
  /** Hiện cả khi đã unlock */
  showWhenUnlocked?: boolean;
}

export function ActivationGateBadge({ feature, className, score, tc, trustTier, showWhenUnlocked = false }: Props) {
  const { data: params } = useLightScoreParams();
  const { data: lightScore } = useLightScore();
  const { data: trustProfile } = useTrustProfile();
  const phase = params?.active_phase;
  const userScore = score ?? lightScore?.total_light_score ?? 0;
  const userTc = tc ?? Number(trustProfile?.tc ?? 1.0);
  const userTier = (trustTier ?? (trustProfile?.trust_tier as TrustTier) ?? 'T1') as TrustTier;

  if (!phase) return null;

  const result = checkActivation(feature, userScore, userTc, phase, userTier);
  if (result.allowed && !showWhenUnlocked) return null;

  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <Badge
            variant={result.allowed ? 'secondary' : 'outline'}
            className={`gap-1 text-[10px] ${className ?? ''} ${result.allowed ? '' : 'border-amber-300 text-amber-700 dark:text-amber-400'}`}
          >
            {!result.allowed && <Lock className="w-2.5 h-2.5" />}
            {result.allowed ? `✓ ${featureLabel(feature)}` : result.reason}
          </Badge>
        </TooltipTrigger>
        <TooltipContent side="top" className="max-w-xs text-xs">
          <p className="font-medium">{featureLabel(feature)}</p>
          <p className="text-muted-foreground mt-1">
            {result.allowed
              ? 'Bạn đã đủ điều kiện sử dụng tính năng này.'
              : `${result.reason}. Hiện tại LS=${userScore.toFixed(1)}, TC=${userTc.toFixed(2)}, Tier=${userTier}.`}
          </p>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}

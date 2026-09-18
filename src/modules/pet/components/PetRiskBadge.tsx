import { Badge } from '@/components/ui/badge';
import { Shield, ShieldAlert, ShieldX, Eye } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { RiskTier } from '../hooks/usePetRisk';
import { petRiskTierLabel } from '../hooks/usePetRisk';

interface Props {
  tier?: RiskTier | null;
  className?: string;
  showIcon?: boolean;
}

const TIER_STYLE: Record<RiskTier, string> = {
  safe: 'bg-emerald-500/15 text-emerald-600 border-emerald-500/30',
  watch: 'bg-amber-500/15 text-amber-600 border-amber-500/30',
  restricted: 'bg-orange-500/15 text-orange-600 border-orange-500/30',
  frozen: 'bg-destructive/15 text-destructive border-destructive/30',
};

const ICON: Record<RiskTier, React.ComponentType<{ className?: string }>> = {
  safe: Shield,
  watch: Eye,
  restricted: ShieldAlert,
  frozen: ShieldX,
};

export function PetRiskBadge({ tier, className, showIcon = true }: Props) {
  if (!tier || tier === 'safe') return null;
  const { label } = petRiskTierLabel(tier);
  const Icon = ICON[tier];
  return (
    <Badge variant="outline" className={cn('gap-1', TIER_STYLE[tier], className)}>
      {showIcon && <Icon className="h-3 w-3" />}
      {label}
    </Badge>
  );
}

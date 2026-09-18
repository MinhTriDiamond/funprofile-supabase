import { Badge } from '@/components/ui/badge';
import { TIER_COLORS, TIER_LABEL_VI, type BoxTier } from '../types';
import { cn } from '@/lib/utils';

interface Props {
  tier: BoxTier;
  className?: string;
}

export function BoxTierBadge({ tier, className }: Props) {
  const c = TIER_COLORS[tier];
  return (
    <Badge className={cn(`bg-gradient-to-br ${c.bg} ${c.text} border-0`, className)}>
      {TIER_LABEL_VI[tier]}
    </Badge>
  );
}

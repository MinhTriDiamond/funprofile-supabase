import { Badge } from '@/components/ui/badge';
import { Sparkles } from 'lucide-react';

const TIER_MAP: Record<string, { label: string; color: string }> = {
  T0: { label: 'T0 · Unknown', color: 'bg-muted text-muted-foreground' },
  T1: { label: 'T1 · Basic', color: 'bg-slate-500/15 text-slate-700 dark:text-slate-300' },
  T2: { label: 'T2 · Verified', color: 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300' },
  T3: { label: 'T3 · Trusted', color: 'bg-violet-500/15 text-violet-700 dark:text-violet-300' },
  T4: { label: 'T4 · Core', color: 'bg-gradient-to-r from-amber-400 to-yellow-500 text-white' },
};

export function TrustTierBadge({ tier, tc, compact }: { tier?: string; tc?: number; compact?: boolean }) {
  if (!tier) return null;
  const cfg = TIER_MAP[tier] ?? TIER_MAP.T0;
  return (
    <Badge variant="outline" className={`${cfg.color} border-0 gap-1 font-medium`}>
      <Sparkles className="w-3 h-3" />
      {compact ? tier : cfg.label}
      {!compact && typeof tc === 'number' && <span className="opacity-70 ml-1">TC {tc.toFixed(2)}</span>}
    </Badge>
  );
}

import { Badge } from '@/components/ui/badge';
import { ShieldCheck } from 'lucide-react';
import { TIER_COLOR, TIER_LABEL_VI, type TierKey } from '@/lib/founderTrustTier';

export function TrustTierDistribution({ byTier, tiers }: { byTier: Record<string, number>; tiers: readonly string[] }) {
  const max = Math.max(1, ...Object.values(byTier).map(Number));
  return (
    <div>
      <p className="text-sm font-semibold mb-2 flex items-center gap-2">
        <ShieldCheck className="h-4 w-4" /> Phân bố Trust Tier
      </p>
      <div className="space-y-1.5">
        {tiers.map((t) => {
          const v = Number(byTier[t] || 0);
          const pct = (v / max) * 100;
          const key = t as TierKey;
          return (
            <div key={t} className="flex items-center gap-3 text-sm">
              <Badge variant="outline" className={`w-10 justify-center ${TIER_COLOR[key] || ''}`}>{t}</Badge>
              <span className="w-20 text-xs text-muted-foreground truncate">{TIER_LABEL_VI[key] || ''}</span>
              <div className="flex-1 h-5 rounded bg-muted overflow-hidden">
                <div className="h-full bg-emerald-500/60 transition-all" style={{ width: `${pct}%` }} />
              </div>
              <span className="w-16 text-right font-medium tabular-nums">{v.toLocaleString('vi-VN')}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

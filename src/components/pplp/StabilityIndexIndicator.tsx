import { Activity } from 'lucide-react';
import { useStabilityIndex } from '@/hooks/useStabilityIndex';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';

export function StabilityIndexIndicator({ userId, compact = false }: { userId?: string; compact?: boolean }) {
  const { data } = useStabilityIndex(userId);

  const si = data?.stability_index ?? 1.0;
  const pct = Math.min(100, (si / 1.5) * 100);
  const color =
    si >= 1.2 ? 'text-emerald-600 stroke-emerald-500' :
    si >= 0.8 ? 'text-sky-600 stroke-sky-500' :
    'text-amber-600 stroke-amber-500';

  const radius = compact ? 14 : 22;
  const stroke = compact ? 3 : 4;
  const c = 2 * Math.PI * radius;
  const dash = (pct / 100) * c;
  const size = (radius + stroke) * 2;

  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <div className={`inline-flex items-center gap-2 ${compact ? '' : 'rounded-lg border bg-card p-2.5'}`}>
            <div className="relative" style={{ width: size, height: size }}>
              <svg width={size} height={size} className="-rotate-90">
                <circle cx={size/2} cy={size/2} r={radius} strokeWidth={stroke} className="stroke-muted fill-none" />
                <circle
                  cx={size/2} cy={size/2} r={radius} strokeWidth={stroke}
                  strokeDasharray={`${dash} ${c}`} strokeLinecap="round"
                  className={`fill-none transition-all ${color}`}
                />
              </svg>
              <Activity className={`absolute inset-0 m-auto ${compact ? 'w-3 h-3' : 'w-4 h-4'} ${color}`} />
            </div>
            {!compact && (
              <div>
                <p className="text-[10px] uppercase text-muted-foreground">Stability</p>
                <p className={`text-sm font-semibold ${color}`}>{si.toFixed(2)} <span className="text-[10px] text-muted-foreground">/1.5</span></p>
              </div>
            )}
          </div>
        </TooltipTrigger>
        <TooltipContent side="top" className="text-xs space-y-1">
          <p className="font-medium">Stability Index: {si.toFixed(3)}</p>
          {data && (
            <>
              <p>Volatility 30d: {data.ls_volatility_30d.toFixed(3)}</p>
              <p>Behavior: {data.behavior_consistency.toFixed(2)}</p>
              <p>Network: {data.network_stability.toFixed(2)}</p>
            </>
          )}
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}

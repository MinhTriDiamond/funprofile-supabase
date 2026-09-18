import { Progress } from '@/components/ui/progress';
import { ShieldCheck } from 'lucide-react';

interface IISIndicatorProps {
  value: number; // 0..1.5
  showDetail?: boolean;
}

export function IISIndicator({ value, showDetail = true }: IISIndicatorProps) {
  const pct = Math.min(100, (value / 1.5) * 100);
  const colorClass = value >= 1.2
    ? 'bg-emerald-500'
    : value >= 0.8
    ? 'bg-amber-500'
    : 'bg-rose-500';
  const label = value >= 1.2 ? 'Trong sáng' : value >= 0.8 ? 'Bình thường' : 'Cảnh báo';

  return (
    <div className="space-y-1.5">
      {showDetail && (
        <div className="flex items-center justify-between text-xs">
          <span className="flex items-center gap-1 text-muted-foreground">
            <ShieldCheck className="w-3.5 h-3.5" />
            Intent Integrity (IIS)
          </span>
          <span className="font-medium">
            {value.toFixed(2)} <span className="text-muted-foreground">/ 1.5</span> · {label}
          </span>
        </div>
      )}
      <div className="relative h-2 bg-muted rounded-full overflow-hidden">
        <div className={`h-full ${colorClass} transition-all duration-500`} style={{ width: `${pct}%` }} />
        {/* Marker at 1.0 */}
        <div className="absolute top-0 bottom-0 w-px bg-foreground/40" style={{ left: '66.67%' }} />
      </div>
    </div>
  );
}

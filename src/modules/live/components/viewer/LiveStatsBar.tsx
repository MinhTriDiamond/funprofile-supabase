import { Activity, Clock, Eye, HeartPulse, Radio } from 'lucide-react';
import { cn } from '@/lib/utils';

interface LiveStatsBarProps {
  duration: string;
  viewerCount: number;
  reactionCount: number;
  healthLabel: string;
  state: 'live' | 'reconnecting' | 'ended' | 'processing_replay' | 'replay_ready' | 'failed';
}

const compactNumber = new Intl.NumberFormat('en', {
  notation: 'compact',
  maximumFractionDigits: 1,
});

export function LiveStatsBar({ duration, viewerCount, reactionCount, healthLabel, state }: LiveStatsBarProps) {
  const isLive = state === 'live' || state === 'reconnecting';

  return (
    <div className="flex flex-wrap items-center gap-2 rounded-2xl border border-gold/20 bg-card/90 px-3 py-2 text-sm shadow-sm backdrop-blur md:px-4">
      <span
        className={cn(
          'inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 font-bold text-white',
          isLive ? 'bg-red-600 shadow-[0_0_18px_rgba(220,38,38,0.35)]' : 'bg-muted-foreground',
        )}
      >
        <Radio className="h-3.5 w-3.5" />
        {isLive ? 'LIVE' : 'ENDED'}
      </span>
      <span className="inline-flex items-center gap-1.5 rounded-full bg-muted px-2.5 py-1 font-mono font-semibold">
        <Clock className="h-3.5 w-3.5 text-primary" />
        {duration}
      </span>
      <span className="inline-flex items-center gap-1.5 rounded-full bg-muted px-2.5 py-1 font-semibold">
        <Eye className="h-3.5 w-3.5 text-primary" />
        {viewerCount} dang xem
      </span>
      <span className="inline-flex items-center gap-1.5 rounded-full bg-rose-50 px-2.5 py-1 font-semibold text-rose-700 dark:bg-rose-950/30 dark:text-rose-200">
        <HeartPulse className="h-3.5 w-3.5" />
        {compactNumber.format(reactionCount)}
      </span>
      <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-50 px-2.5 py-1 font-semibold text-emerald-700 dark:bg-emerald-950/30 dark:text-emerald-200">
        <Activity className="h-3.5 w-3.5" />
        {healthLabel}
      </span>
    </div>
  );
}

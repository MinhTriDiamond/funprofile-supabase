import { ArrowDown, ArrowUp, Minus } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { SemanticColor, StatisticMetric } from './types';

const COLOR_TEXT: Record<SemanticColor, string> = {
  primary: 'text-primary',
  secondary: 'text-secondary-foreground',
  accent: 'text-accent-foreground',
  muted: 'text-muted-foreground',
  success: 'text-primary',
  warning: 'text-primary',
  destructive: 'text-destructive',
};

const COLOR_ICON_BG: Record<SemanticColor, string> = {
  primary: 'bg-primary/10 text-primary',
  secondary: 'bg-secondary text-secondary-foreground',
  accent: 'bg-accent text-accent-foreground',
  muted: 'bg-muted text-muted-foreground',
  success: 'bg-primary/10 text-primary',
  warning: 'bg-primary/10 text-primary',
  destructive: 'bg-destructive/10 text-destructive',
};

export function StatisticCard({ metric }: { metric: StatisticMetric }) {
  const color = metric.color ?? 'primary';

  return (
    <div className="flex flex-col justify-between rounded-xl border border-border bg-card p-4 shadow-sm transition-shadow hover:shadow-md">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
            {metric.label}
          </p>
          <p className={cn('mt-2 text-2xl font-bold leading-tight break-words', COLOR_TEXT[color])}>
            {metric.value}
          </p>
        </div>
        {metric.icon && (
          <div
            className={cn(
              'flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-lg',
              COLOR_ICON_BG[color],
            )}
          >
            {metric.icon}
          </div>
        )}
      </div>

      {(metric.description || metric.trend) && (
        <div className="mt-3 flex items-center justify-between gap-2">
          {metric.description && (
            <p className="text-xs text-muted-foreground truncate">{metric.description}</p>
          )}
          {metric.trend && (
            <span
              className={cn(
                'inline-flex items-center gap-0.5 rounded-md px-1.5 py-0.5 text-xs font-medium',
                metric.trend.direction === 'up' && 'bg-primary/10 text-primary',
                metric.trend.direction === 'down' && 'bg-destructive/10 text-destructive',
                metric.trend.direction === 'flat' && 'bg-muted text-muted-foreground',
              )}
            >
              {metric.trend.direction === 'up' && <ArrowUp className="h-3 w-3" />}
              {metric.trend.direction === 'down' && <ArrowDown className="h-3 w-3" />}
              {metric.trend.direction === 'flat' && <Minus className="h-3 w-3" />}
              {metric.trend.value}%
            </span>
          )}
        </div>
      )}
    </div>
  );
}

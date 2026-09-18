import { StatisticCard } from './StatisticCard';
import type { StatisticsHeroProps } from './types';

/**
 * StatisticsHero — Generic header cho mọi màn hình thống kê (không gắn với domain nào).
 *
 * Layout KPI cards:
 *  - Desktop (lg+): grid 4 cột đều nhau
 *  - Tablet (md~lg): grid 2 cột
 *  - Mobile (<md): horizontal snap scroll, mỗi card ~75% viewport
 */
export function StatisticsHero({
  title,
  subtitle,
  icon,
  metrics,
  infoBanner,
  actions,
}: StatisticsHeroProps) {
  return (
    <section className="space-y-4">
      {/* Header */}
      <header className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3">
          {icon && (
            <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
              {icon}
            </div>
          )}
          <div className="min-w-0">
            <h1 className="text-xl font-bold leading-tight sm:text-2xl">{title}</h1>
            {subtitle && (
              <p className="mt-1 text-sm text-muted-foreground">{subtitle}</p>
            )}
          </div>
        </div>
        {actions && <div className="flex items-center gap-2">{actions}</div>}
      </header>

      {/* KPI cards */}
      {metrics.length > 0 && (
        <>
          {/* Mobile: snap scroll (hidden md+) */}
          <div className="-mx-4 flex snap-x snap-mandatory gap-3 overflow-x-auto px-4 pb-2 md:hidden">
            {metrics.map((m) => (
              <div key={m.key} className="min-w-[75%] flex-shrink-0 snap-start">
                <StatisticCard metric={m} />
              </div>
            ))}
          </div>

          {/* Tablet+Desktop: responsive grid (hidden below md) */}
          <div className="hidden gap-3 md:grid md:grid-cols-2 lg:grid-cols-4">
            {metrics.map((m) => (
              <StatisticCard key={m.key} metric={m} />
            ))}
          </div>
        </>
      )}

      {infoBanner}
    </section>
  );
}

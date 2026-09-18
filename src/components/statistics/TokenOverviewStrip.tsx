import { cn } from '@/lib/utils';

export interface TokenOverviewItem {
  symbol: string;
  icon?: string | null;
  amount: number;
  usd?: number;
  transactions?: number;
  badge?: string;
}

export interface TokenOverviewStripProps {
  items: TokenOverviewItem[];
  title?: string;
  emptyLabel?: string;
  onSelect?: (symbol: string) => void;
  activeSymbol?: string;
}

function formatAmount(n: number, symbol: string): string {
  const maxDigits = ['BTC', 'BTCB'].includes(symbol)
    ? 6
    : ['BNB', 'TONCOIN'].includes(symbol)
      ? 4
      : 2;
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(2)}M`;
  if (n >= 10_000) return `${(n / 1_000).toFixed(1)}K`;
  return n.toLocaleString('en-US', { maximumFractionDigits: maxDigits });
}

function formatUsd(n: number): string {
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(2)}M`;
  if (n >= 10_000) return `$${(n / 1_000).toFixed(1)}K`;
  if (n >= 1) return `$${n.toLocaleString('en-US', { maximumFractionDigits: 2 })}`;
  return `$${n.toLocaleString('en-US', { maximumFractionDigits: 4 })}`;
}

export function TokenOverviewStrip({
  items,
  title,
  emptyLabel,
  onSelect,
  activeSymbol,
}: TokenOverviewStripProps) {
  if (!items || items.length === 0) {
    if (!emptyLabel) return null;
    return (
      <div className="rounded-lg border border-dashed border-border bg-card/50 p-4 text-center text-sm text-muted-foreground">
        {emptyLabel}
      </div>
    );
  }

  return (
    <section aria-label={title} className="w-full">
      {title && (
        <h3 className="mb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
          {title}
        </h3>
      )}
      <div className="-mx-4 flex snap-x snap-mandatory gap-2 overflow-x-auto px-4 pb-1 sm:mx-0 sm:flex-wrap sm:overflow-visible sm:px-0">
        {items.map((it) => {
          const isActive = activeSymbol === it.symbol;
          const clickable = !!onSelect;
          const Comp: any = clickable ? 'button' : 'div';
          return (
            <Comp
              key={it.symbol}
              type={clickable ? 'button' : undefined}
              onClick={clickable ? () => onSelect!(it.symbol) : undefined}
              className={cn(
                'flex min-w-[10rem] snap-start items-center gap-2.5 rounded-xl border bg-card px-3 py-2 text-left shadow-sm transition-all',
                clickable && 'hover:border-primary/60 hover:shadow-md',
                isActive && 'border-primary ring-2 ring-primary/30',
              )}
            >
              {it.icon ? (
                <img
                  src={it.icon}
                  alt={it.symbol}
                  className="h-8 w-8 flex-shrink-0 rounded-full object-cover"
                  loading="lazy"
                />
              ) : (
                <div className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full bg-primary/10 text-[10px] font-semibold text-primary">
                  {it.symbol.slice(0, 3)}
                </div>
              )}
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-1.5">
                  <span className="text-sm font-semibold text-foreground">{it.symbol}</span>
                  {it.badge && (
                    <span className="rounded bg-primary/10 px-1.5 py-0.5 text-[9px] font-medium uppercase tracking-wide text-primary">
                      {it.badge}
                    </span>
                  )}
                </div>
                <div className="text-xs text-muted-foreground truncate">
                  {formatAmount(it.amount, it.symbol)}
                  {typeof it.usd === 'number' && it.usd > 0 && (
                    <span className="ml-1">· {formatUsd(it.usd)}</span>
                  )}
                  {typeof it.transactions === 'number' && (
                    <span className="ml-1">· {it.transactions.toLocaleString('en-US')} tx</span>
                  )}
                </div>
              </div>
            </Comp>
          );
        })}
      </div>
    </section>
  );
}

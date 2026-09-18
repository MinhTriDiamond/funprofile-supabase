/**
 * UnifiedTransactionSummary — dựng từ RPC aggregate `get_unified_summary`
 * (Phase 7A). Không còn tự group 5000 rows client-side.
 */
import { useMemo } from 'react';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Skeleton } from '@/components/ui/skeleton';
import { ArrowDownLeft, ArrowUpRight } from 'lucide-react';
import { WALLET_TOKENS } from '@/lib/tokens';
import { cn } from '@/lib/utils';
import { formatTokenAmount } from '@/lib/formatTokenAmount';
import { GIFT_TOKEN_DISPLAY_ORDER, getGiftTokenBaseSymbol } from '@/lib/giftTokenLabel';
import type { UnifiedFilters } from './types';
import type { UnifiedSummaryAggregate } from '@/hooks/useUnifiedTransactionHistory';

const TOKEN_ORDER = GIFT_TOKEN_DISPLAY_ORDER;

function TokenLogo({ symbol }: { symbol: string }) {
  const token = WALLET_TOKENS.find((t) => t.symbol === getGiftTokenBaseSymbol(symbol));
  if (!token) return <span className="text-[10px] font-bold text-muted-foreground">{symbol}</span>;
  const baseSymbol = getGiftTokenBaseSymbol(symbol);
  const sizeClass = baseSymbol === 'BTC' ? 'w-8 h-8' : baseSymbol === 'BTCB' ? 'w-[1.35rem] h-[1.35rem]' : 'w-4 h-4';
  return <img src={token.logo} alt={symbol} className={`${sizeClass} rounded-full`} />;
}

interface Props {
  data: UnifiedSummaryAggregate | null | undefined;
  filters?: UnifiedFilters;
  isLoading?: boolean;
  isFetching?: boolean;
  tokenFilter?: string;
  onTokenClick?: (symbol: string) => void;
}

export function UnifiedTransactionSummary({
  data,
  filters,
  isLoading,
  tokenFilter = 'all',
  onTokenClick,
}: Props) {
  const dir = filters?.direction ?? 'all';
  const showReceived = dir === 'all' || dir === 'in' || dir === 'unknown';
  const showSent = dir === 'all' || dir === 'out' || dir === 'unknown';

  const byToken = data?.byToken ?? [];
  const totals = data?.totals;

  const orderedTokens = useMemo(() => {
    const set = new Set<string>();
    for (const t of byToken) {
      if ((showReceived && t.in.count > 0) || (showSent && t.out.count > 0)) {
        set.add(t.token_symbol);
      }
    }
    const known = TOKEN_ORDER.filter((t) => set.has(t));
    const extras = [...set].filter((t) => !TOKEN_ORDER.includes(t));
    return [...known, ...extras];
  }, [byToken, showReceived, showSent]);

  const byTokenMap = useMemo(() => {
    const m = new Map(byToken.map((t) => [t.token_symbol, t]));
    return m;
  }, [byToken]);

  if (isLoading && !data) {
    return (
      <div className="space-y-2">
        <Skeleton className="h-24 w-full" />
        <Skeleton className="h-8 w-full" />
      </div>
    );
  }

  const receivedCount = totals?.count_in ?? 0;
  const sentCount = totals?.count_out ?? 0;
  const totalCount = totals?.count_total ?? 0;

  return (
    <div className="space-y-1.5">
      {orderedTokens.length === 0 ? (
        <div className="rounded-lg border border-border py-4">
          <p className="text-xs text-muted-foreground text-center">Chưa có giao dịch phù hợp với bộ lọc.</p>
        </div>
      ) : (
        <div className="border border-border rounded-lg overflow-hidden">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow className="bg-gradient-to-r from-emerald-50/60 to-amber-50/60 dark:from-emerald-950/20 dark:to-amber-950/20">
                  <TableHead className="text-sm font-bold w-[70px] px-2 py-1.5 whitespace-nowrap">Token</TableHead>
                  {showReceived && (
                    <>
                      <TableHead className="text-sm font-bold text-green-600 text-right px-2 py-1.5 whitespace-nowrap">
                        Tổng nhận (gồm swap)
                      </TableHead>
                      <TableHead className="text-sm font-bold text-green-600 text-right px-2 py-1.5 whitespace-nowrap">
                        Lệnh
                      </TableHead>
                    </>
                  )}
                  {showSent && (
                    <>
                      <TableHead className="text-sm font-bold text-red-600 text-right px-2 py-1.5 whitespace-nowrap">
                        Tổng đã gửi (gồm swap)
                      </TableHead>
                      <TableHead className="text-sm font-bold text-red-600 text-right px-2 py-1.5 whitespace-nowrap">
                        Lệnh
                      </TableHead>
                    </>
                  )}
                </TableRow>
              </TableHeader>
              <TableBody>
                {orderedTokens.map((sym) => {
                  const t = byTokenMap.get(sym);
                  const recv = t?.in ?? { count: 0, sum: 0 };
                  const sent = t?.out ?? { count: 0, sum: 0 };
                  return (
                    <TableRow
                      key={sym}
                      className={cn(
                        'transition-colors',
                        onTokenClick && 'cursor-pointer hover:bg-muted/50',
                        tokenFilter === sym && 'bg-primary/10 hover:bg-primary/15',
                      )}
                      onClick={() => onTokenClick?.(tokenFilter === sym ? 'all' : sym)}
                    >
                      <TableCell className="px-2 py-1">
                        <div className="flex items-center gap-1.5 whitespace-nowrap">
                          <TokenLogo symbol={sym} />
                          <span className="text-sm font-bold">{sym}</span>
                        </div>
                      </TableCell>
                      {showReceived && (
                        <>
                          <TableCell className="text-right px-2 py-1 whitespace-nowrap">
                            <span className="text-sm font-semibold text-green-600">
                              {formatTokenAmount(recv.sum, getGiftTokenBaseSymbol(sym))}
                            </span>
                          </TableCell>
                          <TableCell className="text-right px-2 py-1 whitespace-nowrap">
                            <span className="text-sm font-semibold text-green-600">{recv.count}</span>
                          </TableCell>
                        </>
                      )}
                      {showSent && (
                        <>
                          <TableCell className="text-right px-2 py-1 whitespace-nowrap">
                            <span className="text-sm font-semibold text-red-600">
                              {formatTokenAmount(sent.sum, getGiftTokenBaseSymbol(sym))}
                            </span>
                          </TableCell>
                          <TableCell className="text-right px-2 py-1 whitespace-nowrap">
                            <span className="text-sm font-semibold text-red-600">{sent.count}</span>
                          </TableCell>
                        </>
                      )}
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        </div>
      )}

      <div className="flex items-center justify-between bg-gradient-to-r from-emerald-50/60 to-amber-50/60 dark:from-emerald-950/20 dark:to-amber-950/20 border border-border rounded-lg px-3 py-1.5">
        <div className="flex items-center gap-4">
          {showReceived && (
            <div className="flex items-center gap-1">
              <ArrowDownLeft className="w-3.5 h-3.5 text-green-600" />
              <span className="text-sm text-muted-foreground">Nhận:</span>
              <span className="text-sm font-bold text-green-600">{receivedCount}</span>
            </div>
          )}
          {showSent && (
            <div className="flex items-center gap-1">
              <ArrowUpRight className="w-3.5 h-3.5 text-red-600" />
              <span className="text-sm text-muted-foreground">Gửi:</span>
              <span className="text-sm font-bold text-red-600">{sentCount}</span>
            </div>
          )}
        </div>
        <span className="text-sm font-bold text-foreground">
          Tổng: {totalCount} GD
        </span>
      </div>
    </div>
  );
}

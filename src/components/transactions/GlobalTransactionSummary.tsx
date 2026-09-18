/**
 * GlobalTransactionSummary — bảng Token | Volume | Transactions cho scope="global".
 * Không hiển thị Nhận/Gửi/Net/Pending/Need-review vì global không có góc nhìn "tôi".
 */
import { useMemo } from 'react';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Skeleton } from '@/components/ui/skeleton';
import { WALLET_TOKENS } from '@/lib/tokens';
import { formatTokenAmount } from '@/lib/formatTokenAmount';
import { GIFT_TOKEN_DISPLAY_ORDER, getGiftTokenBaseSymbol } from '@/lib/giftTokenLabel';
import type { UnifiedSummaryAggregate } from '@/hooks/useUnifiedTransactionHistory';

const TOKEN_ORDER = GIFT_TOKEN_DISPLAY_ORDER;

function TokenLogo({ symbol }: { symbol: string }) {
  const baseSymbol = getGiftTokenBaseSymbol(symbol);
  const token = WALLET_TOKENS.find((t) => t.symbol === baseSymbol);
  if (!token) return <span className="text-[10px] font-bold text-muted-foreground">{symbol}</span>;
  const sizeClass = baseSymbol === 'BTC' ? 'w-8 h-8' : baseSymbol === 'BTCB' ? 'w-[1.35rem] h-[1.35rem]' : 'w-4 h-4';
  return <img src={token.logo} alt={symbol} className={`${sizeClass} rounded-full`} />;
}

interface Props {
  data: UnifiedSummaryAggregate | null | undefined;
  isLoading?: boolean;
}

export function GlobalTransactionSummary({ data, isLoading }: Props) {
  const byToken = data?.byToken ?? [];
  const totals = data?.totals;

  const rows = useMemo(() => {
    const list = byToken.map((t) => {
      // Volume: ưu tiên phía gửi (out.sum) để tránh double-count. Fallback sang max nếu không có out.
      const volume = t.out.sum > 0 ? t.out.sum : Math.max(t.in.sum, t.out.sum);
      // Transactions: mỗi tx chỉ 1 side ở global gift → max thay vì cộng.
      const count = Math.max(t.in.count, t.out.count);
      return { symbol: t.token_symbol, volume, count };
    }).filter((r) => r.count > 0);

    const known = TOKEN_ORDER.filter((sym) => list.some((r) => r.symbol === sym))
      .map((sym) => list.find((r) => r.symbol === sym)!);
    const extras = list.filter((r) => !TOKEN_ORDER.includes(r.symbol));
    return [...known, ...extras];
  }, [byToken]);

  if (isLoading && !data) {
    return (
      <div className="space-y-2">
        <Skeleton className="h-24 w-full" />
        <Skeleton className="h-8 w-full" />
      </div>
    );
  }

  return (
    <div className="space-y-1.5">
      {rows.length === 0 ? (
        <div className="rounded-lg border border-border py-4">
          <p className="text-xs text-muted-foreground text-center">Chưa có giao dịch phù hợp với bộ lọc.</p>
        </div>
      ) : (
        <div className="border border-border rounded-lg overflow-hidden">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow className="bg-gradient-to-r from-emerald-50/60 to-amber-50/60 dark:from-emerald-950/20 dark:to-amber-950/20">
                  <TableHead className="text-sm font-bold w-[80px] px-2 py-1.5 whitespace-nowrap">Token</TableHead>
                  <TableHead className="text-sm font-bold text-right px-2 py-1.5 whitespace-nowrap">Volume</TableHead>
                  <TableHead className="text-sm font-bold text-right px-2 py-1.5 whitespace-nowrap">Số giao dịch</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((r) => (
                  <TableRow key={r.symbol}>
                    <TableCell className="px-2 py-1">
                      <div className="flex items-center gap-1.5 whitespace-nowrap">
                        <TokenLogo symbol={r.symbol} />
                        <span className="text-sm font-bold">{r.symbol}</span>
                      </div>
                    </TableCell>
                    <TableCell className="text-right px-2 py-1 whitespace-nowrap">
                      <span className="text-sm font-semibold text-foreground">
                        {formatTokenAmount(r.volume, getGiftTokenBaseSymbol(r.symbol))}
                      </span>
                    </TableCell>
                    <TableCell className="text-right px-2 py-1 whitespace-nowrap">
                      <span className="text-sm font-semibold text-foreground tabular-nums">
                        {r.count.toLocaleString('vi-VN')}
                      </span>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </div>
      )}

      <div className="flex items-center justify-end bg-gradient-to-r from-emerald-50/60 to-amber-50/60 dark:from-emerald-950/20 dark:to-amber-950/20 border border-border rounded-lg px-3 py-1.5">
        <span className="text-sm font-bold text-foreground">
          Tổng: {(totals?.count_total ?? 0).toLocaleString('vi-VN')} giao dịch
        </span>
      </div>
    </div>
  );
}

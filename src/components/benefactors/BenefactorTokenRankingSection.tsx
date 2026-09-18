import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Skeleton } from '@/components/ui/skeleton';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { ArrowDownLeft, ArrowUpRight, Coins } from 'lucide-react';
import { useTokenLeaderboard, type Direction, type TimeRange } from '@/hooks/useContributionDimensions';

interface Props {
  availableSymbols: string[];
  selectedSymbol: string | null;
  onSelectSymbol: (symbol: string) => void;
  timeRange: TimeRange;
}

function formatAmount(n: number, symbol: string): string {
  const maxDigits = ['BTC', 'BTCB'].includes(symbol) ? 8 : ['BNB', 'TONCOIN'].includes(symbol) ? 6 : 3;
  return n.toLocaleString('en-US', { maximumFractionDigits: maxDigits });
}

function formatUsd(n: number): string {
  if (!Number.isFinite(n) || n <= 0) return '';
  if (n >= 1) return `$${n.toLocaleString('en-US', { maximumFractionDigits: 2 })}`;
  return `$${n.toLocaleString('en-US', { maximumFractionDigits: 4 })}`;
}

export function BenefactorTokenRankingSection({
  availableSymbols,
  selectedSymbol,
  onSelectSymbol,
  timeRange,
}: Props) {
  const [direction, setDirection] = useState<Direction>('sent');
  const navigate = useNavigate();

  useEffect(() => {
    if (!selectedSymbol && availableSymbols.length > 0) {
      onSelectSymbol(availableSymbols[0]);
    }
  }, [selectedSymbol, availableSymbols, onSelectSymbol]);

  const { data, isLoading } = useTokenLeaderboard({
    tokenSymbol: selectedSymbol ?? '',
    direction,
    timeRange,
    limit: 100,
    enabled: !!selectedSymbol,
  });

  if (availableSymbols.length === 0) {
    return (
      <div className="rounded-lg border border-dashed border-border bg-card/50 p-8 text-center text-sm text-muted-foreground">
        <Coins className="mx-auto mb-2 h-8 w-8 opacity-50" />
        <p>Chưa có token nào để xếp hạng trong khoảng thời gian này.</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <Select value={selectedSymbol ?? undefined} onValueChange={onSelectSymbol}>
          <SelectTrigger className="w-40">
            <SelectValue placeholder="Chọn token" />
          </SelectTrigger>
          <SelectContent>
            {availableSymbols.map((s) => (
              <SelectItem key={s} value={s}>
                {s}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select value={direction} onValueChange={(v) => setDirection(v as Direction)}>
          <SelectTrigger className="w-40">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="sent">
              <span className="inline-flex items-center gap-1.5">
                <ArrowUpRight className="h-3.5 w-3.5" /> Top đã tặng
              </span>
            </SelectItem>
            <SelectItem value="received">
              <span className="inline-flex items-center gap-1.5">
                <ArrowDownLeft className="h-3.5 w-3.5" /> Top đã nhận
              </span>
            </SelectItem>
          </SelectContent>
        </Select>
      </div>

      {isLoading ? (
        <div className="space-y-2">
          {[...Array(6)].map((_, i) => (
            <Skeleton key={i} className="h-14 w-full rounded-lg" />
          ))}
        </div>
      ) : !data || data.length === 0 ? (
        <div className="rounded-lg border border-dashed border-border bg-card/50 p-8 text-center text-sm text-muted-foreground">
          Chưa có dữ liệu {direction === 'sent' ? 'người tặng' : 'người nhận'} cho {selectedSymbol}.
        </div>
      ) : (
        <ol className="space-y-2">
          {data.map((row) => (
            <li
              key={row.user_id}
              onClick={() => navigate(`/profile/${row.user_id}`)}
              className="flex cursor-pointer items-center gap-3 rounded-lg border bg-card p-3 transition-all hover:shadow-md"
            >
              <span className="w-6 text-center text-sm font-semibold text-muted-foreground">
                {row.rank}
              </span>
              <Avatar className="h-9 w-9">
                <AvatarImage src={row.avatar_url ?? undefined} />
                <AvatarFallback className="text-xs">
                  {(row.username ?? '?').slice(0, 2).toUpperCase()}
                </AvatarFallback>
              </Avatar>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium">@{row.username ?? 'unknown'}</p>
                {row.full_name && (
                  <p className="truncate text-xs text-muted-foreground">{row.full_name}</p>
                )}
              </div>
              <div className="text-right">
                <p className="text-sm font-semibold text-foreground">
                  {formatAmount(row.total_amount, row.token_symbol)}{' '}
                  <span className="text-xs text-muted-foreground">{row.token_symbol}</span>
                </p>
                <p className="text-xs text-muted-foreground">
                  {row.total_transactions} tx
                  {row.total_amount_usd > 0 && ` · ${formatUsd(row.total_amount_usd)}`}
                </p>
              </div>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}

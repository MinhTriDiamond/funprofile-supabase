import { Crown, Trophy, Medal, Sparkles } from 'lucide-react';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import type { TokenTotals } from '@/hooks/useBenefactorLeaderboard';

export interface UsdRankingRowData {
  user_id: string;
  username: string;
  full_name: string | null;
  avatar_url: string | null;
  rank: number;
  total_usd: number;
  total_transactions: number;
  light_score?: number;
  totals_by_token: TokenTotals;
}

interface UsdRankingRowProps {
  row: UsdRankingRowData;
  topUsd: number;
  onClick?: (userId: string) => void;
}

const formatUsd = (n: number) =>
  n >= 1
    ? `$${n.toLocaleString('en-US', { maximumFractionDigits: 2 })}`
    : `$${n.toLocaleString('en-US', { maximumFractionDigits: 4 })}`;

const formatUsdCompact = (n: number) => {
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(2)}M`;
  if (n >= 10_000) return `$${(n / 1_000).toFixed(1)}K`;
  return formatUsd(n);
};

const formatCoin = (amount: number, symbol: string) => {
  const maxDigits = ['BTC', 'BTCB'].includes(symbol) ? 6 : ['BNB', 'TONCOIN'].includes(symbol) ? 4 : 2;
  return `${amount.toLocaleString('en-US', { maximumFractionDigits: maxDigits })}`;
};

const formatCount = (n: number) => {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(2)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return n.toLocaleString('en-US');
};

function getRankIcon(rank: number) {
  if (rank === 1) return <Crown className="w-4 h-4 text-gold" />;
  if (rank === 2) return <Trophy className="w-4 h-4 text-gray-300" />;
  if (rank === 3) return <Medal className="w-4 h-4 text-amber-500" />;
  return <span className="text-xs font-bold">{rank}</span>;
}

function getRankBg(rank: number) {
  switch (rank) {
    case 1:
      return 'bg-gradient-to-r from-gold/20 to-amber-500/10 border-gold/50';
    case 2:
      return 'bg-gradient-to-r from-gray-400/20 to-gray-300/10 border-gray-400/50';
    case 3:
      return 'bg-gradient-to-r from-amber-600/20 to-amber-500/10 border-amber-600/50';
    default:
      return 'bg-card border-border';
  }
}

function getRankBadgeClass(rank: number) {
  if (rank === 1) return 'bg-gold text-primary-foreground border-gold';
  if (rank === 2) return 'bg-muted text-foreground border-muted';
  if (rank === 3) return 'bg-amber-600/80 text-primary-foreground border-amber-600';
  return 'bg-muted text-muted-foreground border-border';
}

export function UsdRankingRow({ row, topUsd, onClick }: UsdRankingRowProps) {
  const pct = topUsd > 0 ? Math.max(2, Math.min(100, (row.total_usd / topUsd) * 100)) : 0;

  // Sort tokens by USD desc, take top 3 chips, group rest as +N
  const tokenEntries = Object.entries(row.totals_by_token || {}).sort(
    (a, b) => Number(b[1]?.usd || 0) - Number(a[1]?.usd || 0),
  );
  const topChips = tokenEntries.slice(0, 3);
  const restCount = Math.max(0, tokenEntries.length - topChips.length);

  // FUN aux: only render if data available and NOT already in top chips
  const funEntry = tokenEntries.find(([s]) => s === 'FUN');
  const funInTop = topChips.some(([s]) => s === 'FUN');
  const showFunAux = !!funEntry && !funInTop && Number(funEntry[1]?.amount || 0) > 0;

  return (
    <div
      role={onClick ? 'button' : undefined}
      tabIndex={onClick ? 0 : undefined}
      onClick={() => onClick?.(row.user_id)}
      onKeyDown={(e) => {
        if (onClick && (e.key === 'Enter' || e.key === ' ')) {
          e.preventDefault();
          onClick(row.user_id);
        }
      }}
      className={`group rounded-xl border p-3 sm:p-4 transition-all hover:shadow-md ${
        onClick ? 'cursor-pointer' : ''
      } ${getRankBg(row.rank)}`}
    >
      <div className="flex items-start gap-3 sm:gap-4">
        {/* Avatar + rank badge overlay */}
        <div className="relative shrink-0">
          <Avatar className="w-11 h-11 sm:w-12 sm:h-12 border-2 border-border">
            <AvatarImage src={row.avatar_url || undefined} />
            <AvatarFallback className="bg-primary/20 text-primary">
              {row.username?.[0]?.toUpperCase() || 'U'}
            </AvatarFallback>
          </Avatar>
          <span
            className={`absolute -top-1 -left-1 flex h-5 w-5 items-center justify-center rounded-full border shadow-sm ${getRankBadgeClass(row.rank)}`}
            aria-label={`Rank ${row.rank}`}
          >
            {getRankIcon(row.rank)}
          </span>
        </div>

        {/* Middle: name + chips + meta */}
        <div className="min-w-0 flex-1">
          <div className="flex items-baseline gap-2 min-w-0">
            <p className="font-semibold text-sm sm:text-base truncate">@{row.username}</p>
            {row.full_name && (
              <p className="hidden sm:block text-xs text-muted-foreground truncate">{row.full_name}</p>
            )}
          </div>
          {row.full_name && (
            <p className="sm:hidden text-xs text-muted-foreground truncate">{row.full_name}</p>
          )}

          {/* USD prominent on mobile (right column hides on mobile) */}
          <p className="sm:hidden mt-1 text-lg font-bold text-primary">
            {formatUsdCompact(row.total_usd)}
          </p>

          {/* Progress bar */}
          <div className="mt-2 h-1.5 w-full sm:max-w-40 rounded-full bg-primary/10 overflow-hidden">
            <div
              className="h-full bg-primary transition-all"
              style={{ width: `${pct}%` }}
              aria-hidden="true"
            />
          </div>

          {/* Token chips */}
          {topChips.length > 0 && (
            <div className="mt-2 flex flex-wrap gap-1.5">
              {topChips.map(([symbol, item]) => {
                const amount = Number(item.amount || 0);
                const usd = Number(item.usd || 0);
                const txs = Number(item.transactions || 0);
                return (
                  <span
                    key={symbol}
                    title={`${formatCoin(amount, symbol)} ${symbol} • ${formatUsd(usd)} • ${txs} lệnh`}
                    className="rounded-md border bg-background px-2 py-0.5 text-[11px] font-medium text-foreground"
                  >
                    <span className="text-muted-foreground mr-1">{symbol}</span>
                    {formatCoin(amount, symbol)}
                  </span>
                );
              })}
              {restCount > 0 && (
                <span className="rounded-md border bg-background px-2 py-0.5 text-[11px] font-medium text-muted-foreground">
                  +{restCount}
                </span>
              )}
            </div>
          )}

          {/* FUN aux (ecosystem, không tính rank) */}
          {showFunAux && funEntry && (
            <div className="mt-1.5 inline-flex items-center gap-1.5 rounded-md border border-dashed border-primary/30 bg-primary/5 px-2 py-0.5 text-[11px] text-muted-foreground">
              <Sparkles className="h-3 w-3 text-primary" />
              <span className="font-medium text-foreground">
                FUN {formatCoin(Number(funEntry[1].amount || 0), 'FUN')}
              </span>
              <span className="uppercase tracking-wide">ecosystem</span>
            </div>
          )}

          {/* Meta */}
          <p className="mt-1.5 text-[11px] text-muted-foreground">
            ⭐ {formatCount(row.light_score ?? 0)} · {formatCount(row.total_transactions)} tx
          </p>
        </div>

        {/* Right column: USD prominent (desktop / tablet) */}
        <div className="hidden sm:flex flex-col items-end shrink-0 min-w-[6rem]">
          <p className="text-xl font-bold text-primary leading-tight">
            {formatUsdCompact(row.total_usd)}
          </p>
          <p className="text-[11px] text-muted-foreground">
            {formatUsd(row.total_usd)}
          </p>
        </div>
      </div>
    </div>
  );
}

import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Sparkles,
  Users,
  ArrowUpRight,
  ArrowDownLeft,
  Layers,
  Info,
  Receipt,
  Inbox,
} from 'lucide-react';
import {
  useContributionDimensionStats,
  useTokenLeaderboard,
  type TimeRange,
  type DimensionTokenStats,
  type TokenLeaderboardEntry,
} from '@/hooks/useContributionDimensions';

interface Props {
  /** Loại dimension cần render. Mặc định `ecosystem`. */
  dimension?: string;
  timeRange?: TimeRange;
}

/**
 * ContributionDimensionsPanel — kiến trúc GENERIC, không hardcode tên token nào.
 * Đọc SSOT `donations` + `tokens_registry` qua RPC generic.
 * Không import bất kỳ hook USD leaderboard nào; hoàn toàn độc lập.
 */
export function ContributionDimensionsPanel({
  dimension = 'ecosystem',
  timeRange = 'all',
}: Props) {
  const { data, isLoading } = useContributionDimensionStats(dimension, timeRange);

  if (isLoading) {
    return (
      <section className="mt-8">
        <Skeleton className="h-6 w-64 mb-3" />
        <Skeleton className="h-48 w-full rounded-xl" />
      </section>
    );
  }

  if (!data || data.length === 0) return null;

  return (
    <section className="mt-8" aria-label="Contribution Dimensions">
      <div className="mb-3 flex items-center gap-2">
        <Layers className="h-4 w-4 text-primary" />
        <h2 className="text-lg font-semibold text-foreground">
          Đóng góp hệ sinh thái
        </h2>
      </div>

      <div className="mb-4 flex items-start gap-2 rounded-lg border border-dashed border-border/70 bg-muted/30 px-3 py-2 text-xs text-muted-foreground">
        <Info className="h-3.5 w-3.5 mt-0.5 shrink-0 text-primary" />
        <p>
          Các dimension bên dưới <strong className="text-foreground">không ảnh hưởng USD Ranking</strong>.
          Chúng sẽ tự động tham gia bảng xếp hạng khi có cơ chế định giá chính thức.
        </p>
      </div>

      <div className="space-y-4">
        {data.map((dim) => (
          <DimensionCard key={dim.token_symbol} dim={dim} timeRange={timeRange} />
        ))}
      </div>
    </section>
  );
}

function formatCompact(n: number, decimals = 0): string {
  if (!Number.isFinite(n)) return '0';
  if (n >= 1e9) return `${(n / 1e9).toFixed(2)}B`;
  if (n >= 1e6) return `${(n / 1e6).toFixed(2)}M`;
  if (n >= 1e3) return `${(n / 1e3).toFixed(2)}K`;
  return n.toLocaleString('en-US', { maximumFractionDigits: decimals });
}

function dimensionBadgeClass(dimension: string): string {
  const lower = dimension.toLowerCase();
  if (lower === 'ecosystem') {
    return 'bg-primary/10 text-primary';
  }
  if (lower.includes('testnet')) {
    return 'bg-amber-500/10 text-amber-600 dark:text-amber-400';
  }
  return 'border border-border text-muted-foreground bg-transparent';
}

function dimensionBadgeLabel(dimension: string): string {
  const lower = dimension.toLowerCase();
  if (lower === 'ecosystem') return 'Ecosystem';
  if (lower.includes('testnet')) return 'Testnet';
  return dimension;
}

function DimensionCard({
  dim,
  timeRange,
}: {
  dim: DimensionTokenStats;
  timeRange: TimeRange;
}) {
  const symbol = dim.token_symbol;
  const givers = useTokenLeaderboard({
    tokenSymbol: symbol,
    direction: 'sent',
    timeRange,
    limit: 5,
  });
  const receivers = useTokenLeaderboard({
    tokenSymbol: symbol,
    direction: 'received',
    timeRange,
    limit: 5,
  });

  return (
    <article className="rounded-xl border bg-card p-3 sm:p-5 shadow-sm">
      <header className="flex items-center gap-3 mb-4">
        {dim.token_icon ? (
          <img
            src={dim.token_icon}
            alt={symbol}
            className="h-10 w-10 rounded-full object-cover ring-1 ring-border"
            loading="lazy"
          />
        ) : (
          <div className="h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center ring-1 ring-border">
            <Sparkles className="h-4 w-4 text-primary" />
          </div>
        )}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-lg font-bold text-foreground">{symbol}</span>
            <span
              className={`text-[10px] uppercase tracking-wide rounded px-1.5 py-0.5 ${dimensionBadgeClass(
                dim.ranking_dimension,
              )}`}
            >
              {dimensionBadgeLabel(dim.ranking_dimension)}
            </span>
          </div>
          <p className="text-xs text-muted-foreground">Chưa tính vào USD Ranking</p>
        </div>
      </header>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-2 sm:gap-3 mb-5">
        <StatCell
          icon={<ArrowUpRight className="h-3.5 w-3.5" />}
          label="Đã tặng"
          value={formatCompact(dim.total_sent)}
          suffix={symbol}
        />
        <StatCell
          icon={<ArrowDownLeft className="h-3.5 w-3.5" />}
          label="Đã nhận"
          value={formatCompact(dim.total_received)}
          suffix={symbol}
        />
        <StatCell
          icon={<Users className="h-3.5 w-3.5" />}
          label="Người tham gia"
          value={dim.unique_participants.toLocaleString('vi-VN')}
        />
        <StatCell
          icon={<Receipt className="h-3.5 w-3.5" />}
          label="Giao dịch"
          value={dim.transactions.toLocaleString('vi-VN')}
        />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <TopList
          title="Top người tặng"
          icon={<ArrowUpRight className="h-3 w-3" />}
          symbol={symbol}
          entries={givers.data ?? []}
          isLoading={givers.isLoading}
        />
        <TopList
          title="Top người nhận"
          icon={<ArrowDownLeft className="h-3 w-3" />}
          symbol={symbol}
          entries={receivers.data ?? []}
          isLoading={receivers.isLoading}
        />
      </div>
    </article>
  );
}

function StatCell({
  icon,
  label,
  value,
  suffix,
}: {
  icon?: React.ReactNode;
  label: string;
  value: string;
  suffix?: string;
}) {
  return (
    <div className="rounded-lg border bg-muted/30 p-2.5 sm:p-3">
      <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground mb-0.5">
        {icon}
        <span className="truncate">{label}</span>
      </div>
      <div className="text-sm sm:text-base font-semibold text-foreground truncate">
        {value}
        {suffix && <span className="ml-1 text-[10px] text-muted-foreground">{suffix}</span>}
      </div>
    </div>
  );
}

function TopList({
  title,
  icon,
  symbol,
  entries,
  isLoading,
}: {
  title: string;
  icon?: React.ReactNode;
  symbol: string;
  entries: TokenLeaderboardEntry[];
  isLoading: boolean;
}) {
  // Mobile: top 3; Desktop: top 5. Render 2 lists via responsive utility classes.
  const top3 = entries.slice(0, 3);
  const top5 = entries.slice(0, 5);

  return (
    <div>
      <h3 className="text-xs font-medium text-muted-foreground mb-2 flex items-center gap-1.5">
        {icon}
        <span>{title}</span>
      </h3>
      {isLoading ? (
        <div className="space-y-2">
          {[1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-10 w-full rounded-lg" />
          ))}
        </div>
      ) : entries.length === 0 ? (
        <div className="flex items-center justify-center gap-2 text-xs text-muted-foreground py-3 border rounded-lg">
          <Inbox className="h-3.5 w-3.5" />
          <span>Chưa có dữ liệu</span>
        </div>
      ) : (
        <>
          <ol className="space-y-1.5 md:hidden">
            {top3.map((e) => (
              <TopRow key={e.user_id} entry={e} symbol={symbol} />
            ))}
          </ol>
          <ol className="space-y-1.5 hidden md:block">
            {top5.map((e) => (
              <TopRow key={e.user_id} entry={e} symbol={symbol} />
            ))}
          </ol>
        </>
      )}
    </div>
  );
}

function TopRow({ entry, symbol }: { entry: TokenLeaderboardEntry; symbol: string }) {
  return (
    <li className="flex items-center gap-2 rounded-lg border bg-background/50 px-2.5 py-1.5">
      <span className="w-5 h-5 rounded bg-muted text-[10px] font-semibold text-muted-foreground flex items-center justify-center shrink-0">
        {entry.rank}
      </span>
      <Avatar className="h-6 w-6">
        <AvatarImage src={entry.avatar_url ?? undefined} />
        <AvatarFallback className="text-[10px]">
          {(entry.username ?? '?').slice(0, 2).toUpperCase()}
        </AvatarFallback>
      </Avatar>
      <span className="flex-1 min-w-0 text-xs font-medium truncate">
        {entry.username ?? 'unknown'}
      </span>
      <span className="text-xs font-semibold text-foreground whitespace-nowrap">
        {formatCompact(entry.total_amount)} <span className="text-[10px] text-muted-foreground">{symbol}</span>
      </span>
    </li>
  );
}

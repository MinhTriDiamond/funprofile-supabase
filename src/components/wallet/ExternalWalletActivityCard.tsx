import { useMemo, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import {
  ArrowDownLeft,
  ArrowUpRight,
  ExternalLink,
  RefreshCw,
  AlertTriangle,
  Settings2,
  ArrowLeftRight,
  Image as ImageIcon,
  Coins,
  Wallet,
} from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import { useDateLocale } from '@/hooks/useDateLocale';
import { useWatchedWallets } from '@/hooks/useWatchedWallets';
import { useExternalWalletActivity, type ExternalTx } from '@/hooks/useExternalWalletActivity';
import { WatchedWalletsManager } from './WatchedWalletsManager';
import { cn } from '@/lib/utils';

type CategoryFilter = 'all' | 'native' | 'token' | 'swap' | 'nft';
type ChainFilter = 'all' | 'bsc' | 'btc';

function shorten(addr: string) {
  if (!addr) return '—';
  return addr.length > 12 ? `${addr.slice(0, 6)}…${addr.slice(-4)}` : addr;
}

function explorerTxUrl(tx: ExternalTx): string {
  if (tx.chain === 'btc') return `https://mempool.space/tx/${tx.hash}`;
  if (tx.chain === 'bsc_testnet') return `https://testnet.bscscan.com/tx/${tx.hash}`;
  return `https://bscscan.com/tx/${tx.hash}`;
}

function explorerAddrUrl(tx: ExternalTx, addr: string): string {
  if (tx.chain === 'btc') return `https://mempool.space/address/${addr}`;
  if (tx.chain === 'bsc_testnet') return `https://testnet.bscscan.com/address/${addr}`;
  return `https://bscscan.com/address/${addr}`;
}

function CategoryIcon({ cat }: { cat: ExternalTx['category'] }) {
  if (cat === 'swap') return <ArrowLeftRight className="w-3 h-3" />;
  if (cat === 'nft') return <ImageIcon className="w-3 h-3" />;
  if (cat === 'token') return <Coins className="w-3 h-3" />;
  return <Wallet className="w-3 h-3" />;
}

function TxRow({ tx }: { tx: ExternalTx }) {
  const dateLocale = useDateLocale();
  const watched = (tx.watchedAddress || '').toLowerCase();
  const isSend = (tx.from || '').toLowerCase() === watched;
  const timeAgo = formatDistanceToNow(new Date(tx.timestamp), { addSuffix: true, locale: dateLocale });

  return (
    <div className="border border-border/60 rounded-lg p-2.5 space-y-1.5 hover:bg-accent/30 transition-colors">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div className="flex items-center gap-1.5">
          <Badge
            variant="outline"
            className={
              isSend
                ? 'border-red-500 text-red-600 bg-red-50 dark:bg-red-950/30 text-xs'
                : 'border-green-500 text-green-600 bg-green-50 dark:bg-green-950/30 text-xs'
            }
          >
            {isSend ? <ArrowUpRight className="w-3 h-3 mr-0.5" /> : <ArrowDownLeft className="w-3 h-3 mr-0.5" />}
            {isSend ? 'Gửi' : 'Nhận'}
          </Badge>
          <Badge variant="secondary" className="text-[10px] gap-1">
            <CategoryIcon cat={tx.category} />
            {tx.category}
          </Badge>
          <Badge
            variant="outline"
            className="text-[10px] bg-orange-50 text-orange-700 border-orange-200 dark:bg-orange-950/20"
          >
            {tx.chain === 'btc' ? 'BTC' : tx.chain === 'bsc_testnet' ? 'BSC Testnet' : 'BSC'}
          </Badge>
          {tx.watchedLabel && (
            <span className="text-[10px] text-muted-foreground hidden sm:inline">· {tx.watchedLabel}</span>
          )}
        </div>
        <Badge
          className={cn(
            'text-[10px]',
            tx.status === 'success' && 'bg-green-600',
            tx.status === 'pending' && 'bg-yellow-600',
            tx.status === 'failed' && 'bg-destructive',
          )}
        >
          {tx.status === 'success' ? 'Thành công' : tx.status === 'pending' ? 'Chờ xác nhận' : 'Thất bại'}
        </Badge>
      </div>

      <div className="flex items-center justify-between gap-2 flex-wrap text-sm">
        <div className="flex items-center gap-1.5 min-w-0">
          <a
            href={explorerAddrUrl(tx, tx.from)}
            target="_blank"
            rel="noopener noreferrer"
            className="font-mono text-xs text-muted-foreground hover:text-primary"
          >
            {shorten(tx.from)}
          </a>
          <span className="text-muted-foreground">→</span>
          <a
            href={explorerAddrUrl(tx, tx.to)}
            target="_blank"
            rel="noopener noreferrer"
            className="font-mono text-xs text-muted-foreground hover:text-primary"
          >
            {shorten(tx.to)}
          </a>
        </div>
        <div className="flex items-center gap-2">
          <span className={cn('font-bold whitespace-nowrap', isSend ? 'text-red-600' : 'text-green-600')}>
            {isSend ? '-' : '+'}
            {tx.amount} {tx.tokenSymbol}
          </span>
        </div>
      </div>

      <div className="flex items-center justify-between text-[11px] text-muted-foreground">
        <span>{timeAgo}</span>
        <a
          href={explorerTxUrl(tx)}
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center gap-0.5 hover:text-primary font-mono"
        >
          {shorten(tx.hash)}
          <ExternalLink className="w-3 h-3" />
        </a>
      </div>
    </div>
  );
}

export function ExternalWalletActivityCard() {
  const { data: wallets, isLoading: walletsLoading } = useWatchedWallets();
  const { data, isFetching, refetch, error } = useExternalWalletActivity(wallets, 25);
  const [categoryFilter, setCategoryFilter] = useState<CategoryFilter>('all');
  const [chainFilter, setChainFilter] = useState<ChainFilter>('all');
  const [walletFilter, setWalletFilter] = useState<string>('all');
  const [managerOpen, setManagerOpen] = useState(false);

  const filtered = useMemo<ExternalTx[]>(() => {
    const txs = data?.result || [];
    return txs.filter((tx) => {
      if (categoryFilter !== 'all' && tx.category !== categoryFilter) return false;
      if (chainFilter !== 'all') {
        if (chainFilter === 'bsc' && tx.chain === 'btc') return false;
        if (chainFilter === 'btc' && tx.chain !== 'btc') return false;
      }
      if (walletFilter !== 'all' && tx.watchedAddress.toLowerCase() !== walletFilter.toLowerCase()) return false;
      return true;
    });
  }, [data, categoryFilter, chainFilter, walletFilter]);

  const lastSync = data?.lastSyncAt ? new Date(data.lastSyncAt) : null;
  const errors = data?.errors || [];
  const suspiciousCount = data?.suspiciousCount || 0;

  return (
    <Card className="border-orange-200/60 dark:border-orange-900/40">
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <CardTitle className="text-base flex items-center gap-2">
            <Wallet className="w-4 h-4 text-orange-600" />
            Giao dịch ví ngoài (tự động đồng bộ)
            {(walletsLoading || isFetching) && (
              <RefreshCw className="w-3.5 h-3.5 animate-spin text-muted-foreground" />
            )}
          </CardTitle>
          <div className="flex items-center gap-1.5">
            <Button size="sm" variant="ghost" onClick={() => refetch()} className="h-7 gap-1 text-xs">
              <RefreshCw className={cn('w-3.5 h-3.5', isFetching && 'animate-spin')} />
              Làm mới
            </Button>
            <Button size="sm" variant="outline" onClick={() => setManagerOpen(true)} className="h-7 gap-1 text-xs">
              <Settings2 className="w-3.5 h-3.5" />
              Quản lý ví
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-2">
        {/* Filter row */}
        <div className="flex items-center gap-1.5 flex-wrap text-xs">
          <Select value={chainFilter} onValueChange={(v) => setChainFilter(v as ChainFilter)}>
            <SelectTrigger className="h-7 w-[110px] text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent className="z-[9999]">
              <SelectItem value="all">Mọi chain</SelectItem>
              <SelectItem value="bsc">BSC</SelectItem>
              <SelectItem value="btc">BTC</SelectItem>
            </SelectContent>
          </Select>
          <Select value={categoryFilter} onValueChange={(v) => setCategoryFilter(v as CategoryFilter)}>
            <SelectTrigger className="h-7 w-[120px] text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent className="z-[9999]">
              <SelectItem value="all">Tất cả loại</SelectItem>
              <SelectItem value="native">Native</SelectItem>
              <SelectItem value="token">Token</SelectItem>
              <SelectItem value="swap">Swap</SelectItem>
              <SelectItem value="nft">NFT</SelectItem>
            </SelectContent>
          </Select>
          {wallets && wallets.length > 1 && (
            <Select value={walletFilter} onValueChange={setWalletFilter}>
              <SelectTrigger className="h-7 max-w-[200px] text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent className="z-[9999]">
                <SelectItem value="all">Mọi ví</SelectItem>
                {wallets.map((w) => (
                  <SelectItem key={`${w.chain}:${w.address}`} value={w.address}>
                    {w.label} ({shorten(w.address)})
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
          {lastSync && (
            <span className="ml-auto text-[10px] text-muted-foreground">
              Đồng bộ {formatDistanceToNow(lastSync, { addSuffix: true })}
            </span>
          )}
        </div>

        {/* Errors banner */}
        {(errors.length > 0 || error) && (
          <div className="flex items-start gap-2 rounded-lg border border-destructive/40 bg-destructive/5 p-2 text-xs">
            <AlertTriangle className="w-4 h-4 text-destructive flex-shrink-0 mt-0.5" />
            <div className="flex-1 min-w-0">
              <div className="font-semibold text-destructive">
                Một số nguồn dữ liệu đang lỗi — đang thử lại tự động.
              </div>
              <ul className="mt-1 space-y-0.5 text-muted-foreground">
                {error && <li>· {String((error as any)?.message || error)}</li>}
                {errors.slice(0, 3).map((e, i) => (
                  <li key={i} className="truncate">
                    · [{e.source}] {shorten(e.address)} — {e.message}
                  </li>
                ))}
                {errors.length > 3 && <li>· …và {errors.length - 3} lỗi khác</li>}
              </ul>
            </div>
            <Button size="sm" variant="ghost" onClick={() => refetch()} className="h-6 text-xs">
              Thử lại
            </Button>
          </div>
        )}

        {/* Body */}
        {walletsLoading ? (
          <div className="space-y-2">
            {[1, 2, 3].map((i) => (
              <Skeleton key={i} className="h-16 w-full rounded-lg" />
            ))}
          </div>
        ) : !wallets || wallets.length === 0 ? (
          <div className="text-center py-6 text-sm text-muted-foreground">
            Chưa có ví nào được theo dõi.
            <div className="mt-2">
              <Button size="sm" variant="outline" onClick={() => setManagerOpen(true)}>
                Thêm ví ngoài
              </Button>
            </div>
          </div>
        ) : filtered.length === 0 ? (
          <p className="text-center text-sm text-muted-foreground py-6">
            {isFetching ? 'Đang quét…' : 'Chưa có giao dịch nào.'}
          </p>
        ) : (
          <div className="space-y-2 max-h-[60vh] overflow-y-auto pr-1">
            {filtered.map((tx) => (
              <TxRow key={`${tx.chain}:${tx.hash}:${tx.watchedAddress}:${tx.tokenSymbol}`} tx={tx} />
            ))}
          </div>
        )}

        {suspiciousCount > 0 && (
          <div className="flex items-start gap-2 rounded-lg border border-amber-300/60 bg-amber-50 dark:bg-amber-950/20 p-2 text-[11px] text-amber-800 dark:text-amber-200">
            <AlertTriangle className="w-3.5 h-3.5 mt-0.5 flex-shrink-0" />
            <span>
              Một số token không xác minh đã được ẩn để bảo vệ bạn ({suspiciousCount} sự kiện). Chỉ token nằm trong danh
              sách đã duyệt mới hiển thị tại đây.
            </span>
          </div>
        )}

        <p className="text-[10px] text-muted-foreground text-center pt-1">
          Dữ liệu chỉ để theo dõi. Giao dịch ví ngoài KHÔNG được tính Light Score.
        </p>
      </CardContent>

      <WatchedWalletsManager open={managerOpen} onOpenChange={setManagerOpen} />
    </Card>
  );
}

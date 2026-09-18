/**
 * @deprecated Popup legacy. Profile History nay dùng route
 * `/profile/:username/history` (TransactionHistoryPage Unified).
 * Giữ tạm cho wallet subtab HistoryTab tham chiếu, sẽ xoá ở M6-Cleanup.
 */
// Build marker: user-search-popover-v3 (2026-04-18b) - force cache bust
import { useEffect, useMemo, useState } from 'react';
import { useLanguage } from '@/i18n/LanguageContext';
import { useWalletLabelMap } from '@/hooks/useExternalWalletLabels';
import { useNavigate } from 'react-router-dom';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Clock, ArrowDownLeft, ArrowUpRight, ArrowDownUp, ExternalLink, Filter, MessageSquare, ArrowRightLeft, ChevronDown, ChevronUp, CalendarDays, X, Receipt, RefreshCw, Download, Coins, Users } from 'lucide-react';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { DonationReceivedCard, type DonationReceivedData } from '@/components/donations/DonationReceivedCard';
import { type DonationFilter, type DonationRecord, type DonationSummary } from '@/hooks/usePublicDonationHistory';
import { usePublicDonationHistoryAuto } from '@/hooks/usePublicDonationHistoryAuto';
import { useShadowCompare } from '@/hooks/useShadowCompare';
import { usePublicWalletBalances } from '@/hooks/usePublicWalletBalances';
import { ExportTransactionsMenu } from '@/components/wallet/ExportTransactionsMenu';
import { mapDonationsToRows } from '@/utils/export';

import { getBscScanBaseUrl } from '@/lib/chainTokenMapping';
import { WALLET_TOKENS } from '@/lib/tokens';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from '@/components/ui/command';
import { Check } from 'lucide-react';
import { Calendar } from '@/components/ui/calendar';
import { cn } from '@/lib/utils';
import { format } from 'date-fns';
import { GIFT_TOKEN_DISPLAY_ORDER, getGiftTokenBaseSymbol, getGiftTokenLabel } from '@/lib/giftTokenLabel';

interface Props {
  userId: string;
  walletAddress?: string;
  userDisplayName?: string;
  userAvatarUrl?: string;
  username?: string;
  userCreatedAt?: string;
}

const TOKEN_ORDER = GIFT_TOKEN_DISPLAY_ORDER;

function formatDate(ts: string) {
  const date = new Date(ts);
  return date.toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

function formatTime(ts: string) {
  const date = new Date(ts);
  return date.toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' });
}

function formatAmount(num: number): string {
  if (num === 0) return '0';
  if (num < 0.0001) return num.toFixed(8);
  if (num < 1) return num.toFixed(4);
  return num.toLocaleString('vi-VN', { maximumFractionDigits: 4 });
}

function StatusBadge({ status, t }: { status: string; t: (key: any) => string }) {
  if (status === 'confirmed') return <Badge className="bg-green-600 hover:bg-green-700 text-xs">{t('statusSuccess')}</Badge>;
  if (status === 'pending') return <Badge variant="secondary" className="text-xs">{t('statusProcessing')}</Badge>;
  return <Badge variant="destructive" className="text-xs">{t('statusError')}</Badge>;
}

function TokenLogo({ symbol }: { symbol: string }) {
  const baseSymbol = getGiftTokenBaseSymbol(symbol);
  const token = WALLET_TOKENS.find(t => t.symbol === baseSymbol);
  if (!token) return <span className="text-[10px] font-bold text-muted-foreground">{symbol}</span>;
  const sizeClass = baseSymbol === 'BTC' ? 'w-8 h-8' : baseSymbol === 'BTCB' ? 'w-[1.35rem] h-[1.35rem]' : 'w-4 h-4';
  return <img src={token.logo} alt={symbol} className={`${sizeClass} rounded-full`} />;
}

function SummaryTable({ summary, activeFilter, tokenFilter, onTokenClick }: { summary: DonationSummary; activeFilter: DonationFilter; tokenFilter: string; onTokenClick: (sym: string) => void }) {
  const { t } = useLanguage();
  const allTokens = new Set<string>();
  const showReceived = activeFilter === 'all' || activeFilter === 'received';
  const showSent = activeFilter === 'all' || activeFilter === 'sent';

  if (showReceived) Object.keys(summary.received).forEach(s => allTokens.add(s));
  if (showSent) Object.keys(summary.sent).forEach(s => allTokens.add(s));

  const tokens = TOKEN_ORDER.filter(t => allTokens.has(t));
  const extraTokens = [...allTokens].filter(t => !TOKEN_ORDER.includes(t));
  const orderedTokens = [...tokens, ...extraTokens];

  if (orderedTokens.length === 0) {
    return <p className="text-xs text-muted-foreground text-center py-4">Chưa có giao dịch nào</p>;
  }

  return (
    <div className="space-y-1.5 mb-2">
      <div className="border border-border rounded-lg overflow-hidden">
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow className="bg-gradient-to-r from-emerald-50/60 to-amber-50/60 dark:from-emerald-950/20 dark:to-amber-950/20">
                <TableHead className="text-sm font-bold w-[70px] px-2 py-1.5 whitespace-nowrap">Token</TableHead>
                {showReceived && (
                  <>
                    <TableHead
                      className="text-sm font-bold text-green-600 text-right px-2 py-1.5 whitespace-nowrap"
                      title={t('historyTotalReceivedHint')}
                    >
                      {t('historyTotalReceivedCol')}
                    </TableHead>
                    <TableHead className="text-sm font-bold text-green-600 text-right px-2 py-1.5 whitespace-nowrap">Lệnh</TableHead>
                  </>
                )}
                {showSent && (
                  <>
                    <TableHead
                      className="text-sm font-bold text-red-600 text-right px-2 py-1.5 whitespace-nowrap"
                      title={t('historyTotalSentHint')}
                    >
                      {t('historyTotalSentCol')}
                    </TableHead>
                    <TableHead className="text-sm font-bold text-red-600 text-right px-2 py-1.5 whitespace-nowrap">Lệnh</TableHead>
                  </>
                )}
              </TableRow>
            </TableHeader>
            <TableBody>
              {orderedTokens.map(sym => {
                const recv = summary.received[sym];
                const sent = summary.sent[sym];

                return (
                  <TableRow
                    key={sym}
                    className={cn(
                      "cursor-pointer transition-colors hover:bg-muted/50",
                      tokenFilter === sym && "bg-primary/10 hover:bg-primary/15"
                    )}
                    onClick={() => onTokenClick(tokenFilter === sym ? 'all' : sym)}
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
                          <span className="text-sm font-semibold text-green-600">{formatAmount(recv?.amount ?? 0)}</span>
                        </TableCell>
                        <TableCell className="text-right px-2 py-1 whitespace-nowrap">
                          <span className="text-sm font-semibold text-green-600">{recv?.count ?? 0}</span>
                        </TableCell>
                      </>
                    )}
                    {showSent && (
                      <>
                        <TableCell className="text-right px-2 py-1 whitespace-nowrap">
                          <span className="text-sm font-semibold text-red-600">{formatAmount(sent?.amount ?? 0)}</span>
                        </TableCell>
                        <TableCell className="text-right px-2 py-1 whitespace-nowrap">
                          <span className="text-sm font-semibold text-red-600">{sent?.count ?? 0}</span>
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

      <div className="flex items-center justify-between bg-gradient-to-r from-emerald-50/60 to-amber-50/60 dark:from-emerald-950/20 dark:to-amber-950/20 border border-border rounded-lg px-3 py-1.5">
        <div className="flex items-center gap-4">
          {showReceived && (
            <div className="flex items-center gap-1">
              <ArrowDownLeft className="w-3.5 h-3.5 text-green-600" />
              <span className="text-sm text-muted-foreground">Nhận:</span>
              <span className="text-sm font-bold text-green-600">{summary.receivedCount}</span>
            </div>
          )}
          {showSent && (
            <div className="flex items-center gap-1">
              <ArrowUpRight className="w-3.5 h-3.5 text-red-600" />
              <span className="text-sm text-muted-foreground">Gửi:</span>
              <span className="text-sm font-bold text-red-600">{summary.sentCount}</span>
            </div>
          )}
        </div>
        <span className="text-sm font-bold text-foreground">{t('totalTxCount').replace('{count}', String(summary.totalCount))}</span>
      </div>
    </div>
  );
}

interface UserStats {
  userId: string;
  username: string | null;
  displayName: string | null;
  avatarUrl: string | null;
  sentCount: number;
  receivedCount: number;
  sentByToken: Record<string, number>;
  receivedByToken: Record<string, number>;
  totalCount: number;
}

function computeUserStats(donations: DonationRecord[], currentUserId: string): UserStats[] {
  const map = new Map<string, UserStats>();

  for (const d of donations) {
    if (d.type === 'swap' || d.type === 'transfer') continue;

    const isSent = d.sender_id === currentUserId;
    const counterpartId = isSent ? d.recipient_id : d.sender_id;
    if (!counterpartId) continue;

    if (!map.has(counterpartId)) {
      map.set(counterpartId, {
        userId: counterpartId,
        username: isSent ? d.recipient_username : d.sender_username,
        displayName: isSent ? d.recipient_display_name : d.sender_display_name,
        avatarUrl: isSent ? d.recipient_avatar_url : d.sender_avatar_url,
        sentCount: 0,
        receivedCount: 0,
        sentByToken: {},
        receivedByToken: {},
        totalCount: 0,
      });
    }

    const stats = map.get(counterpartId)!;
    const amount = parseFloat(d.amount) || 0;

    if (isSent) {
      stats.sentCount++;
      const tokenLabel = getGiftTokenLabel(d.token_symbol, d.chain_id);
      stats.sentByToken[tokenLabel] = (stats.sentByToken[tokenLabel] || 0) + amount;
    } else {
      stats.receivedCount++;
      const tokenLabel = getGiftTokenLabel(d.token_symbol, d.chain_id);
      stats.receivedByToken[tokenLabel] = (stats.receivedByToken[tokenLabel] || 0) + amount;
    }
    stats.totalCount = stats.sentCount + stats.receivedCount;

    if (!stats.username) {
      stats.username = isSent ? d.recipient_username : d.sender_username;
      stats.displayName = isSent ? d.recipient_display_name : d.sender_display_name;
      stats.avatarUrl = isSent ? d.recipient_avatar_url : d.sender_avatar_url;
    }
  }

  return [...map.values()].sort((a, b) => b.totalCount - a.totalCount);
}

function UserBreakdownSection({
  userStats,
  userFilter,
  onUserClick,
}: {
  userStats: UserStats[];
  userFilter: string | null;
  onUserClick: (userId: string | null) => void;
}) {
  const navigate = useNavigate();
  const [isOpen, setIsOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');

  if (userStats.length === 0) return null;

  const fmtTokenSum = (byToken: Record<string, number>) => {
    return Object.entries(byToken)
      .map(([sym, amt]) => `${formatAmount(amt)} ${sym}`)
      .join(', ');
  };

  const q = searchQuery.trim().toLowerCase();
  const filteredStats = q
    ? userStats.filter(u =>
        (u.displayName || '').toLowerCase().includes(q) ||
        (u.username || '').toLowerCase().includes(q)
      )
    : userStats;

  return (
    <div className="mb-2">
      <Collapsible open={isOpen} onOpenChange={setIsOpen}>
        <CollapsibleTrigger asChild>
          <Button variant="ghost" size="sm" className="w-full flex items-center justify-between h-8 px-3 text-sm font-semibold text-muted-foreground hover:text-foreground">
            <div className="flex items-center gap-1.5">
              <Users className="w-4 h-4" />
              <span>Thống kê theo người dùng ({userStats.length})</span>
            </div>
            {isOpen ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
          </Button>
        </CollapsibleTrigger>
        <CollapsibleContent>
          <div className="mt-1.5 mb-1.5 relative">
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Tìm theo tên hoặc username..."
              className="w-full h-8 px-3 pr-8 text-sm rounded-md border border-border bg-background focus:outline-none focus:ring-1 focus:ring-primary/40"
            />
            {searchQuery && (
              <button
                onClick={() => setSearchQuery('')}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                aria-label="Xóa tìm kiếm"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
          <div className="space-y-1.5 max-h-[180px] overflow-y-auto">
            {filteredStats.length === 0 ? (
              <div className="text-xs text-muted-foreground text-center py-3">
                Không tìm thấy người dùng phù hợp
              </div>
            ) : filteredStats.map(u => {
              const isSelected = userFilter === u.userId;
              const uName = u.displayName || u.username || '?';
              return (
                <div
                  key={u.userId}
                  className={cn(
                    "flex items-start gap-2.5 p-2 rounded-lg border cursor-pointer transition-all",
                    isSelected
                      ? "bg-primary/15 border-primary/40 ring-1 ring-primary/20 shadow-sm"
                      : "border-border hover:bg-muted/50 hover:border-muted-foreground/20"
                  )}
                  onClick={() => onUserClick(isSelected ? null : u.userId)}
                >
                  <button
                    onClick={(e) => { e.stopPropagation(); u.username && navigate(`/${u.username}`); }}
                    className="flex-shrink-0 hover:opacity-80"
                    title="Xem trang cá nhân"
                  >
                    <Avatar className="w-8 h-8">
                      {u.avatarUrl && <AvatarImage src={u.avatarUrl} />}
                      <AvatarFallback className="text-xs bg-primary/10 text-primary">{uName[0]?.toUpperCase()}</AvatarFallback>
                    </Avatar>
                  </button>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5">
                      <span className="text-sm font-semibold text-foreground truncate">
                        {uName}
                      </span>
                      {isSelected && (
                        <Badge variant="default" className="text-[10px] px-1.5 py-0 h-4 bg-primary/90">
                          Đang xem
                        </Badge>
                      )}
                    </div>
                    <div className="flex flex-wrap gap-x-3 gap-y-0.5 text-xs text-muted-foreground mt-0.5">
                      {u.sentCount > 0 && (
                        <span>
                          <ArrowUpRight className="w-3 h-3 inline text-red-500 mr-0.5" />
                          Tặng: {u.sentCount} lệnh ({fmtTokenSum(u.sentByToken)})
                        </span>
                      )}
                      {u.receivedCount > 0 && (
                        <span>
                          <ArrowDownLeft className="w-3 h-3 inline text-green-500 mr-0.5" />
                          Nhận: {u.receivedCount} lệnh ({fmtTokenSum(u.receivedByToken)})
                        </span>
                      )}
                    </div>
                  </div>
                  <div className="flex flex-col items-end gap-1 flex-shrink-0 mt-0.5">
                    <Badge variant="secondary" className="text-xs">
                      {u.totalCount} lệnh
                    </Badge>
                    <span className={cn(
                      "text-[10px] font-medium",
                      isSelected ? "text-primary" : "text-muted-foreground"
                    )}>
                      {isSelected ? "✕ Bỏ lọc" : "👁 Xem chi tiết"}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        </CollapsibleContent>
      </Collapsible>
    </div>
  );
}

function UserAvatar({ username, displayName, avatarUrl, onClick }: { username: string | null; displayName: string | null; avatarUrl: string | null; onClick?: () => void }) {
  const name = displayName || username || '?';
  return (
    <button onClick={onClick} className="flex items-center gap-1.5 min-w-0 hover:opacity-80 transition-opacity">
      <Avatar className="w-6 h-6 flex-shrink-0">
        {avatarUrl && <AvatarImage src={avatarUrl} />}
        <AvatarFallback className="text-[10px] bg-primary/10 text-primary">{name[0]?.toUpperCase()}</AvatarFallback>
      </Avatar>
      <span className="text-sm font-medium truncate max-w-[100px] sm:max-w-[160px] text-foreground">{name}</span>
    </button>
  );
}

function shortenAddress(addr: string) {
  if (!addr) return '???';
  return `${addr.slice(0, 6)}...${addr.slice(-4)}`;
}

function TransferCard({ d }: { d: DonationRecord }) {
  const { t } = useLanguage();
  const explorerUrl = getBscScanBaseUrl(d.chain_id);
  const isIn = d.direction === 'in';
  const tokenLabel = getGiftTokenLabel(d.token_symbol, d.chain_id);

  return (
    <div className="border border-border rounded-xl p-3 space-y-2">
      <div className="flex justify-between items-center">
        <Badge className={isIn ? 'bg-blue-600 hover:bg-blue-700 text-white text-xs' : 'bg-orange-600 hover:bg-orange-700 text-white text-xs'}>
          <ArrowRightLeft className="w-3 h-3 mr-1" />
          {isIn ? t('transferIn') : t('transferOut')}
        </Badge>
        <StatusBadge status={d.status} t={t} />
      </div>

      <div className="flex items-center justify-between text-sm">
        <div className="flex items-center gap-1.5">
          <TokenLogo symbol={tokenLabel} />
          <span className="font-bold">{Number(d.amount).toLocaleString('vi-VN', { maximumFractionDigits: 6 })} {tokenLabel}</span>
        </div>
      </div>

      {d.counterparty_address && (
        <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <span>{isIn ? t('fromLabel') : t('toLabel')}</span>
          <a
            href={`${explorerUrl}/address/${d.counterparty_address}`}
            target="_blank"
            rel="noopener noreferrer"
            className="text-primary hover:underline flex items-center gap-1"
          >
            {shortenAddress(d.counterparty_address)} <ExternalLink className="w-3 h-3" />
          </a>
        </div>
      )}

      <div className="flex justify-between text-sm">
        <span className="text-muted-foreground">{formatDate(d.created_at)} {formatTime(d.created_at)}</span>
      </div>

      {d.tx_hash && (
        <a href={`${explorerUrl}/tx/${d.tx_hash}`} target="_blank" rel="noopener noreferrer" className="text-xs text-primary hover:underline flex items-center gap-1">
          Tx: {d.tx_hash.slice(0, 10)}...{d.tx_hash.slice(-6)} <ExternalLink className="w-3 h-3" />
        </a>
      )}
    </div>
  );
}

function SwapCard({ d }: { d: DonationRecord }) {
  const { t } = useLanguage();
  const explorerUrl = getBscScanBaseUrl(d.chain_id);
  const fromLabel = getGiftTokenLabel(d.from_symbol || d.token_symbol, d.chain_id);
  const toLabel = getGiftTokenLabel(d.to_symbol || d.token_symbol, d.chain_id);
  return (
    <div className="border border-border rounded-xl p-3 space-y-2">
      <div className="flex justify-between items-center">
        <Badge className="bg-violet-600 hover:bg-violet-700 text-white text-xs">
          <ArrowDownUp className="w-3 h-3 mr-1" />
          Swap
        </Badge>
        <StatusBadge status={d.status} t={t} />
      </div>

      <div className="flex items-center gap-2 text-sm">
        <div className="flex items-center gap-1.5">
          <TokenLogo symbol={fromLabel} />
          <span className="font-bold">{Number(d.from_amount).toLocaleString('vi-VN', { maximumFractionDigits: 6 })} {fromLabel}</span>
        </div>
        <span className="text-muted-foreground">→</span>
        <div className="flex items-center gap-1.5">
          <TokenLogo symbol={toLabel} />
          <span className="font-bold">{Number(d.to_amount).toLocaleString('vi-VN', { maximumFractionDigits: 6 })} {toLabel}</span>
        </div>
      </div>

      <div className="flex justify-between text-sm">
        <span className="text-muted-foreground">{formatDate(d.created_at)} {formatTime(d.created_at)}</span>
      </div>

      {d.tx_hash && (
        <a href={`${explorerUrl}/tx/${d.tx_hash}`} target="_blank" rel="noopener noreferrer" className="text-xs text-primary hover:underline flex items-center gap-1">
          Tx: {d.tx_hash.slice(0, 10)}...{d.tx_hash.slice(-6)} <ExternalLink className="w-3 h-3" />
        </a>
      )}
    </div>
  );
}

const MSG_TRUNCATE_LENGTH = 80;

function CollapsibleMessage({ message }: { message: string }) {
  const { t } = useLanguage();
  const [expanded, setExpanded] = useState(false);
  const isLong = message.length > MSG_TRUNCATE_LENGTH;

  return (
    <div className="flex items-start gap-1.5 text-sm text-muted-foreground bg-muted/50 rounded-lg p-2">
      <MessageSquare className="w-4 h-4 mt-0.5 flex-shrink-0" />
      <div className="min-w-0 flex-1">
        <span className="break-words">
          {isLong && !expanded ? `${message.slice(0, MSG_TRUNCATE_LENGTH)}...` : message}
        </span>
        {isLong && (
          <button
            onClick={(e) => { e.stopPropagation(); setExpanded(prev => !prev); }}
            className="ml-1 text-primary hover:text-primary/80 font-medium inline-flex items-center gap-0.5"
          >
            {expanded ? (<>Thu gọn <ChevronUp className="w-3 h-3" /></>) : (<>Xem thêm <ChevronDown className="w-3 h-3" /></>)}
          </button>
        )}
      </div>
    </div>
  );
}

function DonationCard({ d, userId, walletLabelMap }: { d: DonationRecord; userId: string; walletLabelMap: Map<string, string> }) {
  const { t } = useLanguage();
  const navigate = useNavigate();
  const [showCard, setShowCard] = useState(false);
  const isTransfer = d.type === 'transfer';
  const isSent = isTransfer ? d.direction === 'out' : d.sender_id === userId;
  const explorerUrl = getBscScanBaseUrl(d.chain_id);
  // Transfer đã resolve được user nội bộ (có sender/recipient_username) thì KHÔNG còn là ví ngoài
  const transferResolvedInternal = isTransfer && !!(isSent ? d.recipient_username : d.sender_username);
  const isExternal = (d.is_external || (!d.sender_id && d.recipient_id) || isTransfer) && !transferResolvedInternal;

  const externalLabel = isExternal && d.sender_address
    ? walletLabelMap.get(d.sender_address.toLowerCase())
    : undefined;
  const tokenLabel = getGiftTokenLabel(d.token_symbol, d.chain_id);

  const senderName = d.sender_display_name || d.sender_username || 
    externalLabel ||
    (d.sender_address ? shortenAddress(d.sender_address) : t('externalWallet'));
  const senderAvatar = d.sender_avatar_url;

  const cardData: DonationReceivedData = {
    id: d.id,
    amount: d.amount,
    tokenSymbol: tokenLabel,
    chainId: d.chain_id,
    senderUsername: d.sender_username || senderName,
    senderDisplayName: d.sender_display_name || externalLabel,
    senderAvatarUrl: d.sender_avatar_url,
    senderId: d.sender_id || '',
    recipientUsername: d.recipient_username || undefined,
    recipientDisplayName: d.recipient_display_name,
    recipientAvatarUrl: d.recipient_avatar_url,
    message: d.message,
    txHash: d.tx_hash,
    createdAt: d.created_at,
    status: d.status,
  };

  return (
    <>
    <DonationReceivedCard isOpen={showCard} onClose={() => setShowCard(false)} data={cardData} />
    <div className="border border-border rounded-lg p-2.5 space-y-1.5">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1.5">
          <Badge variant="outline" className={isSent ? 'border-red-500 text-red-600 bg-red-50 dark:bg-red-950/30 text-xs' : 'border-green-500 text-green-600 bg-green-50 dark:bg-green-950/30 text-xs'}>
            {isSent ? <ArrowUpRight className="w-3 h-3 mr-0.5" /> : <ArrowDownLeft className="w-3 h-3 mr-0.5" />}
            {isTransfer && !transferResolvedInternal
              ? (isSent ? 'Chuyển ví' : 'Nhận ví ngoài')
              : (isSent ? t('donatedLabel') : t('receivedBadge'))}
          </Badge>
          {isExternal && (
            <Badge variant="secondary" className="bg-orange-100 text-orange-700 border-orange-200 text-[10px] px-1 py-0">
              Ví ngoài
            </Badge>
          )}
        </div>
        <div className="flex items-center gap-1.5">
          <StatusBadge status={d.status} t={t} />
          <button
            onClick={(e) => { e.stopPropagation(); setShowCard(true); }}
            className="flex items-center gap-1 text-[10px] font-semibold text-primary hover:text-primary/80 bg-primary/10 hover:bg-primary/20 rounded-full px-2 py-0.5 transition-colors"
            title="Xem biên nhận"
          >
            <Receipt className="w-3 h-3" />
            Card
          </button>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-1.5 text-sm">
        <div className="flex items-center gap-1.5 min-w-0 shrink">
          {isExternal && !d.sender_id ? (
            <div className="flex items-center gap-1.5 min-w-0">
              <Avatar className="w-6 h-6 flex-shrink-0">
                <AvatarFallback className="text-[10px] bg-orange-100 text-orange-700">
                  {externalLabel ? externalLabel.charAt(0).toUpperCase() : '🌐'}
                </AvatarFallback>
              </Avatar>
              <div className="flex flex-col min-w-0">
                {externalLabel && (
                  <span className="text-xs font-semibold text-foreground truncate">{externalLabel}</span>
                )}
                {d.sender_address ? (
                  <a
                    href={`${explorerUrl}/address/${d.sender_address}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-[10px] font-medium text-primary hover:underline flex items-center gap-1"
                    onClick={e => e.stopPropagation()}
                  >
                    {shortenAddress(d.sender_address)} <ExternalLink className="w-3 h-3" />
                  </a>
                ) : (
                  <span className="text-xs font-medium text-muted-foreground">Ví ngoài</span>
                )}
              </div>
            </div>
          ) : (
            <UserAvatar
              username={d.sender_username}
              displayName={d.sender_display_name}
              avatarUrl={d.sender_avatar_url}
              onClick={() => d.sender_username && navigate(`/${d.sender_username}`)}
            />
          )}
          <span className="text-muted-foreground text-xs">→</span>
          <UserAvatar
            username={d.recipient_username}
            displayName={d.recipient_display_name}
            avatarUrl={d.recipient_avatar_url}
            onClick={() => d.recipient_username && navigate(`/${d.recipient_username}`)}
          />
        </div>

        <span className="font-bold whitespace-nowrap text-red-600 text-sm mx-auto">{Number(d.amount).toLocaleString('vi-VN', { maximumFractionDigits: 6 })} {tokenLabel}</span>

        <div className="flex items-center gap-2 whitespace-nowrap ml-auto">
          <span className="text-sm font-medium text-primary">{formatTime(d.created_at)}</span>
          <span className="text-sm font-semibold text-yellow-600 dark:text-yellow-400">{formatDate(d.created_at)}</span>
          {d.tx_hash && (
            <a href={`${explorerUrl}/tx/${d.tx_hash}`} target="_blank" rel="noopener noreferrer" className="text-sm text-primary hover:underline flex items-center gap-0.5">
              Tx: {d.tx_hash.slice(0, 6)}...{d.tx_hash.slice(-4)} <ExternalLink className="w-3 h-3" />
            </a>
          )}
        </div>
      </div>

      {d.message && <CollapsibleMessage message={d.message} />}
    </div>
    </>
  );
}

export function WalletTransactionHistory({ userId, walletAddress, userDisplayName, userAvatarUrl, username, userCreatedAt }: Props) {
  const { t } = useLanguage();
  const [open, setOpen] = useState(false);
  const [fromDate, setFromDate] = useState<Date | undefined>(undefined);
  const [toDate, setToDate] = useState<Date | undefined>(undefined);
  const [tokenFilter, setTokenFilter] = useState<string>('all');
  const [userFilter, setUserFilter] = useState<string | null>(null);
  const navigate = useNavigate();
  const walletLabelMap = useWalletLabelMap();
  const { donations, loading, error, filter, hasMore, summary, summaryLoading, changeFilter, changeDateRange, fetchDonations, fetchSummary, loadMore } = usePublicDonationHistoryAuto(userId, userCreatedAt);

  // Batch 2.3.1 — shadow probe zero-diff 48h trước khi cutover V2.
  useShadowCompare({
    surface: 'public_profile_history',
    legacyCount: summaryLoading ? null : summary.totalCount,
    targetUserId: userId ?? null,
    scope: 'profile',
  });
  const { balances: walletBalances } = usePublicWalletBalances(open ? walletAddress : undefined);
  const userStats = useMemo(() => computeUserStats(donations, userId), [donations, userId]);

  // Khi lọc theo user → chỉ giữ donation giữa Cha ↔ user đó (loại swap & transfer)
  const filteredDonations = useMemo(() => {
    if (!userFilter) return donations;
    return donations.filter(d =>
      d.type === 'donation' && (d.sender_id === userFilter || d.recipient_id === userFilter)
    );
  }, [donations, userFilter]);

  // Tính lại summary theo tập đã lọc
  const displaySummary: DonationSummary = useMemo(() => {
    if (!userFilter) return summary;
    const received: Record<string, { amount: number; count: number }> = {};
    const sent: Record<string, { amount: number; count: number }> = {};
    let receivedCount = 0;
    let sentCount = 0;
    for (const d of filteredDonations) {
      if (d.type !== 'donation') continue;
      const sym = getGiftTokenLabel(d.token_symbol, d.chain_id);
      const amt = Number(d.amount) || 0;
      const isSent = d.sender_id === userId;
      if (isSent) {
        if (!sent[sym]) sent[sym] = { amount: 0, count: 0 };
        sent[sym].amount += amt;
        sent[sym].count += 1;
        sentCount++;
      } else {
        if (!received[sym]) received[sym] = { amount: 0, count: 0 };
        received[sym].amount += amt;
        received[sym].count += 1;
        receivedCount++;
      }
    }
    return { received, sent, receivedCount, sentCount, totalCount: receivedCount + sentCount };
  }, [userFilter, filteredDonations, summary, userId]);

  useEffect(() => {
    if (open && userId) {
      fetchDonations(1);
      fetchSummary();
    }
  }, [open, userId, fetchDonations, fetchSummary]);

  const handleDateChange = (from: Date | undefined, to: Date | undefined) => {
    setFromDate(from);
    setToDate(to);
    const fromStr = from ? format(from, 'yyyy-MM-dd') : null;
    const toStr = to ? format(to, 'yyyy-MM-dd') : null;
    changeDateRange(fromStr, toStr);
  };

  const clearDateRange = () => {
    setFromDate(undefined);
    setToDate(undefined);
    changeDateRange(null, null);
  };

  const filters: { key: DonationFilter; label: string }[] = [
    { key: 'all', label: t('filterAll') },
    { key: 'received', label: t('receivedBadge') },
    { key: 'sent', label: t('donatedLabel') },
  ];

  const displayName = userDisplayName || username || '?';

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button className="font-semibold px-4 h-10 bg-gradient-to-r from-gold/90 to-amber-500/90 hover:from-gold hover:to-amber-500 text-primary-foreground border-0 shadow-md hover:shadow-lg transition-all duration-300">
          <Clock className="w-4 h-4 mr-2" />
          {t('transactionHistory')}
        </Button>
      </DialogTrigger>
      <DialogContent className="w-[905px] max-w-[95vw] sm:max-w-[905px] max-h-[90vh] overflow-hidden flex flex-col">
        <div className="flex-shrink-0">
          <DialogHeader>
            <DialogTitle className="flex items-center justify-center gap-1.5 text-xl uppercase tracking-wider font-extrabold w-full" style={{ color: '#2E7D32', textShadow: '0 1px 2px rgba(46,125,50,0.2)' }}>
              <Clock className="w-5 h-5" style={{ color: '#2E7D32' }} />
              Lịch sử giao dịch cá nhân
            </DialogTitle>
            <DialogDescription className="sr-only">{t('personalTxHistoryDesc')}</DialogDescription>
          </DialogHeader>

          {/* Filters + Date Range row */}
          <div className="flex items-center gap-1.5 py-1.5 flex-wrap">
            <Filter className="w-4 h-4 text-muted-foreground" />
            {filters.map(f => (
              <Button key={f.key} size="sm" variant={filter === f.key ? 'secondary' : 'ghost'} onClick={() => changeFilter(f.key)} className="h-7 text-sm px-3">
                {f.label}
              </Button>
            ))}
            <Select value={tokenFilter} onValueChange={setTokenFilter}>
              <SelectTrigger className="h-7 w-[180px] text-xs">
                <Coins className="w-3.5 h-3.5 mr-1 flex-shrink-0" />
                <SelectValue placeholder="Token" />
              </SelectTrigger>
              <SelectContent className="z-[9999]">
                <SelectItem value="all">Tất cả</SelectItem>
                {TOKEN_ORDER.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}
              </SelectContent>
            </Select>
            <Popover>
              <PopoverTrigger asChild>
                <Button variant="outline" size="sm" className="h-7 w-[180px] text-xs justify-start font-normal">
                  <Users className="w-3.5 h-3.5 mr-1 flex-shrink-0" />
                  <span className="truncate">
                    {userFilter
                      ? (() => {
                          const u = userStats.find(x => x.userId === userFilter);
                          return u ? (u.displayName || u.username || '?') : 'Người dùng';
                        })()
                      : 'Tất cả người dùng'}
                  </span>
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-[280px] p-0 z-[10000]" align="start" side="bottom" sideOffset={4} collisionPadding={8}>
                <Command className="flex flex-col max-h-[320px]">
                  <div className="sticky top-0 bg-popover z-10 border-b">
                    <CommandInput placeholder="Tìm tên hoặc username..." className="h-9" />
                  </div>
                  <CommandList className="max-h-[260px] overflow-y-auto">
                    <CommandEmpty>Không tìm thấy.</CommandEmpty>
                    <CommandGroup>
                      <CommandItem value="__all__" onSelect={() => setUserFilter(null)}>
                        <Check className={cn("mr-2 h-4 w-4", !userFilter ? "opacity-100" : "opacity-0")} />
                        Tất cả người dùng
                      </CommandItem>
                      {userStats.map(u => {
                        const name = u.displayName || u.username || '?';
                        return (
                          <CommandItem
                            key={u.userId}
                            value={`${name} ${u.username || ''}`}
                            onSelect={() => setUserFilter(u.userId)}
                          >
                            <Check className={cn("mr-2 h-4 w-4", userFilter === u.userId ? "opacity-100" : "opacity-0")} />
                            <span className="truncate flex-1">{name}</span>
                            <span className="text-xs text-muted-foreground ml-2">{u.totalCount} lệnh</span>
                          </CommandItem>
                        );
                      })}
                    </CommandGroup>
                  </CommandList>
                </Command>
              </PopoverContent>
            </Popover>

            <div className="ml-auto flex items-center gap-1.5">
              <ExportTransactionsMenu
                iconOnly
                getRows={() => mapDonationsToRows(filteredDonations, userId)}

                meta={{
                  title: `Lịch sử giao dịch — ${userDisplayName ?? username ?? ''}`,
                  userDisplayName: userDisplayName ?? username ?? 'Người dùng',
                  userWalletAddress: walletAddress,
                  dateRangeLabel:
                    fromDate || toDate
                      ? `${fromDate ? format(fromDate, 'dd/MM/yyyy') : '…'} → ${toDate ? format(toDate, 'dd/MM/yyyy') : '…'}`
                      : 'Toàn bộ',
                  isOwner: false,
                  surface: 'profile_history',
                  filterParams: {
                    direction: filter,
                    token: tokenFilter,
                    dateFrom: fromDate ? format(fromDate, 'yyyy-MM-dd') : null,
                    dateTo: toDate ? format(toDate, 'yyyy-MM-dd') : null,
                    userFilter,
                  },
                }}
                filenameBase={`fun-profile-transactions-${username ?? userId ?? 'user'}`}
                currentUserId={userId}
              />

              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7"
                onClick={() => { fetchDonations(1); fetchSummary(); }}
                disabled={loading}
                title="Làm mới"
              >
                <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
              </Button>
              {/* Date From */}
              <Popover>
                <PopoverTrigger asChild>
                  <Button size="sm" variant="outline" className={cn("h-8 text-xs gap-1 min-w-[110px]", fromDate && "border-primary text-primary")}>
                    <CalendarDays className="w-3.5 h-3.5" />
                    {fromDate ? format(fromDate, 'dd/MM/yyyy') : t('fromDateLabel')}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0 z-[9999]" align="end">
                  <Calendar
                    mode="single"
                    selected={fromDate}
                    onSelect={(d) => handleDateChange(d, toDate)}
                    disabled={(date) => date > new Date() || (toDate ? date > toDate : false)}
                    initialFocus
                    className={cn("p-3 pointer-events-auto")}
                  />
                </PopoverContent>
              </Popover>

              {/* Date To */}
              <Popover>
                <PopoverTrigger asChild>
                  <Button size="sm" variant="outline" className={cn("h-8 text-xs gap-1 min-w-[110px]", toDate && "border-primary text-primary")}>
                    <CalendarDays className="w-3.5 h-3.5" />
                    {toDate ? format(toDate, 'dd/MM/yyyy') : t('toDateLabel')}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0 z-[9999]" align="end">
                  <Calendar
                    mode="single"
                    selected={toDate}
                    onSelect={(d) => handleDateChange(fromDate, d)}
                    disabled={(date) => date > new Date() || (fromDate ? date < fromDate : false)}
                    initialFocus
                    className={cn("p-3 pointer-events-auto")}
                  />
                </PopoverContent>
              </Popover>

              {/* Clear date */}
              {(fromDate || toDate) && (
                <Button size="sm" variant="ghost" onClick={clearDateRange} className="h-8 w-8 p-0">
                  <X className="w-3.5 h-3.5" />
                </Button>
              )}
            </div>
          </div>

          {/* Summary Section — always visible */}
          <SummaryTable summary={displaySummary} activeFilter={filter} tokenFilter={tokenFilter} onTokenClick={setTokenFilter} />


          {/* Active user filter badge — sticky */}
          {userFilter && (() => {
            const matched = userStats.find(u => u.userId === userFilter);
            const filterName = matched ? (matched.displayName || matched.username) : null;
            return (
              <div className="flex items-center gap-1.5 py-1 px-1">
                <Badge variant="secondary" className="flex items-center gap-1 text-xs">
                  <Users className="w-3 h-3" />
                  Đang lọc: @{filterName || '?'}
                  <button onClick={() => setUserFilter(null)} className="ml-1 hover:text-destructive">
                    <X className="w-3 h-3" />
                  </button>
                </Badge>
              </div>
            );
          })()}
        </div>

        {/* Scrollable content */}
        <div className="flex-1 overflow-y-auto overflow-x-hidden min-h-0">

          {error && <p className="text-destructive text-sm">{error}</p>}

          {loading && filteredDonations.length === 0 ? (
            <div className="space-y-3">
              {[...Array(5)].map((_, i) => <Skeleton key={i} className="h-20 w-full rounded-xl" />)}
            </div>
          ) : filteredDonations.length === 0 ? (
            <p className="text-center text-muted-foreground py-8">Không có giao dịch nào</p>
          ) : (
            <>
              {userFilter && (
                <p className="text-xs text-muted-foreground px-1 pb-2">
                  Chỉ hiển thị giao dịch tặng/nhận với người dùng này (ẩn swap & transfer ví ngoài).
                </p>
              )}
              <div className="space-y-2">
                {filteredDonations
                  .filter(d => d.type !== 'swap')
                  .filter(d => tokenFilter === 'all' || getGiftTokenLabel(d.token_symbol, d.chain_id) === tokenFilter)
                  .map(d => (
                    <DonationCard key={d.id} d={d} userId={userId} walletLabelMap={walletLabelMap} />
                  ))}
              </div>

              {hasMore && !loading && (
                <div className="flex justify-center mt-4 pb-2">
                  <Button variant="outline" onClick={loadMore} size="sm">
                    Tải thêm
                  </Button>
                </div>
              )}
            </>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

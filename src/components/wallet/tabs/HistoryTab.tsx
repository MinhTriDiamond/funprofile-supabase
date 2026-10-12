import { useEffect, useState, useRef, useMemo, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useBtcTransactions, type BtcTransaction } from '@/hooks/useBtcTransactions';
import { useBtcBalance } from '@/hooks/useBtcBalance';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Clock, ArrowDownLeft, ArrowUpRight, ExternalLink, Filter, MessageSquare, ChevronDown, ChevronUp, CalendarDays, X, ArrowRight, Receipt, RefreshCw, Download, Coins } from 'lucide-react';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { DonationReceivedCard, type DonationReceivedData } from '@/components/donations/DonationReceivedCard';
import { type DonationFilter, type DonationRecord, type DonationSummary } from '@/hooks/usePublicDonationHistory';
import { usePublicDonationHistoryAuto } from '@/hooks/usePublicDonationHistoryAuto';
import { useShadowCompare } from '@/hooks/useShadowCompare';
import { getBscScanBaseUrl, getExplorerTxUrl, getExplorerAddressUrl, getChainFamily } from '@/lib/chainTokenMapping';
import { WALLET_TOKENS } from '@/lib/tokens';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Calendar } from '@/components/ui/calendar';
import { cn } from '@/lib/utils';
import { format } from 'date-fns';
import { useCurrentUser } from '@/hooks/useCurrentUser';
import { useLanguage } from '@/i18n/LanguageContext';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { getTodayVN } from '@/lib/vnTimezone';
import { ExternalWalletActivityCard } from '@/components/wallet/ExternalWalletActivityCard';
import { ExportTransactionsMenu } from '@/components/wallet/ExportTransactionsMenu';
import { mapDonationsToRows } from '@/utils/export';
import { GIFT_TOKEN_DISPLAY_ORDER, getGiftTokenBaseSymbol, getGiftTokenLabel } from '@/lib/giftTokenLabel';


interface Props {
  walletAddress?: string;
  userDisplayName?: string | null;
  userAvatarUrl?: string | null;
  username?: string;
  userCreatedAt?: string;
  targetUserId?: string;
  selectedNetwork?: 'evm' | 'bitcoin';
  btcAddress?: string | null;
  prices?: Record<string, { usd?: number; usd_24h_change?: number }> | null;
}

type UnifiedBtcEntry = {
  id: string;
  timestamp: number;
  source: 'onchain' | 'donation';
  btcTx?: BtcTransaction;
  donation?: DonationRecord;
};

const TOKEN_ORDER = GIFT_TOKEN_DISPLAY_ORDER;

function formatDateLocale(ts: string, language: string) {
  const date = new Date(ts);
  const locale = language === 'vi' ? 'vi-VN' : 'en-US';
  return date.toLocaleDateString(locale, { day: '2-digit', month: '2-digit', year: 'numeric' });
}

function formatTimeLocale(ts: string, language: string) {
  const date = new Date(ts);
  const locale = language === 'vi' ? 'vi-VN' : 'en-US';
  return date.toLocaleTimeString(locale, { hour: '2-digit', minute: '2-digit' });
}

function formatAmount(num: number, language: string): string {
  if (num === 0) return '0';
  if (num < 0.0001) return num.toFixed(8);
  if (num < 1) return num.toFixed(4);
  const locale = language === 'vi' ? 'vi-VN' : 'en-US';
  return num.toLocaleString(locale, { maximumFractionDigits: 4 });
}

function formatUsdValue(usd: number): string {
  if (usd < 0.01) return '< $0.01';
  return `≈ $${usd.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function StatusBadge({ status }: { status: string }) {
  const { t } = useLanguage();
  if (status === 'confirmed') return <Badge className="bg-green-600 hover:bg-green-700 text-xs">{t('txSuccess')}</Badge>;
  if (status === 'pending') return <Badge variant="secondary" className="text-xs">{t('txPending')}</Badge>;
  return <Badge variant="destructive" className="text-xs">{t('txError')}</Badge>;
}

function TokenLogo({ symbol }: { symbol: string }) {
  const baseSymbol = getGiftTokenBaseSymbol(symbol);
  const token = WALLET_TOKENS.find(t => t.symbol === baseSymbol);
  if (!token) return <span className="text-[10px] font-bold text-muted-foreground">{symbol}</span>;
  const sizeClass = baseSymbol === 'BTC' ? 'w-8 h-8' : baseSymbol === 'BTCB' ? 'w-[1.35rem] h-[1.35rem]' : 'w-4 h-4';
  return <img src={token.logo} alt={symbol} className={`${sizeClass} rounded-full`} />;
}

interface BtcOnChainStats {
  totalReceived: number;
  totalSent: number;
  receivedCount: number;
  sentCount: number;
}

function SummaryTable({ summary, activeFilter, btcOnChain }: { summary: DonationSummary; activeFilter: DonationFilter; btcOnChain?: BtcOnChainStats | null }) {
  const { t, language } = useLanguage();
  const allTokens = new Set<string>();
  const showReceived = activeFilter === 'all' || activeFilter === 'received';
  const showSent = activeFilter === 'all' || activeFilter === 'sent';

  if (showReceived) Object.keys(summary.received).forEach(s => allTokens.add(s));
  if (showSent) Object.keys(summary.sent).forEach(s => allTokens.add(s));

  // Ensure BTC appears if we have on-chain data
  if (btcOnChain && (btcOnChain.totalReceived > 0 || btcOnChain.totalSent > 0)) {
    allTokens.add('BTC');
  }

  const tokens = TOKEN_ORDER.filter(t => allTokens.has(t));
  const extraTokens = [...allTokens].filter(t => !TOKEN_ORDER.includes(t));
  const orderedTokens = [...tokens, ...extraTokens];

  if (orderedTokens.length === 0) {
    return <p className="text-xs text-muted-foreground text-center py-4">{t('noTransactionsYet')}</p>;
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
                    <TableHead className="text-sm font-bold text-green-600 text-right px-2 py-1.5 whitespace-nowrap">{t('totalReceivedLabel')}</TableHead>
                    <TableHead className="text-sm font-bold text-green-600 text-right px-2 py-1.5 whitespace-nowrap">{t('orderCount')}</TableHead>
                  </>
                )}
                {showSent && (
                  <>
                    <TableHead className="text-sm font-bold text-red-600 text-right px-2 py-1.5 whitespace-nowrap">{t('totalGiftedLabel')}</TableHead>
                    <TableHead className="text-sm font-bold text-red-600 text-right px-2 py-1.5 whitespace-nowrap">{t('orderCount')}</TableHead>
                  </>
                )}
              </TableRow>
            </TableHeader>
            <TableBody>
              {orderedTokens.map(sym => {
                // For BTC, use on-chain data if available to override database summary
                const isBtcWithOnChain = sym === 'BTC' && btcOnChain;
                const recv = isBtcWithOnChain
                  ? { amount: btcOnChain.totalReceived, count: btcOnChain.receivedCount }
                  : summary.received[sym];
                const sent = isBtcWithOnChain
                  ? { amount: btcOnChain.totalSent, count: btcOnChain.sentCount }
                  : summary.sent[sym];
                return (
                  <TableRow key={sym}>
                    <TableCell className="px-2 py-1">
                      <div className="flex items-center gap-1.5 whitespace-nowrap">
                        <TokenLogo symbol={sym} />
                        <span className="text-sm font-bold">{sym}</span>
                        {isBtcWithOnChain && (
                          <span className="text-[9px] text-orange-500 font-medium">(on-chain)</span>
                        )}
                      </div>
                    </TableCell>
                    {showReceived && (
                      <>
                        <TableCell className="text-right px-2 py-1 whitespace-nowrap">
                          <span className="text-sm font-semibold text-green-600">{formatAmount(recv?.amount ?? 0, language)}</span>
                          {sym === 'BTC' && !isBtcWithOnChain && (recv?.amount ?? 0) > 100 && (
                            <span className="ml-1 text-[9px] text-orange-500 font-medium" title={t('htbDbNotReconciled')}>⚠️</span>
                          )}
                        </TableCell>
                        <TableCell className="text-right px-2 py-1 whitespace-nowrap">
                          <span className="text-sm font-semibold text-green-600">{recv?.count ?? 0}</span>
                        </TableCell>
                      </>
                    )}
                    {showSent && (
                      <>
                        <TableCell className="text-right px-2 py-1 whitespace-nowrap">
                          <span className="text-sm font-semibold text-red-600">{formatAmount(sent?.amount ?? 0, language)}</span>
                          {sym === 'BTC' && !isBtcWithOnChain && (sent?.amount ?? 0) > 100 && (
                            <span className="ml-1 text-[9px] text-orange-500 font-medium" title={t('htbDbNotReconciled')}>⚠️</span>
                          )}
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
              <span className="text-sm text-muted-foreground">{t('receivedSummary')}</span>
              <span className="text-sm font-bold text-green-600">{summary.receivedCount}</span>
            </div>
          )}
          {showSent && (
            <div className="flex items-center gap-1">
              <ArrowUpRight className="w-3.5 h-3.5 text-red-600" />
              <span className="text-sm text-muted-foreground">{t('sentSummary')}</span>
              <span className="text-sm font-bold text-red-600">{summary.sentCount}</span>
            </div>
          )}
        </div>
        <span className="text-sm font-bold text-foreground">{t('totalTransactions')} {summary.totalCount} {t('transactionUnit')}</span>
      </div>
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

function CollapsibleMessage({ message }: { message: string }) {
  const { t } = useLanguage();
  const [expanded, setExpanded] = useState(false);
  const [isClamped, setIsClamped] = useState(false);
  const textRef = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    const el = textRef.current;
    if (el) {
      setIsClamped(el.scrollHeight > el.clientHeight + 1);
    }
  }, [message]);

  return (
    <div className="flex items-start gap-1.5 text-sm text-muted-foreground bg-muted/50 rounded-lg p-2 w-full">
      <MessageSquare className="w-4 h-4 mt-0.5 flex-shrink-0" />
      <div className="min-w-0 flex-1">
        <span
          ref={textRef}
          className={cn("break-words block", !expanded && "line-clamp-2")}
        >
          {message}
        </span>
        {isClamped && (
          <button
            onClick={(e) => { e.stopPropagation(); setExpanded(prev => !prev); }}
            className="ml-1 text-primary hover:text-primary/80 font-medium inline-flex items-center gap-0.5 mt-0.5"
          >
            {expanded ? (<>{t('collapseText')} <ChevronUp className="w-3 h-3" /></>) : (<>{t('showMoreText')} <ChevronDown className="w-3 h-3" /></>)}
          </button>
        )}
      </div>
    </div>
  );
}

function DonationCard({ d, userId, btcPrice }: { d: DonationRecord; userId: string; btcPrice?: number }) {
  const navigate = useNavigate();
  const { t, language } = useLanguage();
  const [showCard, setShowCard] = useState(false);
  const isTransfer = d.type === 'transfer';
  const isSent = isTransfer ? d.direction === 'out' : d.sender_id === userId;
  const isBtc = d.chain_id === 0 || d.token_symbol === 'BTC';
  const explorerUrl = isBtc ? 'https://mempool.space' : getBscScanBaseUrl(d.chain_id);
  // Transfer đã resolve được user nội bộ (có sender/recipient_username) thì KHÔNG còn là ví ngoài
  const transferResolvedInternal = isTransfer && !!(isSent ? d.recipient_username : d.sender_username);
  const isExternal = (d.is_external || (!d.sender_id && d.recipient_id)) && !transferResolvedInternal;

  const usdValue = isBtc && btcPrice ? Number(d.amount) * btcPrice : null;
  const tokenLabel = getGiftTokenLabel(d.token_symbol, d.chain_id);

  const cardData: DonationReceivedData = {
    id: d.id,
    amount: d.amount,
    tokenSymbol: tokenLabel,
    chainId: d.chain_id,
    senderUsername: d.sender_username || '',
    senderDisplayName: d.sender_display_name,
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
      {/* Row 1: Badge + Status */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1.5">
          <Badge variant="outline" className={isSent ? 'border-red-500 text-red-600 bg-red-50 dark:bg-red-950/30 text-xs' : 'border-green-500 text-green-600 bg-green-50 dark:bg-green-950/30 text-xs'}>
            {isSent ? <ArrowUpRight className="w-3 h-3 mr-0.5" /> : <ArrowDownLeft className="w-3 h-3 mr-0.5" />}
            {isTransfer && !transferResolvedInternal
              ? (isSent ? t('transferOut') : t('transferIn'))
              : (isSent ? t('giftedBadge') : t('receivedBadge'))}
          </Badge>
          {isExternal && (
            <Badge variant="secondary" className="bg-orange-100 text-orange-700 border-orange-200 text-[10px] px-1 py-0">
              {t('externalWallet')}
            </Badge>
          )}
        </div>
        <div className="flex items-center gap-1.5">
          <StatusBadge status={d.status} />
          <button
            onClick={(e) => { e.stopPropagation(); setShowCard(true); }}
            className="flex items-center gap-1 text-[10px] font-semibold text-primary hover:text-primary/80 bg-primary/10 hover:bg-primary/20 rounded-full px-2 py-0.5 transition-colors"
            title={t('viewReceipt')}
          >
            <Receipt className="w-3 h-3" />
            Card
          </button>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-1.5 text-sm">
        <div className="flex items-center gap-1.5 min-w-0 shrink">
          {isExternal && !d.sender_id ? (
            <div className="flex items-center gap-1 min-w-0">
              <Avatar className="w-5 h-5 flex-shrink-0">
                <AvatarFallback className="text-[9px] bg-orange-100 text-orange-700">🌐</AvatarFallback>
              </Avatar>
              {d.sender_address ? (
                <a
                  href={isBtc ? `https://mempool.space/address/${d.sender_address}` : `${explorerUrl}/address/${d.sender_address}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-xs font-medium text-primary hover:underline flex items-center gap-0.5"
                  onClick={e => e.stopPropagation()}
                >
                  {shortenAddress(d.sender_address)} <ExternalLink className="w-2.5 h-2.5" />
                </a>
              ) : (
                <span className="text-xs font-medium text-muted-foreground">{t('externalWallet')}</span>
              )}
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

        <div className="flex items-center gap-1 mx-auto">
          <span className="font-bold whitespace-nowrap text-red-600 text-sm">
            {Number(d.amount).toLocaleString(language === 'vi' ? 'vi-VN' : 'en-US', { maximumFractionDigits: 6 })} {tokenLabel}
          </span>
          {usdValue != null && usdValue > 0 && (
            <span className="text-xs text-muted-foreground whitespace-nowrap">{formatUsdValue(usdValue)}</span>
          )}
        </div>

        <div className="flex items-center gap-2 whitespace-nowrap ml-auto">
          <span className="text-sm font-medium text-primary">{formatTimeLocale(d.created_at, language)}</span>
          <span className="text-sm font-semibold text-yellow-600 dark:text-yellow-400">{formatDateLocale(d.created_at, language)}</span>
          {d.tx_hash && (
            <a href={isBtc ? `https://mempool.space/tx/${d.tx_hash}` : `${explorerUrl}/tx/${d.tx_hash}`} target="_blank" rel="noopener noreferrer" className="text-sm text-primary hover:underline flex items-center gap-0.5">
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

/** Card for pure on-chain BTC transactions (no donation record) */
function OnchainBtcCard({ tx, btcPrice }: { tx: BtcTransaction; btcPrice: number }) {
  const { t, language } = useLanguage();
  const usdValue = tx.amount * btcPrice;
  const dateStr = new Date(tx.timestamp * 1000);

  return (
    <div className="border border-border rounded-lg p-2.5 space-y-1">
      <div className="flex items-center justify-between">
        <Badge variant="outline" className={tx.type === 'received' ? 'border-green-500 text-green-600 bg-green-50 dark:bg-green-950/30 text-xs' : 'border-red-500 text-red-600 bg-red-50 dark:bg-red-950/30 text-xs'}>
          {tx.type === 'received' ? <ArrowDownLeft className="w-3 h-3 mr-0.5" /> : <ArrowUpRight className="w-3 h-3 mr-0.5" />}
          {tx.type === 'received' ? t('receive') : t('send')}
        </Badge>
        <div className="flex items-center gap-1.5">
          <Badge variant="secondary" className="bg-orange-100 text-orange-700 border-orange-200 text-[10px] px-1 py-0">
            On-chain
          </Badge>
          <Badge className={tx.confirmed ? 'bg-green-600 text-xs' : 'bg-yellow-600 text-xs'}>
            {tx.confirmed ? 'Confirmed' : 'Pending'}
          </Badge>
        </div>
      </div>
      <div className="flex items-center justify-between text-sm">
        <div className="flex items-center gap-1.5">
          <span className={`font-bold ${tx.type === 'received' ? 'text-green-600' : 'text-red-600'}`}>
            {tx.type === 'received' ? '+' : '-'}{tx.amount.toFixed(8)} BTC
          </span>
          {usdValue > 0 && (
            <span className="text-xs text-muted-foreground">{formatUsdValue(usdValue)}</span>
          )}
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xs text-muted-foreground">
            {dateStr.toLocaleDateString(language === 'vi' ? 'vi-VN' : 'en-US')} {dateStr.toLocaleTimeString(language === 'vi' ? 'vi-VN' : 'en-US', { hour: '2-digit', minute: '2-digit' })}
          </span>
          <a href={`https://mempool.space/tx/${tx.txid}`} target="_blank" rel="noopener noreferrer" className="text-primary hover:underline flex items-center gap-0.5 text-xs">
            {tx.txid.slice(0, 6)}...{tx.txid.slice(-4)} <ExternalLink className="w-3 h-3" />
          </a>
        </div>
      </div>
    </div>
  );
}

function HistoryTabLegacy({ walletAddress, userDisplayName, userAvatarUrl, username, userCreatedAt, targetUserId, selectedNetwork, btcAddress, prices }: Props) {
  const { userId: currentUserId } = useCurrentUser();
  const effectiveUserId = targetUserId || currentUserId;
  const navigate = useNavigate();
  const { t, language } = useLanguage();
  const [fromDate, setFromDate] = useState<Date | undefined>(undefined);
  const [toDate, setToDate] = useState<Date | undefined>(undefined);
  const [scanning, setScanning] = useState(false);
  const [tokenFilter, setTokenFilter] = useState<string>('all');
  const { donations, loading, error, filter, hasMore, summary, summaryLoading, changeFilter, changeDateRange, fetchDonations, fetchSummary, loadMore } = usePublicDonationHistoryAuto(effectiveUserId ?? undefined, userCreatedAt);

  // Batch 2.3.1 — shadow probe zero-diff 48h trước khi cutover V2.
  useShadowCompare({
    surface: 'public_profile_history',
    legacyCount: summaryLoading ? null : summary.totalCount,
    targetUserId: effectiveUserId ?? null,
    scope: 'profile',
  });
  const {
    transactions: btcTxs,
    isLoading: btcLoading,
    totalReceived: btcRealReceived,
    totalSent: btcRealSent,
    receivedCount: btcRecvCount,
    sentCount: btcSentCount,
  } = useBtcTransactions(selectedNetwork === 'bitcoin' ? btcAddress : null);

  const btcPrice = prices?.BTC?.usd ?? 0;

  // Dùng số liệu derive từ tx list (chính xác — loại change) thay vì chain_stats
  const btcOnChainStats: BtcOnChainStats | null = btcAddress ? {
    totalReceived: btcRealReceived,
    totalSent: btcRealSent,
    receivedCount: btcRecvCount,
    sentCount: btcSentCount,
  } : null;

  const lastScanRef = useRef<number>(0);
  const SCAN_COOLDOWN = 15 * 60 * 1000; // 15 minutes

  const handleScanBtc = useCallback(async () => {
    const now = Date.now();
    const elapsed = now - lastScanRef.current;
    if (elapsed < SCAN_COOLDOWN) {
      const remaining = Math.ceil((SCAN_COOLDOWN - elapsed) / 60000);
      toast.info(t('htbScanCooldown', { minutes: remaining }));
      return;
    }
    lastScanRef.current = now;
    setScanning(true);
    try {
      const [evmResult, btcResult] = await Promise.allSettled([
        supabase.functions.invoke('scan-my-incoming'),
        supabase.functions.invoke('scan-btc-transactions'),
      ]);

      let totalNew = 0;
      let hasError = false;

      if (evmResult.status === 'fulfilled' && !evmResult.value.error) {
        totalNew += evmResult.value.data?.newTransfers || 0;
      } else {
        hasError = true;
        console.error('scan-my-incoming error:', evmResult.status === 'rejected' ? evmResult.reason : evmResult.value.error);
      }
      if (btcResult.status === 'fulfilled' && !btcResult.value.error) {
        totalNew += btcResult.value.data?.newTransfers || 0;
      } else {
        hasError = true;
        console.error('scan-btc error:', btcResult.status === 'rejected' ? btcResult.reason : btcResult.value.error);
        toast.error(t('htbScanBtcError'));
      }

      // Refetch data
      await Promise.all([
        fetchDonations(1),
        fetchSummary(),
      ]);

      if (totalNew > 0) {
        toast.success(t('htbScanFoundNew', { count: totalNew }));
      } else if (!hasError) {
        toast.info(t('htbScanNoNew'));
      }
    } catch (err) {
      console.error('Scan error:', err);
      toast.error(t('htbScanError'));
    } finally {
      setScanning(false);
    }
  }, [fetchDonations, fetchSummary, t]);

  // Unified BTC entries: merge on-chain + donation, deduplicate by tx_hash/txid
  const unifiedBtcEntries = useMemo<UnifiedBtcEntry[]>(() => {
    if (selectedNetwork !== 'bitcoin') return [];

    // Donation entries for BTC
    const btcDonations = donations.filter(d =>
      (d.token_symbol === 'BTC' || d.chain_id === 0) && d.type !== 'swap' && d.type !== 'transfer'
    );

    // Set of tx hashes from donations for dedup
    const donationTxHashes = new Set(btcDonations.map(d => d.tx_hash).filter(Boolean));

    const entries: UnifiedBtcEntry[] = [];

    // Add donation entries
    for (const d of btcDonations) {
      entries.push({
        id: d.id,
        timestamp: new Date(d.created_at).getTime(),
        source: 'donation',
        donation: d,
      });
    }

    // Add on-chain entries that are NOT already in donations
    for (const tx of btcTxs) {
      if (!donationTxHashes.has(tx.txid)) {
        entries.push({
          id: tx.txid,
          timestamp: tx.timestamp * 1000,
          source: 'onchain',
          btcTx: tx,
        });
      }
    }

    // Sort by timestamp descending
    entries.sort((a, b) => b.timestamp - a.timestamp);
    return entries;
  }, [selectedNetwork, donations, btcTxs]);

  useEffect(() => {
    if (effectiveUserId) {
      fetchDonations(1);
      fetchSummary();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [effectiveUserId]);

  // Lắng nghe event sau khi gửi giao dịch để refetch ngay
  useEffect(() => {
    const handler = () => {
      if (effectiveUserId) {
        fetchDonations(1);
        fetchSummary();
      }
    };
    window.addEventListener('wallet-transactions-updated', handler);
    window.addEventListener('invalidate-donations', handler);
    return () => {
      window.removeEventListener('wallet-transactions-updated', handler);
      window.removeEventListener('invalidate-donations', handler);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [effectiveUserId]);

  const handleDateChange = (from: Date | undefined, to: Date | undefined) => {
    setFromDate(from);
    setToDate(to);
    const fromStr = from ? format(from, 'yyyy-MM-dd') : null;
    const toStr = to ? format(to, 'yyyy-MM-dd') : null;
    changeDateRange(fromStr, toStr);
  };

  const handleSetToday = () => {
    const todayStr = getTodayVN();
    const todayDate = new Date(todayStr + 'T00:00:00');
    setFromDate(todayDate);
    setToDate(todayDate);
    changeDateRange(todayStr, todayStr);
  };

  const handleSet7Days = () => {
    const today = new Date();
    const from7 = new Date(today);
    from7.setDate(from7.getDate() - 6);
    setFromDate(from7);
    setToDate(today);
    changeDateRange(format(from7, 'yyyy-MM-dd'), format(today, 'yyyy-MM-dd'));
  };

  const clearDateRange = () => {
    setFromDate(undefined);
    setToDate(undefined);
    changeDateRange(null, null);
  };

  const filters: { key: DonationFilter; label: string }[] = [
    { key: 'all', label: t('filterAll') },
    { key: 'received', label: t('filterReceived') },
    { key: 'sent', label: t('filterSent') },
  ];

  const isBitcoinNetwork = selectedNetwork === 'bitcoin';

  return (
    <div className="space-y-3 overflow-hidden">
      {/* Title */}
      <div className="flex items-center justify-center gap-1.5">
        <Clock className="w-5 h-5" style={{ color: '#2E7D32' }} />
        <h2 className="text-xl uppercase tracking-wider font-extrabold" style={{ color: '#2E7D32', textShadow: '0 1px 2px rgba(46,125,50,0.2)' }}>
          {t('personalTxHistory')}
        </h2>
        <Button
          size="sm"
          variant="ghost"
          onClick={handleScanBtc}
          disabled={scanning}
          className="ml-2 h-7 px-2"
          title={t('htbScanTooltip')}
        >
          <RefreshCw className={cn("w-4 h-4", scanning && "animate-spin")} />
        </Button>
        <ExportTransactionsMenu
          iconOnly
          getRows={() => mapDonationsToRows(donations, effectiveUserId)}
          meta={{
            title: t('htbExportTitle', { name: userDisplayName ?? username ?? '' }),
            userDisplayName: userDisplayName ?? username ?? t('user'),
            userWalletAddress: walletAddress,
            dateRangeLabel:
              fromDate || toDate
                ? `${fromDate ? format(fromDate, 'dd/MM/yyyy') : '…'} → ${toDate ? format(toDate, 'dd/MM/yyyy') : '…'}`
                : t('claimDateRangeAll'),
            isOwner: !!currentUserId && currentUserId === effectiveUserId,
            surface: 'wallet_history',
            filterParams: {
              direction: filter,
              token: tokenFilter,
              dateFrom: fromDate ? format(fromDate, 'yyyy-MM-dd') : null,
              dateTo: toDate ? format(toDate, 'yyyy-MM-dd') : null,
              network: selectedNetwork,
            },
          }}
          filenameBase={`fun-profile-transactions-${username ?? effectiveUserId ?? 'user'}`}
          currentUserId={currentUserId}
        />

      </div>

      {/* Filters + Date Range row */}
      <div className="flex items-center gap-1.5 flex-wrap">
        <Filter className="w-4 h-4 text-muted-foreground flex-shrink-0" />
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
            <SelectItem value="all">{t('filterAll')}</SelectItem>
            {TOKEN_ORDER.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}
          </SelectContent>
        </Select>

        <div className="ml-auto flex items-center gap-1">
          <Button size="sm" variant="outline" onClick={handleSetToday} className="h-7 text-xs px-2">
            {t('walletToday')}
          </Button>
          <Button size="sm" variant="outline" onClick={handleSet7Days} className="h-7 text-xs px-2">
            {t('donation7Days')}
          </Button>
          <Popover>
            <PopoverTrigger asChild>
              <Button size="sm" variant="outline" className={cn("h-8 text-xs gap-1 min-w-0", fromDate && "border-primary text-primary")}>
                <CalendarDays className="w-3.5 h-3.5 flex-shrink-0" />
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

          <Popover>
            <PopoverTrigger asChild>
              <Button size="sm" variant="outline" className={cn("h-8 text-xs gap-1 min-w-0", toDate && "border-primary text-primary")}>
                <CalendarDays className="w-3.5 h-3.5 flex-shrink-0" />
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

          {(fromDate || toDate) && (
            <Button size="sm" variant="ghost" onClick={clearDateRange} className="h-8 w-8 p-0">
              <X className="w-3.5 h-3.5" />
            </Button>
          )}
        </div>
      </div>

      {/* Summary Table */}
      <SummaryTable summary={summary} activeFilter={filter} btcOnChain={isBitcoinNetwork ? btcOnChainStats : null} />

      {/* Auto-import giao dịch ví ngoài (READ-ONLY, không tính LS) */}
      {!targetUserId && <ExternalWalletActivityCard />}

      {/* Unified BTC list when bitcoin network is selected */}
      {isBitcoinNetwork ? (
        <>
          {(btcLoading || loading) && unifiedBtcEntries.length === 0 ? (
            <div className="space-y-3">
              {[1, 2, 3].map(i => <Skeleton key={i} className="h-20 w-full rounded-xl" />)}
            </div>
          ) : unifiedBtcEntries.length === 0 ? (
            <p className="text-center text-muted-foreground py-8">{t('noTransactionsFound')}</p>
          ) : (
            <div className="flex-1 overflow-y-auto overflow-x-hidden min-h-0 max-h-[50vh]">
              <div className="space-y-2">
                {unifiedBtcEntries
                  .filter(entry => {
                    if (filter === 'all') return true;
                    if (filter === 'received') {
                      if (entry.source === 'onchain') return entry.btcTx?.type === 'received';
                      if (entry.source === 'donation') return entry.donation?.sender_id !== effectiveUserId;
                    }
                    if (filter === 'sent') {
                      if (entry.source === 'onchain') return entry.btcTx?.type === 'sent';
                      if (entry.source === 'donation') return entry.donation?.sender_id === effectiveUserId;
                    }
                    return true;
                  })
                  .map(entry => {
                    if (entry.source === 'donation' && entry.donation) {
                      return <DonationCard key={entry.id} d={entry.donation} userId={effectiveUserId!} btcPrice={btcPrice || undefined} />;
                    }
                    if (entry.source === 'onchain' && entry.btcTx) {
                      return <OnchainBtcCard key={entry.id} tx={entry.btcTx} btcPrice={btcPrice} />;
                    }
                    return null;
                  })}
              </div>
            </div>
          )}
        </>
      ) : (
        <>
          {/* EVM Donations list */}
          {error && <p className="text-destructive text-sm">{error}</p>}

          {loading && donations.length === 0 ? (
            <div className="space-y-3">
              {[...Array(5)].map((_, i) => <Skeleton key={i} className="h-20 w-full rounded-xl" />)}
            </div>
          ) : donations.length === 0 ? (
            <p className="text-center text-muted-foreground py-8">{t('noTransactionsFound')}</p>
          ) : (
            <div className="flex-1 overflow-y-auto overflow-x-hidden min-h-0 max-h-[50vh]">
              <div className="space-y-2">
              {donations
                .filter(d => d.type !== 'swap')
                .filter(d => {
                  if (selectedNetwork === 'evm') return d.token_symbol !== 'BTC' && d.chain_id !== 0;
                  return true;
                })
                .filter(d => tokenFilter === 'all' || getGiftTokenLabel(d.token_symbol, d.chain_id) === tokenFilter)
                .map(d => (
                  <DonationCard key={d.id} d={d} userId={effectiveUserId!} />
                ))}
              </div>

              {hasMore && !loading && (
                <div className="flex justify-center mt-4 pb-2">
                  <Button variant="outline" onClick={loadMore} size="sm">
                    {t('loadMoreBtn')}
                  </Button>
                </div>
              )}
            </div>
          )}
        </>
      )}

      {/* Link to full donations page */}
      <div className="flex justify-center pt-2 pb-4">
        <Button
          variant="outline"
          className="w-full max-w-md gap-2 border-yellow-400 bg-background text-primary hover:bg-yellow-50 hover:text-primary"
          onClick={() => navigate('/donations')}
        >
          {t('viewAllTxFunProfile')}
          <ArrowRight className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Unified History gate (M5): khi flag bật → render TransactionHistoryPage
// (full unified UI). Khi tắt → giữ HistoryTabLegacy như cũ.
// ---------------------------------------------------------------------------
import { useUnifiedHistoryEnabled as _useUnifiedHistoryEnabled } from '@/hooks/useUnifiedHistoryEnabled';
import { TransactionHistoryPage as _TransactionHistoryPage } from '@/components/transactions/TransactionHistoryPage';
import { ShadowProbe as _ShadowProbe } from '@/components/transactions/ShadowProbe';

export function HistoryTab(props: Props) {
  const { t } = useLanguage();
  const { enabled } = _useUnifiedHistoryEnabled();
  const { userId: currentUserId } = useCurrentUser();
  const effectiveUserId = props.targetUserId || currentUserId;

  if (enabled) {
    return (
      <_TransactionHistoryPage
        scope="self"
        targetUserId={effectiveUserId}
        userDisplayName={props.userDisplayName || t('whpMe')}
        userWalletAddress={props.walletAddress ?? null}
        syncUrl={false}
      />
    );
  }
  return (
    <>
      <_ShadowProbe surface="wallet_history" targetUserId={effectiveUserId} />
      <HistoryTabLegacy {...props} />
    </>
  );
}


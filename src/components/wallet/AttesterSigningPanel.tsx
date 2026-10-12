import { memo, useState, useMemo } from 'react';
import { useLanguage } from '@/i18n/LanguageContext';
import { useAccount } from 'wagmi';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Checkbox } from '@/components/ui/checkbox';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Input } from '@/components/ui/input';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Loader2, Shield, CheckCircle2, Clock, Pen, CheckCheck, Users, Search, AlertTriangle, Coins, XCircle, FileSignature } from 'lucide-react';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { formatDistanceToNow } from 'date-fns';
import type { Locale } from 'date-fns';
import { useDateLocale } from '@/hooks/useDateLocale';
import { formatFUN, GOV_GROUPS, GovGroupKey } from '@/config/pplp';
import type { AttesterMintRequest } from '@/hooks/useAttesterSigning';
import { useAttesterDashboardStats } from '@/hooks/useAttesterDashboardStats';

const DASHBOARD_LIMIT = 1000;

const GROUP_ORDER: GovGroupKey[] = ['will', 'wisdom', 'love'];

const GROUP_COLORS: Record<GovGroupKey, { bg: string; border: string; text: string; signedBg: string }> = {
  will: {
    bg: 'bg-blue-50 dark:bg-blue-950/30',
    border: 'border-blue-200 dark:border-blue-800',
    text: 'text-blue-700 dark:text-blue-300',
    signedBg: 'bg-blue-100 dark:bg-blue-900/40',
  },
  wisdom: {
    bg: 'bg-amber-50 dark:bg-amber-950/30',
    border: 'border-amber-200 dark:border-amber-800',
    text: 'text-amber-700 dark:text-amber-300',
    signedBg: 'bg-amber-100 dark:bg-amber-900/40',
  },
  love: {
    bg: 'bg-rose-50 dark:bg-rose-950/30',
    border: 'border-rose-200 dark:border-rose-800',
    text: 'text-rose-700 dark:text-rose-300',
    signedBg: 'bg-rose-100 dark:bg-rose-900/40',
  },
};

const formatSignerAddress = (address?: string | null) => {
  if (!address) return null;
  return `${address.slice(0, 6)}…${address.slice(-4)}`;
};

// Hiển thị tên đẹp: ưu tiên full_name, nếu trống thì dùng username (định dạng ví Web3 nếu cần)
type TranslateFn = ReturnType<typeof useLanguage>['t'];

const formatRecipientName = (fullName: string | null | undefined, username: string | null | undefined, t: TranslateFn) => {
  if (fullName?.trim()) return fullName.trim();
  if (!username) return 'Unknown';
  if (username.startsWith('wallet_0x')) {
    const addr = username.slice('wallet_'.length);
    return t('aspWalletShort', { address: `${addr.slice(0, 6)}…${addr.slice(-4)}` });
  }
  return username;
};

interface AttesterSigningPanelProps {
  attesterGroup: GovGroupKey;
  attesterName: string | null;
  requests: AttesterMintRequest[];
  isLoading: boolean;
  signingRequestId: string | null;
  onSign: (id: string) => Promise<boolean>;
}

export const AttesterSigningPanel = memo(({
  attesterGroup,
  attesterName,
  requests,
  isLoading,
  signingRequestId,
  onSign,
}: AttesterSigningPanelProps) => {
  const group = GOV_GROUPS[attesterGroup];
  const dateLocale = useDateLocale();
  const { address } = useAccount();
  const { stats } = useAttesterDashboardStats(address);
  const { t } = useLanguage();
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [signingAll, setSigningAll] = useState(false);
  const [signAllProgress, setSignAllProgress] = useState({ current: 0, total: 0 });
  const [searchQuery, setSearchQuery] = useState('');

  const filteredRequests = useMemo(() => {
    const base = !searchQuery.trim()
      ? requests
      : (() => {
          const q = searchQuery.toLowerCase();
          return requests.filter(r =>
            (r.profiles?.full_name?.toLowerCase().includes(q)) ||
            (r.profiles?.username?.toLowerCase().includes(q)) ||
            (formatRecipientName(r.profiles?.full_name, r.profiles?.username, t).toLowerCase().includes(q)) ||
            (r.id?.toLowerCase().includes(q))
          );
        })();

    // Sắp xếp: lệnh chưa đủ 3 chữ ký lên trên, đã đủ xuống dưới.
    // Trong nhóm "chưa đủ", lệnh nhóm mình chưa ký được ưu tiên cao nhất.
    // Sắp tiếp theo signedCount tăng dần (ít chữ ký nhất lên trên), rồi created_at cũ nhất lên trên.
    const rank = (r: AttesterMintRequest) => {
      const sigs = r.multisig_signatures ?? {};
      const completed = r.multisig_completed_groups ?? [];
      const signedCount = GROUP_ORDER.filter(gk => !!sigs[gk] || completed.includes(gk)).length;
      const isFullySigned = r.status === 'signed' || r.status === 'confirmed' || signedCount >= 3;
      const myGroupSigned = !!sigs[attesterGroup] || completed.includes(attesterGroup);

      // tier: 0 = mình chưa ký (cao nhất), 1 = mình đã ký nhưng chưa đủ 3, 2 = đủ 3 (xuống cuối)
      let tier = 2;
      if (!isFullySigned && !myGroupSigned) tier = 0;
      else if (!isFullySigned && myGroupSigned) tier = 1;

      return { tier, signedCount, createdAt: new Date(r.created_at).getTime() };
    };

    return [...base].sort((a, b) => {
      const ra = rank(a);
      const rb = rank(b);
      if (ra.tier !== rb.tier) return ra.tier - rb.tier;
      if (ra.signedCount !== rb.signedCount) return ra.signedCount - rb.signedCount;
      return ra.createdAt - rb.createdAt;
    });
  }, [requests, searchQuery, attesterGroup]);

  const needsMySign = useMemo(() => filteredRequests.filter(r => {
    const sigs = r.multisig_signatures ?? {};
    const completed = r.multisig_completed_groups ?? [];
    return !sigs[attesterGroup] && !completed.includes(attesterGroup) && r.status !== 'signed';
  }), [filteredRequests, attesterGroup]);

  const isAnySigning = !!signingRequestId || signingAll;

  const toggleSelect = (id: string) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const selectAll = () => {
    if (selectedIds.size === needsMySign.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(needsMySign.map(r => r.id)));
    }
  };

  const handleSignSelected = async () => {
    const ids = Array.from(selectedIds).filter(id => needsMySign.some(r => r.id === id));
    if (ids.length === 0) return;
    setSigningAll(true);
    setSignAllProgress({ current: 0, total: ids.length });
    for (let i = 0; i < ids.length; i++) {
      setSignAllProgress({ current: i + 1, total: ids.length });
      await onSign(ids[i]);
    }
    setSigningAll(false);
    setSelectedIds(new Set());
  };

  const handleSignAll = async () => {
    const ids = needsMySign.map(r => r.id);
    setSelectedIds(new Set(ids));
    setSigningAll(true);
    setSignAllProgress({ current: 0, total: ids.length });
    for (let i = 0; i < ids.length; i++) {
      setSignAllProgress({ current: i + 1, total: ids.length });
      await onSign(ids[i]);
    }
    setSigningAll(false);
    setSelectedIds(new Set());
  };

  return (
    <Card className="shadow-md border-border overflow-hidden">
      {/* Header */}
      <CardHeader className="bg-gradient-to-r from-primary/5 via-primary/3 to-transparent pb-4 border-b border-border">
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2.5 text-base">
            <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center">
              <Shield className="w-4 h-4 text-primary" />
            </div>
            <div>
              <span className="text-foreground font-semibold text-base">GOV Multisig Dashboard</span>
              <p className="text-xs text-muted-foreground font-normal mt-0.5">
                {needsMySign.length > 0
                  ? t('aspHeaderNeedsSign', { count: needsMySign.length, total: requests.length, confirmed: stats.confirmed_count.toLocaleString('vi-VN') })
                  : t('aspHeaderShowing', { total: requests.length, confirmed: stats.confirmed_count.toLocaleString('vi-VN') })}
              </p>
            </div>
          </CardTitle>
          <Badge className="border-primary/20 bg-primary/5 text-primary text-xs font-medium">
            {group.emoji} {attesterName || group.nameVi}
          </Badge>
        </div>
      </CardHeader>

      <CardContent className="p-4 space-y-4">
        {/* Stats Row — 5 ô tổng hợp toàn bảng (không bị LIMIT) */}
        {!isLoading && (requests.length > 0 || stats.confirmed_count > 0) && (
          <TooltipProvider delayDuration={200}>
            <div className="grid grid-cols-2 md:grid-cols-5 gap-2.5">
              {/* 1. Tổng lệnh đang hiển thị */}
              <div className="rounded-lg border border-border bg-card p-3 text-center">
                <div className="text-xl md:text-2xl font-bold text-foreground tabular-nums">{requests.length.toLocaleString('vi-VN')}</div>
                <div className="text-[11px] text-muted-foreground font-medium mt-0.5 leading-tight">{t('aspStatShowing')}</div>
              </div>

              {/* 2. FUN chờ ký = pending_sig + signing */}
              <div className="rounded-lg border border-amber-200 dark:border-amber-800 bg-amber-50/50 dark:bg-amber-950/20 p-3 text-center">
                <div className="text-xl md:text-2xl font-bold text-amber-600 tabular-nums">
                  {formatFUN(stats.pending_sig_fun + stats.signing_fun)}
                </div>
                <div className="text-[11px] text-muted-foreground font-medium mt-0.5 leading-tight flex items-center justify-center gap-1">
                  <Clock className="w-3 h-3" /> {t('aspStatFunPendingSign', { count: (stats.pending_sig_count + stats.signing_count).toLocaleString('vi-VN') })}
                </div>
              </div>

              {/* 3. FUN đã đủ chữ ký, chờ submit on-chain */}
              <div className="rounded-lg border border-blue-200 dark:border-blue-800 bg-blue-50/50 dark:bg-blue-950/20 p-3 text-center">
                <div className="text-xl md:text-2xl font-bold text-blue-600 tabular-nums">{formatFUN(stats.signed_fun)}</div>
                <div className="text-[11px] text-muted-foreground font-medium mt-0.5 leading-tight flex items-center justify-center gap-1">
                  <FileSignature className="w-3 h-3" /> {t('aspStatFunSigned', { count: stats.signed_count.toLocaleString('vi-VN') })}
                </div>
              </div>

              {/* 4. Đã mint on-chain (toàn cục) */}
              <div className="rounded-lg border border-emerald-200 dark:border-emerald-800 bg-emerald-50/50 dark:bg-emerald-950/20 p-3 text-center">
                <div className="text-xl md:text-2xl font-bold text-emerald-600 tabular-nums flex items-center justify-center gap-1">
                  <CheckCircle2 className="w-4 h-4" />{formatFUN(stats.confirmed_fun)}
                </div>
                <div className="text-[11px] text-muted-foreground font-medium mt-0.5 leading-tight">
                  {t('aspStatFunMinted', { count: stats.confirmed_count.toLocaleString('vi-VN') })}
                </div>
              </div>

              {/* 5. Đã từ chối 24h */}
              <Tooltip>
                <TooltipTrigger asChild>
                  <div className="rounded-lg border border-rose-200 dark:border-rose-800 bg-rose-50/50 dark:bg-rose-950/20 p-3 text-center cursor-help">
                    <div className="text-xl md:text-2xl font-bold text-rose-600 tabular-nums flex items-center justify-center gap-1">
                      <XCircle className="w-4 h-4" />{formatFUN(stats.rejected_24h_fun)}
                    </div>
                    <div className="text-[11px] text-muted-foreground font-medium mt-0.5 leading-tight">
                      {t('aspStatRejected24h', { count: stats.rejected_24h_count.toLocaleString('vi-VN') })}
                    </div>
                  </div>
                </TooltipTrigger>
                <TooltipContent side="bottom" className="text-xs max-w-[220px]">
                  {t('aspRejected24hTooltip')}
                </TooltipContent>
              </Tooltip>
            </div>
          </TooltipProvider>
        )}

        {/* Banner cảnh báo đụng trần LIMIT 1000 */}
        {!isLoading && (stats.is_capped || requests.length >= DASHBOARD_LIMIT) && (
          <Alert className="border-amber-300 bg-amber-50 dark:bg-amber-950/30 dark:border-amber-800">
            <AlertTriangle className="h-4 w-4 text-amber-600" />
            <AlertDescription className="text-amber-900 dark:text-amber-200 text-sm">
              <span className="font-semibold">{t('aspLimitReached', { limit: DASHBOARD_LIMIT.toLocaleString('vi-VN') })}</span>{' '}
              {t('aspLimitHint')}
            </AlertDescription>
          </Alert>
        )}

        {/* Search */}
        {!isLoading && requests.length > 0 && (
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder={t('aspSearchPlaceholder')}
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-9 h-9 text-sm"
            />
          </div>
        )}

        {/* Action buttons */}
        {!isLoading && needsMySign.length > 0 && (
          <div className="flex gap-2">
            <Button
              onClick={handleSignAll}
              disabled={isAnySigning}
              className="flex-1 bg-primary hover:bg-primary/90 text-primary-foreground"
              size="sm"
            >
              {signingAll ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  {t('aspSigningProgress', { current: signAllProgress.current, total: signAllProgress.total })}
                </>
              ) : (
                <>
                  <CheckCheck className="w-4 h-4 mr-2" />
                  {t('aspSignAll', { count: needsMySign.length })}
                </>
              )}
            </Button>
            {selectedIds.size > 0 && !signingAll && (
              <Button
                onClick={handleSignSelected}
                disabled={isAnySigning}
                variant="outline"
                size="sm"
              >
                <Pen className="w-4 h-4 mr-2" />
                {t('aspSignSelected', { count: selectedIds.size })}
              </Button>
            )}
          </div>
        )}

        {/* Signing progress bar */}
        {signingAll && (
          <div className="space-y-1.5">
            <Progress value={(signAllProgress.current / signAllProgress.total) * 100} className="h-2" />
            <p className="text-xs text-center text-muted-foreground">
              {t('aspSigningOrderProgress', { current: signAllProgress.current, total: signAllProgress.total })}
            </p>
          </div>
        )}

        {/* Table */}
        {isLoading ? (
          <div className="flex items-center justify-center py-10">
            <Loader2 className="w-6 h-6 animate-spin text-primary" />
          </div>
        ) : filteredRequests.length === 0 ? (
          <div className="text-center py-10">
            <div className="w-12 h-12 mx-auto rounded-full bg-muted flex items-center justify-center mb-3">
              <Shield className="w-6 h-6 text-muted-foreground/50" />
            </div>
            <p className="text-sm text-muted-foreground">{searchQuery ? t('adminNotFound') : t('aspNoMintRequests')}</p>
          </div>
        ) : (
          <div className="rounded-lg border border-border overflow-hidden">
            <ScrollArea className="h-[520px]">
              {/* Table Header */}
              <div className="sticky top-0 z-10 bg-muted/80 backdrop-blur-sm border-b border-border">
                <div className="grid grid-cols-[36px_1fr_100px_1fr_80px] gap-2 px-3 py-2.5 text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                  <div className="flex items-center">
                    <Checkbox
                      checked={selectedIds.size === needsMySign.length && needsMySign.length > 0}
                      onCheckedChange={selectAll}
                      disabled={isAnySigning}
                    />
                  </div>
                  <div>{t('recipientLabel')}</div>
                  <div className="text-right">FUN</div>
                  <div className="text-center">{t('aspColSigningProgress')}</div>
                  <div className="text-center">{t('authWalletStepSign')}</div>
                </div>
              </div>

              {/* Table Body */}
              <div className="divide-y divide-border">
                {filteredRequests.map(req => (
                  <RequestRow
                    key={req.id}
                    req={req}
                    attesterGroup={attesterGroup}
                    isAnySigning={isAnySigning}
                    signingRequestId={signingRequestId}
                    selectedIds={selectedIds}
                    onToggleSelect={toggleSelect}
                    onSign={onSign}
                    dateLocale={dateLocale}
                  />
                ))}
              </div>
            </ScrollArea>
          </div>
        )}
      </CardContent>
    </Card>
  );
});

AttesterSigningPanel.displayName = 'AttesterSigningPanel';

/* ─── Request Row ─── */
interface RequestRowProps {
  req: AttesterMintRequest;
  attesterGroup: GovGroupKey;
  isAnySigning: boolean;
  signingRequestId: string | null;
  selectedIds: Set<string>;
  onToggleSelect: (id: string) => void;
  onSign: (id: string) => Promise<boolean>;
  dateLocale: Locale;
}

const RequestRow = memo(({
  req,
  attesterGroup,
  isAnySigning,
  signingRequestId,
  selectedIds,
  onToggleSelect,
  onSign,
  dateLocale,
}: RequestRowProps) => {
  const { t } = useLanguage();
  const sigs = req.multisig_signatures ?? {};
  const completed = req.multisig_completed_groups ?? [];
  const myGroupSigned = !!sigs[attesterGroup];
  const isFullySigned = req.status === 'signed';
  const isRejected = req.status === 'rejected';
  const canSign = !myGroupSigned && !isFullySigned && !isRejected;
  const isThisSigning = signingRequestId === req.id;
  const signedCount = GROUP_ORDER.filter(gk => !!sigs[gk] || completed.includes(gk)).length;

  return (
    <div
      className={`grid grid-cols-[36px_1fr_100px_1fr_80px] gap-2 px-3 py-3 items-center text-sm transition-colors ${
        isThisSigning
          ? 'bg-primary/5'
          : isRejected
            ? 'bg-destructive/5 hover:bg-destructive/10'
            : 'hover:bg-muted/40'
      }`}
    >
      {/* Checkbox */}
      <div className="flex items-center">
        {canSign ? (
          <Checkbox
            checked={selectedIds.has(req.id)}
            onCheckedChange={() => onToggleSelect(req.id)}
            disabled={isAnySigning}
          />
        ) : isRejected ? (
          <span className="text-destructive text-base leading-none" aria-label={t('aspRejected')}>⛔</span>
        ) : (
          <CheckCircle2 className="w-4 h-4 text-green-500" />
        )}
      </div>

      {/* User info */}
      <div className="min-w-0">
        <div className="flex items-center gap-1.5 flex-wrap">
          <span className="font-semibold text-foreground truncate text-base">
            {formatRecipientName(req.profiles?.full_name, req.profiles?.username, t)}
          </span>
          <span className="text-xs text-muted-foreground font-mono shrink-0">
            #{req.id.slice(0, 6)}
          </span>
          {/* Nhãn trạng thái rõ ràng cho admin */}
          {isThisSigning ? (
            <Badge className="shrink-0 text-[10px] px-1.5 py-0.5 bg-primary/15 text-primary border-primary/30 gap-1">
              <Loader2 className="w-2.5 h-2.5 animate-spin" />
              {t('aspSigning')}
            </Badge>
          ) : isRejected ? (
            <Badge className="shrink-0 text-[10px] px-1.5 py-0.5 bg-destructive/15 text-destructive border-destructive/40">
              ⛔ {t('aspRejected')}
            </Badge>
          ) : isFullySigned ? (
            <Badge className="shrink-0 text-[10px] px-1.5 py-0.5 bg-green-100 text-green-700 border-green-300 dark:bg-green-900/40 dark:text-green-400 dark:border-green-700">
              {t('aspFullySigned')}
            </Badge>
          ) : myGroupSigned ? (
            <Badge variant="outline" className="shrink-0 text-[10px] px-1.5 py-0.5 bg-blue-50 text-blue-700 border-blue-300 dark:bg-blue-950/40 dark:text-blue-300 dark:border-blue-800">
              {t('aspYourGroupSigned', { remaining: 3 - signedCount })}
            </Badge>
          ) : (
            <Badge variant="outline" className="shrink-0 text-[10px] px-1.5 py-0.5 bg-amber-50 text-amber-700 border-amber-300 dark:bg-amber-950/40 dark:text-amber-300 dark:border-amber-800">
              {t('aspNotSignedYet', { count: signedCount })}
            </Badge>
          )}
        </div>
        <div className="text-xs text-muted-foreground mt-0.5">
          {formatDistanceToNow(new Date(req.created_at), { addSuffix: true, locale: dateLocale })}
          {req.action_types?.length > 0 && ` · ${req.action_types.join(', ')}`}
        </div>
        {/* Lý do bị từ chối / lỗi — hiển thị nổi bật cho admin */}
        {req.error_message && (
          <div className="mt-1.5 rounded-md border border-destructive/40 bg-destructive/10 px-2 py-1 text-[11px] text-destructive font-medium leading-snug break-words">
            <span className="font-semibold">{t('gnuMintRejectedReasonPrefix')}</span>{req.error_message}
          </div>
        )}
      </div>

      {/* Amount */}
      <div className="text-right">
        <span className="font-bold text-amber-600 text-base">{formatFUN(req.amount_display)}</span>
      </div>

      {/* Signing progress — 3 group chips */}
      <TooltipProvider delayDuration={150}>
        <div className="flex items-center gap-1.5">
          {GROUP_ORDER.map(gk => {
            const sig = sigs[gk];
            const isSigned = !!sig || completed.includes(gk);
            const gInfo = GOV_GROUPS[gk];
            const colors = GROUP_COLORS[gk];
            const signerName = sig?.signer_name || formatSignerAddress(sig?.signer);

            return (
              <Tooltip key={gk}>
                <TooltipTrigger asChild>
                  <div
                    className={`flex items-center gap-1 rounded-md border px-2 py-1.5 text-xs font-medium cursor-default transition-colors flex-1 min-w-0 ${
                      isSigned
                        ? `${colors.signedBg} ${colors.border} ${colors.text}`
                        : 'border-border bg-muted/40 text-muted-foreground'
                    }`}
                  >
                    <span className="shrink-0 text-xs">{gInfo.emoji}</span>
                    {isSigned ? (
                      <>
                        <span className="truncate font-semibold">{signerName || t('aspSigned')}</span>
                        <CheckCircle2 className="w-3 h-3 shrink-0 text-green-500" />
                      </>
                    ) : (
                      <>
                        <span className="truncate">{t('aspAwaitingSign')}</span>
                        <Clock className="w-3 h-3 shrink-0 opacity-50" />
                      </>
                    )}
                  </div>
                </TooltipTrigger>
                <TooltipContent side="top" className="text-xs max-w-[220px] space-y-1">
                  <p className="font-semibold">{gInfo.emoji} {gInfo.nameVi}</p>
                  {isSigned ? (
                    <>
                      <p className="text-green-600">✅ {signerName || t('aspSigned')}</p>
                      {sig?.signer && (
                        <p className="font-mono text-[10px] text-muted-foreground break-all">{sig.signer}</p>
                      )}
                      {sig?.signed_at && (
                        <p className="text-muted-foreground">
                          {formatDistanceToNow(new Date(sig.signed_at), { addSuffix: true, locale: dateLocale })}
                        </p>
                      )}
                    </>
                  ) : (
                    <div className="space-y-0.5">
                      <p className="text-muted-foreground">{t('aspAwaitingSignBy')}</p>
                      {gInfo.members.map(m => (
                        <p key={m.name} className="text-[10px]">• {m.name}</p>
                      ))}
                    </div>
                  )}
                </TooltipContent>
              </Tooltip>
            );
          })}
          {/* Counter badge */}
          <Badge
            variant="outline"
            className={`shrink-0 text-[10px] px-1.5 py-0.5 ${
              signedCount === 3
                ? 'bg-green-100 text-green-700 border-green-300 dark:bg-green-900/40 dark:text-green-400 dark:border-green-700'
                : 'text-muted-foreground'
            }`}
          >
            {signedCount}/3
          </Badge>
        </div>
      </TooltipProvider>

      {/* Action */}
      <div className="flex justify-center">
        {canSign ? (
          <Button
            size="sm"
            variant="outline"
            className="h-7 px-2.5 text-xs border-primary/30 text-primary hover:bg-primary/10"
            onClick={() => onSign(req.id)}
            disabled={isAnySigning}
          >
            {isThisSigning ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
            ) : (
              <Pen className="w-3.5 h-3.5" />
            )}
          </Button>
        ) : isRejected ? (
          <Badge className="bg-destructive/15 text-destructive border-destructive/40 text-[10px]">{t('aspCancelled')}</Badge>
        ) : myGroupSigned ? (
          <span className="text-[11px] text-green-600 font-medium">✓ {t('aspSigned')}</span>
        ) : (
          <Badge className="bg-green-100 text-green-700 border-0 text-[10px] dark:bg-green-900/40 dark:text-green-400">{t('completedProgress')}</Badge>
        )}
      </div>
    </div>
  );
});

RequestRow.displayName = 'RequestRow';

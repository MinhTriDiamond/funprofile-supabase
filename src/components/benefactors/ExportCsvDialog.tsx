/**
 * ExportCsvDialog — Sub-phase 2.5
 * Xuất 3 loại CSV: USD Ranking / Token Ranking / Ecosystem Dimensions.
 * KHÔNG đổi RPC USD, KHÔNG đụng scanner/unified history.
 */
import { useMemo, useState } from 'react';
import { format } from 'date-fns';
import { vi } from 'date-fns/locale';
import { CalendarIcon, Download, Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Calendar } from '@/components/ui/calendar';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { toast } from 'sonner';

type Tab = 'donors' | 'recipients';
type ExportType = 'usd' | 'token' | 'ecosystem';
type TimeRange = 'day' | 'week' | 'month' | 'all';

interface EcosystemTokenOption {
  symbol: string;
}

interface Props {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  activeTab: Tab;
  /** Segment đang active ở page, dùng làm default export type. */
  activeSegment?: ExportType;
  /** Danh sách token USD-eligible (từ get_donation_global_stats.totals_by_token). */
  usdTokens?: string[];
  /** Token đang chọn ở Token Ranking segment (default cho token export). */
  currentTokenSymbol?: string | null;
  /** TimeRange enum đang active (dùng cho token/ecosystem export). */
  currentTimeRange?: TimeRange;
}

type Preset = 'today' | '7d' | '30d' | 'thisMonth' | 'lastMonth' | 'all' | 'custom';

const PRESETS: { value: Preset; label: string }[] = [
  { value: 'today', label: 'Hôm nay' },
  { value: '7d', label: '7 ngày qua' },
  { value: '30d', label: '30 ngày qua' },
  { value: 'thisMonth', label: 'Tháng này' },
  { value: 'lastMonth', label: 'Tháng trước' },
  { value: 'all', label: 'Tất cả' },
  { value: 'custom', label: 'Tuỳ chỉnh...' },
];

const TIME_RANGE_OPTIONS: { value: TimeRange; label: string }[] = [
  { value: 'day', label: 'Hôm nay' },
  { value: 'week', label: 'Tuần này' },
  { value: 'month', label: 'Tháng này' },
  { value: 'all', label: 'Tất cả' },
];

const TIME_RANGE_LABEL: Record<TimeRange, string> = {
  day: 'Hôm nay',
  week: 'Tuần này',
  month: 'Tháng này',
  all: 'Tất cả',
};

function resolveRange(preset: Preset, from?: Date, to?: Date): { from: Date | null; to: Date | null } {
  const now = new Date();
  switch (preset) {
    case 'today': {
      const f = new Date(now); f.setHours(0, 0, 0, 0);
      return { from: f, to: now };
    }
    case '7d':
      return { from: new Date(now.getTime() - 7 * 86400000), to: now };
    case '30d':
      return { from: new Date(now.getTime() - 30 * 86400000), to: now };
    case 'thisMonth': {
      const f = new Date(now.getFullYear(), now.getMonth(), 1);
      return { from: f, to: now };
    }
    case 'lastMonth': {
      const f = new Date(now.getFullYear(), now.getMonth() - 1, 1);
      const t = new Date(now.getFullYear(), now.getMonth(), 0, 23, 59, 59);
      return { from: f, to: t };
    }
    case 'all':
      return { from: null, to: null };
    case 'custom': {
      const f = from ? new Date(from) : null;
      const t = to ? new Date(to) : null;
      if (f) f.setHours(0, 0, 0, 0);
      if (t) t.setHours(23, 59, 59, 999);
      return { from: f, to: t };
    }
  }
}

const escapeCsv = (v: unknown) => {
  const s = v === null || v === undefined ? '' : String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

const formatTokenTotals = (totals: Record<string, { amount?: number | string }> = {}) =>
  Object.entries(totals)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([symbol, item]) => `${Number(item.amount || 0)} ${symbol}`)
    .join(' | ');

const RANKING_RULE =
  'Xếp hạng USD chỉ tính token eligible theo tokens_registry, giá trị đã được snapshot/corrected theo policy. FUN và ecosystem dimensions không cộng vào total_usd hiện tại.';

const ECOSYSTEM_LIMIT_PER_DIRECTION = 20;

function buildMetadataLines(base: Record<string, string | number | null | undefined>): string[] {
  return Object.entries(base)
    .filter(([, v]) => v !== undefined && v !== null && String(v).length > 0)
    .map(([k, v]) => `# ${k}: ${v}`);
}

function downloadCsv(filename: string, lines: string[]) {
  const csv = '\uFEFF' + lines.join('\n');
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const link = document.createElement('a');
  link.href = URL.createObjectURL(blob);
  link.download = filename;
  link.click();
  URL.revokeObjectURL(link.href);
}

export function ExportCsvDialog({
  open,
  onOpenChange,
  activeTab,
  activeSegment = 'usd',
  usdTokens = [],
  currentTokenSymbol,
  currentTimeRange = 'all',
}: Props) {
  const [exportType, setExportType] = useState<ExportType>(activeSegment);
  const [preset, setPreset] = useState<Preset>('all');
  const [from, setFrom] = useState<Date | undefined>();
  const [to, setTo] = useState<Date | undefined>();
  const [tokenTimeRange, setTokenTimeRange] = useState<TimeRange>(currentTimeRange);
  const [tokenSymbol, setTokenSymbol] = useState<string | null>(currentTokenSymbol ?? usdTokens[0] ?? null);
  const [ecoTokens, setEcoTokens] = useState<EcosystemTokenOption[] | null>(null);
  const [isExporting, setIsExporting] = useState(false);
  const [isLoadingEco, setIsLoadingEco] = useState(false);

  // Merge USD tokens + ecosystem tokens (fetched lazy khi mở dialog hoặc chọn Token type).
  const ensureEcoTokens = async (): Promise<EcosystemTokenOption[]> => {
    if (ecoTokens) return ecoTokens;
    setIsLoadingEco(true);
    try {
      const { data, error } = await supabase.rpc('get_contribution_dimension_stats', {
        p_dimension: 'ecosystem',
        p_time_range: 'all',
      });
      if (error) throw error;
      const list = ((data ?? []) as Array<{ token_symbol: string }>).map((r) => ({ symbol: r.token_symbol }));
      setEcoTokens(list);
      return list;
    } catch (e) {
      console.warn('[ExportCsvDialog] load ecosystem tokens failed', e);
      setEcoTokens([]);
      return [];
    } finally {
      setIsLoadingEco(false);
    }
  };

  const mergedTokens = useMemo(() => {
    const set = new Map<string, string>();
    usdTokens.forEach((s) => set.set(s.toUpperCase(), s));
    (ecoTokens ?? []).forEach((t) => set.set(t.symbol.toUpperCase(), t.symbol));
    return Array.from(set.values()).sort((a, b) => a.localeCompare(b));
  }, [usdTokens, ecoTokens]);

  const handleOpenChange = async (next: boolean) => {
    onOpenChange(next);
    if (next) {
      // Prefetch eco tokens để dropdown Token đủ danh sách BTC/BNB/USDT/CAMLY/FUN + eco tokens.
      void ensureEcoTokens();
    }
  };

  const handleTypeChange = (t: ExportType) => {
    setExportType(t);
    if (t === 'token') void ensureEcoTokens();
  };

  // ============================================================
  // USD Export (giữ nguyên hành vi cũ + metadata mới)
  // ============================================================
  const exportUsd = async () => {
    if (preset === 'custom' && (!from || !to)) {
      toast.error('Vui lòng chọn cả ngày bắt đầu và ngày kết thúc');
      return;
    }
    if (preset === 'custom' && from && to && from > to) {
      toast.error('Ngày bắt đầu phải trước ngày kết thúc');
      return;
    }

    const { from: f, to: t } = resolveRange(preset, from, to);
    const rangeParams = { p_time_range: 'all', p_from: f ? f.toISOString() : null, p_to: t ? t.toISOString() : null };

    const rpcName = activeTab === 'donors' ? 'get_benefactor_leaderboard' : 'get_recipient_leaderboard';
    const listParams: Record<string, unknown> = { p_limit: 100000, p_offset: 0, ...rangeParams };
    if (activeTab === 'donors') listParams.p_token_symbol = null;

    const [listRes, statsRes] = await Promise.all([
      supabase.rpc(rpcName as never, listParams as never),
      supabase.rpc('get_donation_global_stats' as never, rangeParams as never),
    ]);
    if (listRes.error) throw listRes.error;
    if (statsRes.error) throw statsRes.error;

    const rowsData = (listRes.data || []) as Array<Record<string, unknown>>;
    const statsRaw = statsRes.data as unknown;
    const stats = ((Array.isArray(statsRaw) ? statsRaw[0] : statsRaw) ?? {}) as Record<string, unknown>;

    if (rowsData.length === 0) {
      toast.warning('Không có dữ liệu trong khoảng thời gian đã chọn');
      return;
    }

    const rangeLabel = preset === 'custom'
      ? `${f ? format(f, 'yyyy-MM-dd') : ''} → ${t ? format(t, 'yyyy-MM-dd') : ''}`
      : PRESETS.find((p) => p.value === preset)?.label || preset;

    const meta = buildMetadataLines({
      export_type: 'usd_ranking',
      tab: activeTab,
      time_range: rangeLabel,
      time_from: f ? f.toISOString() : 'null',
      time_to: t ? t.toISOString() : 'null',
      generated_at: format(new Date(), 'yyyy-MM-dd HH:mm:ss'),
      ranking_rule: RANKING_RULE,
      note: 'Ecosystem dimensions chỉ mang tính danh dự, không ảnh hưởng USD Ranking.',
    });

    const headers = activeTab === 'donors'
      ? ['Rank', 'Username', 'Full Name', 'Coin Totals', 'Total Donated (USD)', 'Donations Count', 'Light Score']
      : ['Rank', 'Username', 'Full Name', 'Coin Totals', 'Total Received (USD)', 'Donations Count'];

    const rows = rowsData.map((item) => activeTab === 'donors'
      ? [item.rank, item.username, item.full_name, formatTokenTotals(item.totals_by_token as never), Number(item.total_amount_usd || 0).toFixed(2), item.total_transactions, item.total_light_score]
      : [item.rank, item.username, item.full_name, formatTokenTotals(item.totals_by_token as never), Number(item.total_amount_usd || 0).toFixed(2), item.total_transactions]);

    const totalUsd = Number(stats.total_donated_usd || 0).toFixed(2);
    const totalCoins = formatTokenTotals((stats.totals_by_token as never) || {});
    const summary = activeTab === 'donors'
      ? ['', 'TOTAL (toàn hệ thống)', '', totalCoins, totalUsd, stats.total_donations || 0, stats.total_light_score || 0]
      : ['', 'TOTAL (toàn hệ thống)', '', totalCoins, totalUsd, stats.total_donations || 0];

    const csv = [
      ...meta,
      '',
      headers.map(escapeCsv).join(','),
      ...rows.map((r) => r.map(escapeCsv).join(',')),
      summary.map(escapeCsv).join(','),
    ];
    const tag = preset === 'custom'
      ? `${f ? format(f, 'yyyyMMdd') : 'x'}-${t ? format(t, 'yyyyMMdd') : 'x'}`
      : preset;
    downloadCsv(`benefactors-usd-${activeTab}-${tag}-${format(new Date(), 'yyyyMMdd')}.csv`, csv);
    toast.success(`Đã xuất ${rowsData.length} dòng USD Ranking`);
  };

  // ============================================================
  // Token Ranking Export
  // ============================================================
  const exportToken = async () => {
    if (!tokenSymbol) {
      toast.error('Vui lòng chọn token');
      return;
    }
    const direction = activeTab === 'donors' ? 'sent' : 'received';
    const { data, error } = await supabase.rpc('get_token_leaderboard', {
      p_token_symbol: tokenSymbol,
      p_direction: direction,
      p_time_range: tokenTimeRange,
      p_limit: 100000,
      p_offset: 0,
    });
    if (error) throw error;
    const rowsData = (data || []) as Array<Record<string, unknown>>;
    if (rowsData.length === 0) {
      toast.warning('Không có dữ liệu token này trong khoảng thời gian đã chọn');
      return;
    }

    const meta = buildMetadataLines({
      export_type: 'token_ranking',
      tab: activeTab,
      direction,
      token_symbol: tokenSymbol,
      time_range: TIME_RANGE_LABEL[tokenTimeRange],
      generated_at: format(new Date(), 'yyyy-MM-dd HH:mm:ss'),
      ranking_rule: RANKING_RULE,
      note: 'Token Ranking xếp hạng theo total_amount thô của token. total_amount_usd = 0 nếu token không có giá USD (vd: FUN, testnet, ecosystem).',
    });

    const headers = ['Rank', 'Username', 'Full Name', 'Token Symbol', 'Ranking Dimension', 'Total Amount', 'Total Amount USD', 'Tx Count'];
    const rows = rowsData.map((r) => [
      r.rank,
      r.username,
      r.full_name,
      r.token_symbol,
      r.ranking_dimension,
      Number(r.total_amount || 0),
      Number(r.total_amount_usd || 0).toFixed(2),
      r.total_transactions,
    ]);

    const csv = [
      ...meta,
      '',
      headers.map(escapeCsv).join(','),
      ...rows.map((r) => r.map(escapeCsv).join(',')),
    ];
    downloadCsv(
      `benefactors-token-${tokenSymbol}-${direction}-${tokenTimeRange}-${format(new Date(), 'yyyyMMdd')}.csv`,
      csv,
    );
    toast.success(`Đã xuất ${rowsData.length} dòng Token Ranking (${tokenSymbol})`);
  };

  // ============================================================
  // Ecosystem Dimensions Export
  // ============================================================
  const exportEcosystem = async () => {
    const { data: dimData, error: dimErr } = await supabase.rpc('get_contribution_dimension_stats', {
      p_dimension: 'ecosystem',
      p_time_range: tokenTimeRange,
    });
    if (dimErr) throw dimErr;
    const dims = (dimData || []) as Array<Record<string, unknown>>;
    if (dims.length === 0) {
      toast.warning('Không có dữ liệu ecosystem trong khoảng thời gian đã chọn');
      return;
    }

    const meta = buildMetadataLines({
      export_type: 'ecosystem_dimensions',
      time_range: TIME_RANGE_LABEL[tokenTimeRange],
      generated_at: format(new Date(), 'yyyy-MM-dd HH:mm:ss'),
      ranking_rule: RANKING_RULE,
      limit_per_direction_per_token: ECOSYSTEM_LIMIT_PER_DIRECTION,
      note: 'Ecosystem dimensions không ảnh hưởng USD Ranking. Section top_by_token bị giới hạn để tránh nổ CSV.',
    });

    // Section 1: dimension_stats
    const statHeaders = ['Token', 'Dimension', 'Sent', 'Received', 'Tx Count', 'Unique Participants', 'Unique Senders', 'Unique Recipients'];
    const statRows = dims.map((d) => [
      d.token_symbol,
      d.ranking_dimension,
      Number(d.total_sent || 0),
      Number(d.total_received || 0),
      Number(d.transactions || 0),
      Number(d.unique_participants || 0),
      Number(d.unique_senders || 0),
      Number(d.unique_recipients || 0),
    ]);

    // Section 2: top_by_token (sent + received) — parallel fetch
    const topFetches = dims.flatMap((d) => {
      const sym = String(d.token_symbol);
      return (['sent', 'received'] as const).map(async (dir) => {
        const { data, error } = await supabase.rpc('get_token_leaderboard', {
          p_token_symbol: sym,
          p_direction: dir,
          p_time_range: tokenTimeRange,
          p_limit: ECOSYSTEM_LIMIT_PER_DIRECTION,
          p_offset: 0,
        });
        if (error) throw error;
        return { sym, dir, rows: (data || []) as Array<Record<string, unknown>> };
      });
    });
    const topResults = await Promise.all(topFetches);
    const topHeaders = ['Token', 'Direction', 'Rank', 'Username', 'Full Name', 'Total Amount', 'Total USD', 'Tx Count'];
    const topRows: (string | number | null | undefined)[][] = [];
    for (const r of topResults) {
      for (const row of r.rows) {
        topRows.push([
          r.sym,
          r.dir,
          row.rank as never,
          row.username as never,
          row.full_name as never,
          Number(row.total_amount || 0),
          Number(row.total_amount_usd || 0).toFixed(2),
          row.total_transactions as never,
        ]);
      }
    }

    const csv = [
      ...meta,
      '',
      '# --- section: dimension_stats ---',
      statHeaders.map(escapeCsv).join(','),
      ...statRows.map((r) => r.map(escapeCsv).join(',')),
      '',
      '# --- section: top_by_token ---',
      topHeaders.map(escapeCsv).join(','),
      ...topRows.map((r) => r.map(escapeCsv).join(',')),
    ];

    downloadCsv(`benefactors-ecosystem-${tokenTimeRange}-${format(new Date(), 'yyyyMMdd')}.csv`, csv);
    toast.success(`Đã xuất ecosystem: ${dims.length} dimensions, ${topRows.length} top rows`);
  };

  const handleExport = async () => {
    setIsExporting(true);
    try {
      if (exportType === 'usd') await exportUsd();
      else if (exportType === 'token') await exportToken();
      else await exportEcosystem();
      onOpenChange(false);
    } catch (err) {
      console.error('Export CSV error:', err);
      toast.error(`Xuất CSV thất bại: ${(err as Error).message || 'unknown'}`);
    } finally {
      setIsExporting(false);
    }
  };

  const showUsdRangePicker = exportType === 'usd';
  const showTimeRangeEnum = exportType === 'token' || exportType === 'ecosystem';
  const showTokenPicker = exportType === 'token';

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-md max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Xuất CSV Bảng Vinh Danh</DialogTitle>
          <DialogDescription>
            Chọn loại dữ liệu và khoảng thời gian cần xuất ra CSV.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {/* Type selector */}
          <div>
            <label className="text-sm font-medium mb-2 block">Loại xuất</label>
            <div className="grid grid-cols-3 gap-2">
              {([
                { value: 'usd', label: 'USD Ranking' },
                { value: 'token', label: 'Token Ranking' },
                { value: 'ecosystem', label: 'Ecosystem' },
              ] as const).map((t) => (
                <Button
                  key={t.value}
                  type="button"
                  variant={exportType === t.value ? 'default' : 'outline'}
                  size="sm"
                  onClick={() => handleTypeChange(t.value)}
                >
                  {t.label}
                </Button>
              ))}
            </div>
          </div>

          {/* Token picker */}
          {showTokenPicker && (
            <div>
              <label className="text-sm font-medium mb-2 block">
                Token {isLoadingEco && <Loader2 className="inline h-3 w-3 animate-spin ml-1" />}
              </label>
              <Select value={tokenSymbol ?? ''} onValueChange={(v) => setTokenSymbol(v)}>
                <SelectTrigger>
                  <SelectValue placeholder="Chọn token…" />
                </SelectTrigger>
                <SelectContent>
                  {mergedTokens.length === 0 && (
                    <SelectItem value="__empty" disabled>Chưa có token</SelectItem>
                  )}
                  {mergedTokens.map((s) => (
                    <SelectItem key={s} value={s}>{s}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground mt-1">
                Danh sách hợp nhất từ USD-eligible tokens và ecosystem dimensions.
              </p>
            </div>
          )}

          {/* USD range picker */}
          {showUsdRangePicker && (
            <div>
              <label className="text-sm font-medium mb-2 block">Khoảng thời gian</label>
              <div className="grid grid-cols-2 gap-2">
                {PRESETS.map((p) => (
                  <Button
                    key={p.value}
                    type="button"
                    variant={preset === p.value ? 'default' : 'outline'}
                    size="sm"
                    onClick={() => setPreset(p.value)}
                    className="justify-start"
                  >
                    {p.label}
                  </Button>
                ))}
              </div>
              {preset === 'custom' && (
                <div className="grid grid-cols-2 gap-3 mt-3">
                  <div>
                    <label className="text-xs font-medium mb-1 block text-muted-foreground">Từ ngày</label>
                    <Popover>
                      <PopoverTrigger asChild>
                        <Button variant="outline" className={cn('w-full justify-start text-left font-normal', !from && 'text-muted-foreground')}>
                          <CalendarIcon className="mr-2 h-4 w-4" />
                          {from ? format(from, 'dd/MM/yyyy') : 'Chọn'}
                        </Button>
                      </PopoverTrigger>
                      <PopoverContent className="w-auto p-0" align="start">
                        <Calendar mode="single" selected={from} onSelect={setFrom} disabled={(d) => d > new Date() || (to ? d > to : false)} initialFocus locale={vi} className={cn('p-3 pointer-events-auto')} />
                      </PopoverContent>
                    </Popover>
                  </div>
                  <div>
                    <label className="text-xs font-medium mb-1 block text-muted-foreground">Đến ngày</label>
                    <Popover>
                      <PopoverTrigger asChild>
                        <Button variant="outline" className={cn('w-full justify-start text-left font-normal', !to && 'text-muted-foreground')}>
                          <CalendarIcon className="mr-2 h-4 w-4" />
                          {to ? format(to, 'dd/MM/yyyy') : 'Chọn'}
                        </Button>
                      </PopoverTrigger>
                      <PopoverContent className="w-auto p-0" align="start">
                        <Calendar mode="single" selected={to} onSelect={setTo} disabled={(d) => d > new Date() || (from ? d < from : false)} initialFocus locale={vi} className={cn('p-3 pointer-events-auto')} />
                      </PopoverContent>
                    </Popover>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Enum time range for token/ecosystem */}
          {showTimeRangeEnum && (
            <div>
              <label className="text-sm font-medium mb-2 block">Khoảng thời gian</label>
              <div className="grid grid-cols-4 gap-2">
                {TIME_RANGE_OPTIONS.map((r) => (
                  <Button
                    key={r.value}
                    type="button"
                    variant={tokenTimeRange === r.value ? 'default' : 'outline'}
                    size="sm"
                    onClick={() => setTokenTimeRange(r.value)}
                  >
                    {r.label}
                  </Button>
                ))}
              </div>
              <p className="text-xs text-muted-foreground mt-1">
                RPC token/ecosystem chỉ hỗ trợ enum, không hỗ trợ custom range.
              </p>
            </div>
          )}

          {exportType === 'ecosystem' && (
            <p className="text-xs text-muted-foreground">
              Xuất 2 section: <code>dimension_stats</code> + <code>top_by_token</code> (giới hạn {ECOSYSTEM_LIMIT_PER_DIRECTION} rows/direction/token).
            </p>
          )}
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={isExporting}>
            Huỷ
          </Button>
          <Button onClick={handleExport} disabled={isExporting}>
            {isExporting ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Download className="w-4 h-4 mr-2" />}
            {isExporting ? 'Đang xuất...' : 'Xuất CSV'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/**
 * Allocation Audit Table — xem allocation_amount vs allocation_amount_capped
 * và reason_codes theo từng cycle mint, lọc theo user.
 */
import { useEffect, useMemo, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Search, Download, Shield, AlertTriangle, Filter } from 'lucide-react';
import { Skeleton } from '@/components/ui/skeleton';
import { toast } from 'sonner';

interface EpochOption {
  id: string;
  epoch_month: string;
  status: string;
  mint_pool: number;
  rules_version: string | null;
  allocation_breakdown: Record<string, unknown> | null;
}

interface AllocationRow {
  id: string;
  user_id: string;
  light_score_total: number;
  share_percent: number;
  allocation_amount: number;
  allocation_amount_capped: number;
  instant_amount: number;
  locked_amount: number;
  is_eligible: boolean;
  status: string;
  reason_codes: string[] | null;
  mint_request_id: string | null;
  profile?: {
    username: string | null;
    display_name: string | null;
    avatar_url: string | null;
  } | null;
}

type FilterMode = 'all' | 'capped' | 'dust' | 'eligible' | 'with_request';

const safeNum = (v: unknown): number => {
  const n = Number(v ?? 0);
  return Number.isFinite(n) ? n : 0;
};
const fmt = (n: number) => Math.round(safeNum(n)).toLocaleString('vi-VN');
const hasReason = (row: AllocationRow, matcher: (code: string) => boolean) =>
  row.reason_codes?.some((code) => matcher(code.toLowerCase())) ?? false;
const hasCappedReason = (row: AllocationRow) => hasReason(row, c => c.includes('capped'));
const getBreakdownNumber = (epoch: EpochOption | null, key: string) => {
  const raw = epoch?.allocation_breakdown?.[key];
  const value = Number(raw ?? 0);
  return Number.isFinite(value) ? value : 0;
};

const T4_EPOCH_MONTH = '2026-04';

export default function AllocationAuditTable() {
  const [epochs, setEpochs] = useState<EpochOption[]>([]);
  const [selectedEpoch, setSelectedEpoch] = useState<string>('');
  const [allocations, setAllocations] = useState<AllocationRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState('');
  const [filterMode, setFilterMode] = useState<FilterMode>('all');
  const [resnapshotting, setResnapshotting] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);

  const handleResnapshot = async (epochMonth: string) => {
    if (!confirm(`Chạy lại snapshot cho ${epochMonth}? Sẽ ghi đè allocations hiện tại (epoch chưa finalized).`)) return;
    setResnapshotting(true);
    const t = toast.loading(`Đang re-snapshot ${epochMonth}... (có thể mất 30-90s)`);
    try {
      const { data, error } = await supabase.functions.invoke('pplp-epoch-snapshot', {
        body: { epoch_month: epochMonth },
      });
      if (error) throw error;
      const eligibleUsers = data?.stats?.eligible_users ?? data?.stats?.eligible ?? '?';
      toast.success(`Re-snapshot xong: ${eligibleUsers} user eligible`, { id: t });
      setReloadKey(k => k + 1);
    } catch (e: any) {
      toast.error(`Re-snapshot lỗi: ${e?.message ?? e}`, { id: t });
    } finally {
      setResnapshotting(false);
    }
  };

  // Load epochs (re-runs when reloadKey bumps)
  useEffect(() => {
    (async () => {
      const { data, error } = await supabase
        .from('mint_epochs')
        .select('id, epoch_month, status, mint_pool, rules_version, allocation_breakdown')
        .in('status', ['snapshot', 'finalized', 'open'])
        .order('epoch_month', { ascending: false })
        .limit(24);
      if (error) {
        toast.error('Không tải được danh sách epoch');
        return;
      }
      const list = (data ?? []) as EpochOption[];
      setEpochs(list);
      if (list.length > 0 && !selectedEpoch) {
        const t4 = list.find(e => e.epoch_month === '2026-04');
        setSelectedEpoch(t4?.id ?? list[0].id);
      }
    })();
  }, [reloadKey]);

  // Load allocations for selected epoch
  useEffect(() => {
    if (!selectedEpoch) return;
    (async () => {
      setLoading(true);
      const { data, error } = await supabase
        .from('mint_allocations')
        .select(`
          id, user_id, light_score_total, share_percent,
          allocation_amount, allocation_amount_capped,
          instant_amount, locked_amount,
          is_eligible, status, reason_codes, mint_request_id
        `)
        .eq('epoch_id', selectedEpoch)
        .order('allocation_amount', { ascending: false })
        .limit(2000);
      if (error) {
        toast.error('Không tải được allocations: ' + error.message);
        setAllocations([]);
        setLoading(false);
        return;
      }
      const rows = (data ?? []) as AllocationRow[];
      // Fetch profiles separately
      const userIds = Array.from(new Set(rows.map(r => r.user_id)));
      if (userIds.length > 0) {
        const { data: profs } = await supabase
          .from('profiles')
          .select('id, username, display_name, avatar_url')
          .in('id', userIds);
        const profMap = new Map((profs ?? []).map(p => [p.id, p]));
        rows.forEach(r => {
          const p = profMap.get(r.user_id);
          if (p) r.profile = { username: p.username, display_name: p.display_name, avatar_url: p.avatar_url };
        });
      }
      setAllocations(rows);
      setLoading(false);
    })();
  }, [selectedEpoch, reloadKey]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return allocations.filter((row) => {
      if (q) {
        const u = row.profile?.username?.toLowerCase() ?? '';
        const d = row.profile?.display_name?.toLowerCase() ?? '';
        const id = row.user_id.toLowerCase();
        if (!u.includes(q) && !d.includes(q) && !id.includes(q)) return false;
      }
      if (filterMode === 'capped') {
        return hasCappedReason(row);
      }
      if (filterMode === 'dust') {
        return hasReason(row, c => c.includes('dust') || c.includes('below_min'));
      }
      if (filterMode === 'eligible') return row.is_eligible;
      if (filterMode === 'with_request') return !!row.mint_request_id;
      return true;
    });
  }, [allocations, search, filterMode]);

  const stats = useMemo(() => {
    const capped = allocations.filter(hasCappedReason).length;
    const dust = allocations.filter(a => hasReason(a, c => c.includes('dust') || c.includes('below_min'))).length;
    const eligible = allocations.filter(a => a.is_eligible).length;
    const totalAlloc = allocations.reduce((s, a) => s + (a.allocation_amount || 0), 0);
    const totalCapped = allocations.reduce((s, a) => s + (a.allocation_amount_capped || 0), 0);
    const totalInstant = allocations.reduce((s, a) => s + (a.instant_amount || 0), 0);
    const totalLocked = allocations.reduce((s, a) => s + (a.locked_amount || 0), 0);
    const rollover = totalAlloc - totalCapped;
    return { capped, dust, eligible, total: allocations.length, totalAlloc, totalCapped, totalInstant, totalLocked, rollover };
  }, [allocations]);

  // Thông số thực tế đọc trực tiếp từ DB cho epoch đang chọn
  const activeEpoch = useMemo(() => epochs.find(e => e.id === selectedEpoch) ?? null, [epochs, selectedEpoch]);
  const userRewardPool = useMemo(() => {
    if (!activeEpoch) return 0;
    const fromBd = getBreakdownNumber(activeEpoch, 'user_pool');
    if (fromBd > 0) return fromBd;
    return 0;
  }, [activeEpoch]);
  const capAmount = useMemo(() => {
    const fromBd = getBreakdownNumber(activeEpoch, 'cap_amount');
    if (fromBd > 0) return fromBd;
    return 0;
  }, [activeEpoch]);
  const exportCSV = () => {
    const ruleVer = activeEpoch?.rules_version ?? '';
    const header = [
      'user_id', 'username', 'display_name', 'light_score',
      'share_pct_total_pool', 'share_pct_user_pool',
      'raw_alloc', 'capped_alloc', 'cap_amount', 'was_capped',
      'instant', 'locked', 'eligible', 'status',
      'reason_codes', 'rule_version', 'mint_request_id',
    ];
    const rows = filtered.map(r => {
      const allocCapped = safeNum(r.allocation_amount_capped);
      const allocRaw = safeNum(r.allocation_amount);
      const sharePctUserPool = userRewardPool > 0
        ? (allocCapped / userRewardPool) * 100
        : 0;
      const wasCapped = (allocRaw - allocCapped) > 0.01;
      return [
        r.user_id,
        r.profile?.username ?? '',
        r.profile?.display_name ?? '',
        safeNum(r.light_score_total),
        safeNum(r.share_percent).toFixed(4),
        sharePctUserPool.toFixed(4),
        allocRaw.toFixed(2),
        allocCapped.toFixed(2),
        safeNum(capAmount).toFixed(2),
        wasCapped,
        safeNum(r.instant_amount).toFixed(2),
        safeNum(r.locked_amount).toFixed(2),
        r.is_eligible,
        r.status,
        (r.reason_codes ?? []).join('|'),
        ruleVer,
        r.mint_request_id ?? '',
      ];
    });
    const csv = [header, ...rows].map(r => r.map(v => `"${String(v).replace(/"/g, '""')}"`).join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const epochLabel = epochs.find(e => e.id === selectedEpoch)?.epoch_month ?? 'epoch';
    const a = document.createElement('a');
    a.href = url;
    a.download = `allocation-audit-${epochLabel}-${ruleVer || 'norule'}-${Date.now()}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success(`Đã xuất ${filtered.length} dòng (rule: ${ruleVer || 'N/A'})`);
  };

  const getReasonBadges = (codes: string[] | null) => {
    if (!codes || codes.length === 0) return <span className="text-xs text-muted-foreground">—</span>;
    return (
      <div className="flex flex-wrap gap-1">
        {codes.map((c, i) => {
          const normalized = c.toLowerCase();
          if (normalized.startsWith('capped')) {
            return <Badge key={i} className="bg-amber-500/10 text-amber-700 dark:text-amber-400 border-amber-500/30 text-xs">🛡️ {c}</Badge>;
          }
          if (normalized.includes('dust') || normalized.includes('below_min')) {
            return <Badge key={i} variant="outline" className="text-xs">💨 dust</Badge>;
          }
          return <Badge key={i} variant="outline" className="text-xs">{c}</Badge>;
        })}
      </div>
    );
  };

  return (
    <div className="space-y-4">
      {/* Header & Stats */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Shield className="w-5 h-5 text-primary" />
            Audit Allocation — Anti-Whale & Phân bổ chi tiết
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Epoch selector */}
          <div className="flex flex-wrap items-center gap-3">
            <div className="flex items-center gap-2">
              <Filter className="w-4 h-4 text-muted-foreground" />
              <span className="text-sm font-medium">Epoch:</span>
              <Select value={selectedEpoch} onValueChange={setSelectedEpoch}>
                <SelectTrigger className="w-[200px]">
                  <SelectValue placeholder="Chọn cycle..." />
                </SelectTrigger>
                <SelectContent>
                  {epochs.map(e => (
                    <SelectItem key={e.id} value={e.id}>
                      {e.epoch_month} · {e.status} · {fmt(e.mint_pool)} FUN
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <Button variant="outline" size="sm" onClick={exportCSV} disabled={filtered.length === 0}>
              <Download className="w-4 h-4 mr-1" /> Xuất CSV
            </Button>
          </div>

          {/* DB-only rule panel */}
          {activeEpoch && (
            <div className="rounded-lg border border-primary/30 bg-primary/5 p-3">
              <div className="flex flex-wrap items-center gap-2">
                <Badge className="bg-primary/15 text-primary border-primary/30">Thông số DB</Badge>
                <code className="text-xs font-mono bg-background/50 px-2 py-0.5 rounded border">
                  {activeEpoch.rules_version ?? 'chưa set'}
                </code>
              </div>
            </div>
          )}
          {activeEpoch?.epoch_month === T4_EPOCH_MONTH && (
            <div className="flex flex-wrap items-center justify-end gap-2">
              <Button
                size="sm"
                variant="outline"
                onClick={() => handleResnapshot(T4_EPOCH_MONTH)}
                disabled={resnapshotting || activeEpoch.status === 'finalized'}
              >
                🔄 {resnapshotting ? 'Đang chạy...' : 'Re-snapshot T4-2026'}
              </Button>
            </div>
          )}
          <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-2 text-sm">
            <StatBox label="Tổng dòng" value={stats.total} />
            <StatBox label="Đủ điều kiện" value={stats.eligible} color="text-green-600" />
            <StatBox label="Bị chạm trần" value={stats.capped} color="text-amber-600" icon={<AlertTriangle className="w-3 h-3" />} />
            <StatBox label="Bụi (quá nhỏ)" value={stats.dust} color="text-muted-foreground" />
            <StatBox label="Σ phân bổ gốc" value={`${fmt(stats.totalAlloc)} FUN`} />
            <StatBox label="Σ sau trần" value={`${fmt(stats.totalCapped)} FUN`} color="text-primary" />
            <StatBox label="Dư chuyển kỳ" value={`${fmt(stats.rollover)} FUN`} color="text-emerald-600" />
          </div>

          {/* Search + Filter */}
          <div className="flex flex-wrap gap-2">
            <div className="relative flex-1 min-w-[200px]">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input
                placeholder="Tìm theo username, display name, hoặc user ID..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-9"
              />
            </div>
            <Select value={filterMode} onValueChange={(v) => setFilterMode(v as FilterMode)}>
              <SelectTrigger className="w-[180px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Tất cả ({stats.total})</SelectItem>
                <SelectItem value="capped">🛡️ Bị cap ({stats.capped})</SelectItem>
                <SelectItem value="eligible">✅ Eligible ({stats.eligible})</SelectItem>
                <SelectItem value="dust">💨 Dust ({stats.dust})</SelectItem>
                <SelectItem value="with_request">📤 Đã có mint request</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      {/* Table */}
      <Card>
        <CardContent className="p-0 overflow-x-auto">
          {loading ? (
            <div className="p-4 space-y-2">
              {Array.from({ length: 8 }).map((_, i) => <Skeleton key={i} className="h-12 w-full" />)}
            </div>
          ) : filtered.length === 0 ? (
            <div className="p-8 text-center text-muted-foreground">
              Không có dữ liệu phù hợp
            </div>
          ) : (
            <table className="w-full text-sm">
              <thead className="bg-muted/50 sticky top-0">
                <tr className="border-b">
                  <th className="text-left p-2 font-medium">User</th>
                  <th className="text-right p-2 font-medium">Light Score</th>
                  <th className="text-right p-2 font-medium" title="% trên TỔNG mint pool">Share % (pool)</th>
                  <th className="text-right p-2 font-medium" title="% trên pool thưởng người dùng từ DB">% pool user</th>
                  <th className="text-right p-2 font-medium">Raw Alloc</th>
                  <th className="text-right p-2 font-medium">Capped Alloc</th>
                  <th className="text-right p-2 font-medium" title="Trần/người đọc từ DB">Trần DB</th>
                  <th className="text-right p-2 font-medium">Δ (cắt)</th>
                  <th className="text-left p-2 font-medium">Reason</th>
                  <th className="text-left p-2 font-medium">Status</th>
                </tr>
              </thead>
              <tbody>
                {filtered.slice(0, 500).map((row) => {
                  const allocRaw = safeNum(row.allocation_amount);
                  const allocCapped = safeNum(row.allocation_amount_capped);
                  const delta = allocRaw - allocCapped;
                  const wasCapped = delta > 0.01;
                  const sharePctUserPool = userRewardPool > 0
                    ? (allocCapped / userRewardPool) * 100
                    : 0;
                  return (
                    <tr key={row.id} className={`border-b hover:bg-muted/30 ${wasCapped ? 'bg-amber-500/5' : ''}`}>
                       <td className="p-2">
                         <div className="flex items-center gap-2">
                           <Avatar className="w-7 h-7">
                             <AvatarImage src={row.profile?.avatar_url ?? undefined} />
                             <AvatarFallback className="text-xs">
                               {(row.profile?.display_name ?? row.profile?.username ?? row.user_id).slice(0, 2).toUpperCase()}
                             </AvatarFallback>
                           </Avatar>
                           <div className="min-w-0">
                             <div className="font-medium truncate max-w-[180px]" title={row.user_id}>
                               {row.profile?.display_name ?? row.profile?.username ?? `User #${row.user_id.slice(0, 6)}`}
                             </div>
                             {row.profile?.username ? (
                               <div className="text-xs text-muted-foreground truncate max-w-[180px]">
                                 @{row.profile.username}
                               </div>
                             ) : (
                               <div className="text-xs text-muted-foreground/70 truncate max-w-[180px] font-mono">
                                 {row.user_id.slice(0, 8)}…
                               </div>
                             )}
                           </div>
                         </div>
                       </td>
                      <td className="text-right p-2 font-mono">{fmt(row.light_score_total)}</td>
                      <td className="text-right p-2 font-mono text-xs">{safeNum(row.share_percent).toFixed(3)}%</td>
                      <td
                        className={`text-right p-2 font-mono text-xs ${wasCapped ? 'text-amber-600 font-bold' : ''}`}
                        title={`${allocCapped.toFixed(2)} / ${fmt(userRewardPool)} pool thưởng người dùng`}
                      >
                        {sharePctUserPool.toFixed(3)}%
                      </td>
                      <td className="text-right p-2 font-mono">{fmt(allocRaw)}</td>
                      <td className={`text-right p-2 font-mono font-bold ${wasCapped ? 'text-amber-600' : 'text-primary'}`}>
                        {fmt(allocCapped)}
                      </td>
                      <td className="text-right p-2 font-mono text-xs text-muted-foreground" title="Trần/người đọc từ allocation_breakdown.cap_amount của DB">
                        {capAmount > 0 ? fmt(capAmount) : '—'}
                      </td>
                      <td className="text-right p-2 font-mono text-xs">
                        {wasCapped ? <span className="text-amber-600">−{fmt(delta)}</span> : '—'}
                      </td>
                      <td className="p-2">
                        <div className="space-y-1">
                          {getReasonBadges(row.reason_codes)}
                        </div>
                      </td>
                      <td className="p-2">
                        <Badge variant={row.status === 'pending' ? 'outline' : 'secondary'} className="text-xs">
                          {row.status}
                        </Badge>
                        {row.mint_request_id && (
                          <Badge variant="outline" className="ml-1 text-xs bg-blue-500/10 text-blue-600 border-blue-500/30">
                            📤 req
                          </Badge>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
          {filtered.length > 500 && (
            <div className="p-3 text-center text-xs text-muted-foreground border-t">
              Hiển thị 500/{filtered.length} dòng. Lọc thêm hoặc xuất CSV để xem tất cả.
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function StatBox({ label, value, color, icon }: { label: string; value: string | number; color?: string; icon?: React.ReactNode }) {
  return (
    <div className="p-2 rounded-lg bg-muted/50 border">
      <div className="text-xs text-muted-foreground flex items-center gap-1">{icon}{label}</div>
      <div className={`font-bold ${color ?? ''}`}>{value}</div>
    </div>
  );
}

function RuleBox({ label, value, color }: { label: string; value: string; color?: string }) {
  return (
    <div className="p-2 rounded bg-background/60 border border-border/50">
      <div className="text-[10px] text-muted-foreground uppercase tracking-wide">{label}</div>
      <div className={`font-bold font-mono text-sm ${color ?? ''}`}>{value}</div>
    </div>
  );
}

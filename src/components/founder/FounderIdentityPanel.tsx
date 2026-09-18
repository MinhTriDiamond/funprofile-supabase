import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Fingerprint, ShieldCheck, Award, Scale } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { PanelLoading, PanelError } from './PanelStates';
import { PanelToolbar } from './PanelToolbar';
import { DIDLevelDistribution } from './identity/DIDLevelDistribution';
import { TrustTierDistribution } from './identity/TrustTierDistribution';
import { SybilRiskList } from './identity/SybilRiskList';
import { SBTCategoriesList } from './identity/SBTCategoriesList';
import { downloadCSV, stamp } from '@/lib/csv';

const DID_LEVELS = ['L0', 'L1', 'L2', 'L3', 'L4'] as const;
const TIERS = ['T0', 'T1', 'T2', 'T3', 'T4'] as const;
const SYBIL_LEVELS = ['low', 'medium', 'high', 'critical'] as const;

interface IdentityStats {
  total_dids: number;
  new_dids_7d: number;
  by_level: Record<string, number>;
  by_entity: Record<string, number>;
  by_tier: Record<string, number>;
  by_sybil: Record<string, number>;
  avg_tc: number;
  total_sbts_active: number;
  sbt_by_category: Record<string, number>;
  dispute_pending: number;
  recovery_active: number;
  generated_at: string;
}

export default function FounderIdentityPanel() {
  const { data, isLoading, isError, error, refetch, isFetching } = useQuery<IdentityStats | null>({
    queryKey: ['founder-identity-stats-rpc'],
    staleTime: 60_000,
    queryFn: async () => {
      const { data, error } = await (supabase as any).rpc('get_founder_identity_stats');
      if (error) throw error;
      return data as IdentityStats;
    },
  });

  if (isLoading) return <PanelLoading span2 />;
  if (isError || !data) return <PanelError span2 message={(error as any)?.message || 'Không có dữ liệu'} />;

  const byLevel = { ...Object.fromEntries(DID_LEVELS.map((l) => [l, 0])), ...(data.by_level || {}) };
  const byTier = { ...Object.fromEntries(TIERS.map((t) => [t, 0])), ...(data.by_tier || {}) };
  const bySybil = { ...Object.fromEntries(SYBIL_LEVELS.map((s) => [s, 0])), ...(data.by_sybil || {}) };
  const sbtByCategory = data.sbt_by_category || {};
  const byEntity = data.by_entity || {};

  const handleExport = () => {
    const rows: (string | number)[][] = [
      ['Chỉ số', 'Giá trị'],
      ['Tổng DID', data.total_dids],
      ['DID mới 7 ngày', data.new_dids_7d],
      ['TC trung bình', Number(data.avg_tc).toFixed(3)],
      ['SBT đang hoạt động', data.total_sbts_active],
      ['Khiếu nại chờ', data.dispute_pending],
      ['Recovery đang chạy', data.recovery_active],
      [],
      ['DID Level', 'Số lượng'],
      ...DID_LEVELS.map((l) => [l, Number(byLevel[l] || 0)]),
      [],
      ['Trust Tier', 'Số lượng'],
      ...TIERS.map((t) => [t, Number(byTier[t] || 0)]),
      [],
      ['Sybil Risk', 'Số lượng'],
      ...SYBIL_LEVELS.map((s) => [s, Number(bySybil[s] || 0)]),
      [],
      ['SBT Category', 'Số lượng'],
      ...Object.entries(sbtByCategory).map(([k, v]) => [k, Number(v)]),
      [],
      ['Entity Type', 'Số lượng'],
      ...Object.entries(byEntity).map(([k, v]) => [k, Number(v)]),
    ];
    downloadCSV(`founder-identity-${stamp()}.csv`, rows);
  };

  return (
    <Card className="lg:col-span-2">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Fingerprint className="h-5 w-5 text-primary" /> Danh tính & Tín nhiệm
          <Badge variant="outline" className="ml-auto text-[10px] bg-emerald-500/10 text-emerald-600 border-emerald-500/30">
            Production
          </Badge>
          <PanelToolbar onRefresh={() => refetch()} onExport={handleExport} isRefreshing={isFetching} />
        </CardTitle>
        <p className="text-[11px] text-muted-foreground">
          Cập nhật {new Date(data.generated_at).toLocaleString('vi-VN')}
        </p>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <Stat icon={Fingerprint} label="Tổng DID" value={data.total_dids.toLocaleString('vi-VN')} sub={`+${data.new_dids_7d} (7d)`} color="text-primary" />
          <Stat icon={ShieldCheck} label="TC trung bình" value={Number(data.avg_tc).toFixed(2)} sub="0 → 1" color="text-emerald-500" />
          <Stat icon={Award} label="SBT đang hoạt động" value={data.total_sbts_active.toLocaleString('vi-VN')} sub={`${Object.keys(sbtByCategory).length} danh mục`} color="text-amber-500" />
          <Stat icon={Scale} label="Hàng đợi xử lý" value={`${data.dispute_pending} / ${data.recovery_active}`} sub="Khiếu nại / Recovery" color="text-orange-500" />
        </div>

        <DIDLevelDistribution byLevel={byLevel} levels={DID_LEVELS} />
        <TrustTierDistribution byTier={byTier} tiers={TIERS} />

        <div className="grid md:grid-cols-2 gap-4">
          <SybilRiskList bySybil={bySybil} levels={SYBIL_LEVELS} />
          <SBTCategoriesList sbtByCategory={sbtByCategory} />
        </div>

        <div>
          <p className="text-sm font-semibold mb-2">DID theo loại thực thể</p>
          <div className="flex flex-wrap gap-2">
            {Object.entries(byEntity).map(([type, count]) => (
              <Badge key={type} variant="secondary" className="gap-1.5">
                <span className="capitalize">{type.replace(/_/g, ' ')}</span>
                <span className="font-mono">{Number(count).toLocaleString('vi-VN')}</span>
              </Badge>
            ))}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function Stat({ icon: Icon, label, value, sub, color }: any) {
  return (
    <div className="rounded-lg border bg-background p-3 space-y-1">
      <div className="flex items-center gap-2">
        <Icon className={`h-4 w-4 ${color}`} />
        <p className="text-xs text-muted-foreground">{label}</p>
      </div>
      <p className="text-xl font-bold leading-tight">{value}</p>
      {sub && <p className="text-[10px] text-muted-foreground">{sub}</p>}
    </div>
  );
}

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Activity, Heart, Shield, TrendingDown, Lock, AlertTriangle } from 'lucide-react';
import { Skeleton } from '@/components/ui/skeleton';
import { PanelToolbar } from './PanelToolbar';
import { HealthRatiosGrid } from './monetary/HealthRatiosGrid';
import { TreasuryVaultsList } from './monetary/TreasuryVaultsList';
import { downloadCSV, stamp } from '@/lib/csv';

interface HealthMetric {
  id: string;
  measured_at: string;
  value_expansion_ratio: number;
  utility_absorption_ratio: number;
  retention_quality_ratio: number;
  fraud_pressure_ratio: number;
  locked_stability_ratio: number;
  total_supply: number;
  circulating_supply: number;
  locked_supply: number;
  safe_mode: string;
  alerts: string[];
}

interface Vault {
  vault_key: string;
  vault_name: string;
  balance: number;
}

export default function FounderMonetaryHealthPanel() {
  const { data: latestHealth, isLoading: lh, refetch: refetchH, isFetching: fH } = useQuery({
    queryKey: ['inflation-health-latest'],
    queryFn: async () => {
      const { data } = await supabase
        .from('inflation_health_metrics')
        .select('*')
        .order('measured_at', { ascending: false })
        .limit(1)
        .maybeSingle();
      return data as unknown as HealthMetric | null;
    },
    staleTime: 60_000,
  });

  const { data: vaults, isLoading: vl, refetch: refetchV, isFetching: fV } = useQuery({
    queryKey: ['treasury-vaults'],
    queryFn: async () => {
      const { data } = await supabase
        .from('treasury_vaults')
        .select('*')
        .eq('is_active', true)
        .order('vault_key');
      return (data || []) as unknown as Vault[];
    },
    staleTime: 60_000,
  });

  const isLoading = lh || vl;
  const isRefreshing = fH || fV;
  const safeModeColor = latestHealth?.safe_mode === 'normal'
    ? 'bg-emerald-500/10 text-emerald-600 border-emerald-500/30'
    : 'bg-amber-500/10 text-amber-600 border-amber-500/30';

  const handleRefresh = () => { refetchH(); refetchV(); };

  const handleExport = () => {
    const rows: (string | number)[][] = [];
    if (latestHealth) {
      rows.push(
        ['Chỉ số', 'Giá trị'],
        ['Safe mode', latestHealth.safe_mode],
        ['Tổng cung', Math.floor(Number(latestHealth.total_supply))],
        ['Lưu thông', Math.floor(Number(latestHealth.circulating_supply))],
        ['Đang khóa', Math.floor(Number(latestHealth.locked_supply))],
        ['Mở rộng giá trị', Number(latestHealth.value_expansion_ratio).toFixed(3)],
        ['Hấp thụ tiện ích', Number(latestHealth.utility_absorption_ratio).toFixed(3)],
        ['Chất lượng giữ chân', Number(latestHealth.retention_quality_ratio).toFixed(3)],
        ['Áp lực gian lận', Number(latestHealth.fraud_pressure_ratio).toFixed(3)],
        ['Ổn định khóa', Number(latestHealth.locked_stability_ratio).toFixed(3)],
        [],
      );
    }
    rows.push(['Vault', 'Số dư FUN']);
    (vaults || []).forEach((v) => rows.push([v.vault_name, Math.floor(Number(v.balance))]));
    downloadCSV(`founder-monetary-${stamp()}.csv`, rows);
  };

  const ratios = latestHealth ? [
    { icon: <TrendingDown className="w-4 h-4" />, label: 'Mở rộng giá trị', value: Number(latestHealth.value_expansion_ratio), ideal: '>= 1.0' },
    { icon: <Activity className="w-4 h-4" />, label: 'Hấp thụ tiện ích', value: Number(latestHealth.utility_absorption_ratio), ideal: '>= 0.7' },
    { icon: <Heart className="w-4 h-4" />, label: 'Chất lượng giữ chân', value: Number(latestHealth.retention_quality_ratio), ideal: '>= 0.5' },
    { icon: <Shield className="w-4 h-4" />, label: 'Áp lực gian lận', value: Number(latestHealth.fraud_pressure_ratio), ideal: '< 0.1', inverse: true },
    { icon: <Lock className="w-4 h-4" />, label: 'Ổn định khóa', value: Number(latestHealth.locked_stability_ratio), ideal: '>= 0.5' },
  ] : [];

  return (
    <Card className="lg:col-span-2">
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2">
          <Activity className="w-5 h-5 text-primary" />
          Sức khỏe Tiền tệ FUN
          <div className="ml-auto">
            <PanelToolbar onRefresh={handleRefresh} onExport={handleExport} isRefreshing={isRefreshing} disableExport={!latestHealth && (!vaults || vaults.length === 0)} />
          </div>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {isLoading && <Skeleton className="h-40 w-full" />}

        {!isLoading && !latestHealth && (
          <div className="text-sm text-muted-foreground text-center py-8">
            Chưa có dữ liệu sức khỏe tiền tệ. Cron `inflation-health-job` sẽ chạy hàng ngày.
          </div>
        )}

        {latestHealth && (
          <>
            <div className="flex items-center gap-3">
              <Badge className={safeModeColor} variant="outline">
                {latestHealth.safe_mode === 'normal' ? '✓ Bình thường' : `⚠ ${latestHealth.safe_mode}`}
              </Badge>
              <span className="text-xs text-muted-foreground">
                Cập nhật: {new Date(latestHealth.measured_at).toLocaleString('vi-VN')}
              </span>
            </div>

            {latestHealth.alerts && latestHealth.alerts.length > 0 && (
              <div className="p-3 rounded-lg border border-amber-500/30 bg-amber-500/5 space-y-1">
                {latestHealth.alerts.map((a, i) => (
                  <div key={i} className="flex items-start gap-2 text-xs text-foreground/80">
                    <AlertTriangle className="w-3 h-3 mt-0.5 flex-shrink-0" />
                    <span>{a}</span>
                  </div>
                ))}
              </div>
            )}

            <HealthRatiosGrid ratios={ratios} />

            <div className="grid grid-cols-3 gap-3 p-3 rounded-lg bg-muted/40">
              <div className="text-center">
                <div className="text-xs text-muted-foreground">Tổng cung</div>
                <div className="text-base font-semibold">
                  {Math.floor(Number(latestHealth.total_supply)).toLocaleString('vi-VN')}
                </div>
              </div>
              <div className="text-center">
                <div className="text-xs text-muted-foreground">Lưu thông</div>
                <div className="text-base font-semibold text-primary">
                  {Math.floor(Number(latestHealth.circulating_supply)).toLocaleString('vi-VN')}
                </div>
              </div>
              <div className="text-center">
                <div className="text-xs text-muted-foreground">Đang khóa</div>
                <div className="text-base font-semibold text-muted-foreground">
                  {Math.floor(Number(latestHealth.locked_supply)).toLocaleString('vi-VN')}
                </div>
              </div>
            </div>
          </>
        )}

        <TreasuryVaultsList vaults={vaults || []} />
      </CardContent>
    </Card>
  );
}

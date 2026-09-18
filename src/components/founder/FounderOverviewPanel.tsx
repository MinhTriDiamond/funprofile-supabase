import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Sun, Coins, Users, CheckCircle } from 'lucide-react';
import { PanelLoading, PanelError } from './PanelStates';
import { PanelToolbar } from './PanelToolbar';
import { downloadCSV, stamp } from '@/lib/csv';
import { loadSnapshot, saveSnapshot, pctDelta, formatDelta } from '@/lib/founderDelta';
import { useEffect, useMemo } from 'react';


interface OverviewStats {
  total_light_score_raw: number;
  total_light_score_display: number;
  total_fun_minted: number;
  total_actions_month: number;
  validation_rate: number;
  dau: number;
  wau: number;
  mau: number;
  top_categories: { code: string; count: number }[];
  generated_at: string;
}

export default function FounderOverviewPanel() {
  const { data, isLoading, isError, error, refetch, isFetching } = useQuery<OverviewStats | null>({
    queryKey: ['founder-overview-stats-rpc'],
    queryFn: async () => {
      const { data, error } = await (supabase as any).rpc('get_founder_overview_stats');
      if (error) throw error;
      return data as OverviewStats;
    },
    staleTime: 60_000,
  });

  const prev = useMemo(() => loadSnapshot<{ ls: number; fun: number; dau: number; mau: number }>('overview'), [data?.generated_at]);

  useEffect(() => {
    if (!data) return;
    saveSnapshot('overview', {
      ls: Number(data.total_light_score_display || 0),
      fun: Number(data.total_fun_minted || 0),
      dau: Number(data.dau || 0),
      mau: Number(data.mau || 0),
    });
  }, [data?.generated_at]);

  if (isLoading) return <PanelLoading />;
  if (isError) return <PanelError message={(error as any)?.message} />;
  if (!data) return <PanelError message="Không có dữ liệu trả về" />;

  const fmt = (n: number) => Number(n || 0).toLocaleString('vi-VN', { maximumFractionDigits: 0 });
  const deltaLS = prev ? formatDelta(pctDelta(Number(data.total_light_score_display), prev.data.ls)) : null;
  const deltaFun = prev ? formatDelta(pctDelta(Number(data.total_fun_minted), prev.data.fun)) : null;
  const deltaDAU = prev ? formatDelta(pctDelta(Number(data.dau), prev.data.dau)) : null;
  const deltaMAU = prev ? formatDelta(pctDelta(Number(data.mau), prev.data.mau)) : null;


  const stats = [
    {
      icon: Sun,
      label: 'Tổng Light Score (hiển thị)',
      value: fmt(data.total_light_score_display),
      sub: `raw ${fmt(data.total_light_score_raw)}`,
      color: 'text-gold',
      delta: deltaLS,
    },
    {
      icon: Coins,
      label: 'Tổng FUN đã mint (xác nhận)',
      value: fmt(data.total_fun_minted),
      sub: 'từ pplp_mint_requests',
      color: 'text-primary',
      delta: deltaFun,
    },
    {
      icon: Users,
      label: 'DAU / WAU / MAU',
      value: `${fmt(data.dau)} / ${fmt(data.wau)} / ${fmt(data.mau)}`,
      sub: 'người dùng có hành động sáng',
      color: 'text-accent',
      delta: deltaDAU,
    },
    {
      icon: CheckCircle,
      label: 'Tỷ lệ xác thực (tháng)',
      value: `${data.validation_rate}%`,
      sub: `${fmt(data.total_actions_month)} hành động`,
      color: 'text-success',
      delta: deltaMAU,
    },
  ];


  const handleExport = () => {
    const rows: (string | number)[][] = [
      ['Chỉ số', 'Giá trị'],
      ['Total Light Score (raw)', data.total_light_score_raw],
      ['Total Light Score (display)', data.total_light_score_display],
      ['Total FUN đã mint', data.total_fun_minted],
      ['Tổng hành động (tháng)', data.total_actions_month],
      ['Tỷ lệ xác thực (%)', data.validation_rate],
      ['DAU', data.dau],
      ['WAU', data.wau],
      ['MAU', data.mau],
      [],
      ['Nhóm hành động', 'Số lượng (30d)'],
      ...data.top_categories.map((c) => [c.code, Number(c.count)]),
    ];
    downloadCSV(`founder-overview-${stamp()}.csv`, rows);
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Sun className="h-5 w-5 text-gold" /> Tổng quan hệ sinh thái
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
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {stats.map((s) => (
            <div key={s.label} className="rounded-lg border bg-background p-4 text-center space-y-1">
              <s.icon className={`h-5 w-5 mx-auto ${s.color}`} />
              <p className="text-xs text-muted-foreground">{s.label}</p>
              <p className="text-lg font-bold">{s.value}</p>
              {s.sub && <p className="text-[10px] text-muted-foreground">{s.sub}</p>}
              {s.delta && (
                <p className={`text-[10px] font-medium ${s.delta.color}`} title="So với lần xem trước">
                  Δ {s.delta.text}
                </p>
              )}
            </div>
          ))}

        </div>
        <div>
          <p className="text-sm font-semibold mb-2">
            Nhóm hành động hàng đầu (30 ngày, {fmt(data.top_categories.reduce((s, c) => s + Number(c.count), 0))} hành động)
          </p>
          <div className="space-y-1">
            {data.top_categories.map((c) => (
              <div key={c.code} className="flex justify-between text-sm">
                <span className="text-muted-foreground">{c.code}</span>
                <span className="font-medium tabular-nums">{fmt(c.count)}</span>
              </div>
            ))}
            {data.top_categories.length === 0 && (
              <p className="text-xs text-muted-foreground italic">Chưa có hành động nào trong 30 ngày.</p>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

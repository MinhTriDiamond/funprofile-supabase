import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Coins } from 'lucide-react';
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts';
import { DataSourceBadge } from './DataSourceBadge';
import { PanelLoading, PanelError } from './PanelStates';
import { PanelToolbar } from './PanelToolbar';
import { DateRangePicker, type DateRangeDays } from './DateRangePicker';
import { downloadCSV, stamp } from '@/lib/csv';
import { pctDelta, formatDelta } from '@/lib/founderDelta';

export default function FounderEconomyPanel() {
  const [days, setDays] = useState<DateRangeDays>(30);
  const { data, isLoading, isError, error, refetch, isFetching } = useQuery({
    queryKey: ['founder-economy-v2'],
    queryFn: async () => {
      const { data, error } = await (supabase as any).rpc('get_founder_economy_stats');
      if (error) throw error;
      return data as any;
    },
    staleTime: 60_000,
  });

  const flowAll = (data?.daily_flow || []) as { date: string; amount: number }[];
  const flow = useMemo(() => flowAll.slice(-days), [flowAll, days]);
  const previousFlow = useMemo(() => flowAll.slice(-days * 2, -days), [flowAll, days]);
  const sumCurrent = useMemo(() => flow.reduce((s, f) => s + Number(f.amount || 0), 0), [flow]);
  const sumPrev = useMemo(() => previousFlow.reduce((s, f) => s + Number(f.amount || 0), 0), [previousFlow]);


  if (isLoading) return <PanelLoading />;
  if (isError) return <PanelError message={(error as any)?.message} />;
  if (!data) return <PanelError message="Không có dữ liệu" />;

  const total = Number(data.total_fun_minted || 0);
  const userShare = Number(data.user_share || 0);
  const platformShare = Number(data.platform_share || 0);
  const top = (data.top_actions || []) as { code: string; amount: number }[];

  const handleExport = () => {
    const rows: (string | number)[][] = [
      ['Chỉ số', 'Giá trị'],
      ['Tổng FUN đã mint', total],
      ['User share (99%)', userShare],
      ['Platform share (1%)', platformShare],
      ['Số lệnh xác nhận', Number(data.confirmed_count || 0)],
      ['Số ví minter', Number(data.unique_minters || 0)],
      [],
      ['Ngày', 'FUN'],
      ...flow.map((f) => [f.date, f.amount]),
      [],
      ['Action', 'FUN'],
      ...top.map((t) => [t.code, t.amount]),
    ];
    downloadCSV(`founder-economy-${stamp()}.csv`, rows);
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center justify-between gap-2">
          <span className="flex items-center gap-2"><Coins className="h-5 w-5 text-gold" /> Dòng chảy kinh tế</span>
          <div className="flex items-center gap-2">
            <DataSourceBadge status="production" note="pplp_mint_requests" />
            <PanelToolbar onRefresh={() => refetch()} onExport={handleExport} isRefreshing={isFetching} />
          </div>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="grid grid-cols-3 gap-3 text-center text-sm">
          <div className="rounded-lg border p-3">
            <p className="text-xs text-muted-foreground">Tổng FUN đã mint</p>
            <p className="font-bold text-lg">{total.toLocaleString('vi-VN')}</p>
            <p className="text-[10px] text-muted-foreground">{data.confirmed_count} lệnh · {data.unique_minters} ví</p>
          </div>
          <div className="rounded-lg border p-3">
            <p className="text-xs text-muted-foreground">Người dùng (99%)</p>
            <p className="font-bold text-primary">{userShare.toLocaleString('vi-VN')}</p>
          </div>
          <div className="rounded-lg border p-3">
            <p className="text-xs text-muted-foreground">Nền tảng (1%)</p>
            <p className="font-bold text-gold">{platformShare.toLocaleString('vi-VN')}</p>
          </div>
        </div>

        {flow.length > 0 && (
          <div>
            <div className="flex items-center justify-between mb-2 gap-2 flex-wrap">
              <p className="text-sm font-semibold">
                Dòng mint ({days} ngày): <span className="tabular-nums">{Math.round(sumCurrent).toLocaleString('vi-VN')}</span> FUN
                {previousFlow.length > 0 && (() => {
                  const d = formatDelta(pctDelta(sumCurrent, sumPrev));
                  return <span className={`ml-2 text-xs font-medium ${d.color}`} title={`Kỳ trước: ${Math.round(sumPrev).toLocaleString('vi-VN')} FUN`}>Δ {d.text}</span>;
                })()}
              </p>
              <DateRangePicker value={days} onChange={setDays} />
            </div>
            <ResponsiveContainer width="100%" height={160}>
              <LineChart data={flow}>
                <XAxis dataKey="date" tick={{ fontSize: 10 }} />
                <YAxis tick={{ fontSize: 10 }} />
                <Tooltip />
                <Line type="monotone" dataKey="amount" stroke="hsl(var(--primary))" strokeWidth={2} dot={false} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        )}


        <div>
          <p className="text-sm font-semibold mb-2">Hành động sinh nhiều FUN nhất</p>
          <div className="space-y-1">
            {top.map(t => (
              <div key={t.code} className="flex justify-between text-sm">
                <span className="text-muted-foreground">{t.code}</span>
                <span className="font-medium">{Number(t.amount).toLocaleString('vi-VN')} FUN</span>
              </div>
            ))}
            {top.length === 0 && <p className="text-xs text-muted-foreground">Chưa có dữ liệu</p>}
          </div>
        </div>

        <p className="text-[10px] text-muted-foreground text-right">
          Cập nhật: {new Date(data.generated_at).toLocaleString('vi-VN')}
        </p>
      </CardContent>
    </Card>
  );
}


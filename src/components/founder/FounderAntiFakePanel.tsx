import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { ShieldAlert } from 'lucide-react';
import { DataSourceBadge } from './DataSourceBadge';
import { PanelLoading, PanelError } from './PanelStates';
import { PanelToolbar } from './PanelToolbar';
import { downloadCSV, stamp } from '@/lib/csv';

export default function FounderAntiFakePanel() {
  const { data, isLoading, isError, error, refetch, isFetching } = useQuery({
    queryKey: ['founder-antifake'],
    queryFn: async () => {
      const [logs, pendingReview, rejectedActions] = await Promise.all([
        supabase.from('pplp_v2_event_log').select('event_type, created_at', { count: 'exact' }).in('event_type', ['duplicate_detected', 'velocity_limit', 'spam_detected', 'trust_decay']),
        supabase.from('pplp_v2_user_actions').select('id', { count: 'exact' }).eq('status', 'pending_review'),
        supabase.from('pplp_v2_validations').select('id', { count: 'exact' }).eq('validation_status', 'rejected'),
      ]);

      const logRows = logs.data || [];
      const typeCounts: Record<string, number> = {};
      logRows.forEach(l => { typeCounts[l.event_type] = (typeCounts[l.event_type] || 0) + 1; });

      return {
        totalFlags: logs.count || 0,
        duplicates: typeCounts['duplicate_detected'] || 0,
        velocityAbuse: typeCounts['velocity_limit'] || 0,
        spam: typeCounts['spam_detected'] || 0,
        trustDecay: typeCounts['trust_decay'] || 0,
        pendingReview: pendingReview.count || 0,
        rejected: rejectedActions.count || 0,
      };
    },
    staleTime: 60_000,
  });

  if (isLoading) return <PanelLoading />;
  if (isError) return <PanelError message={(error as any)?.message} />;
  if (!data) return <PanelError message="Không có dữ liệu" />;

  const d = data;
  const alerts = [
    { label: 'Trùng lặp', count: d.duplicates, color: 'text-destructive' },
    { label: 'Vượt tốc độ', count: d.velocityAbuse, color: 'text-destructive' },
    { label: 'Spam', count: d.spam, color: 'text-gold' },
    { label: 'Suy giảm tín nhiệm', count: d.trustDecay, color: 'text-muted-foreground' },
  ];

  const handleExport = () => {
    const rows: (string | number)[][] = [
      ['Chỉ số', 'Giá trị'],
      ['Chờ duyệt', d.pendingReview],
      ['Bị từ chối', d.rejected],
      ['Tổng cờ', d.totalFlags],
      [],
      ['Loại cảnh báo', 'Số lượng'],
      ...alerts.map((a) => [a.label, a.count]),
    ];
    downloadCSV(`founder-antifake-${stamp()}.csv`, rows);
  };

  return (
    <Card>
      <CardHeader><CardTitle className="flex items-center justify-between gap-2">
        <span className="flex items-center gap-2"><ShieldAlert className="h-5 w-5 text-destructive" /> Giám sát chống gian lận</span>
        <div className="flex items-center gap-2">
          <DataSourceBadge status="pilot" note="pplp_v2_event_log + user_actions" />
          <PanelToolbar onRefresh={() => refetch()} onExport={handleExport} isRefreshing={isFetching} />
        </div>
      </CardTitle></CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-2 gap-3">
          <div className="rounded-lg border border-destructive/20 bg-destructive/5 p-3 text-center">
            <p className="text-2xl font-bold text-destructive">{d.pendingReview}</p>
            <p className="text-xs text-muted-foreground">Chờ duyệt</p>
          </div>
          <div className="rounded-lg border p-3 text-center">
            <p className="text-2xl font-bold">{d.rejected}</p>
            <p className="text-xs text-muted-foreground">Bị từ chối</p>
          </div>
        </div>
        <div className="space-y-2">
          {alerts.map(a => (
            <div key={a.label} className="flex justify-between items-center text-sm">
              <span className="text-muted-foreground">{a.label}</span>
              <span className={`font-bold ${a.color}`}>{a.count}</span>
            </div>
          ))}
        </div>
        <p className="text-xs text-muted-foreground text-center">Tổng cờ: {d.totalFlags}</p>
      </CardContent>
    </Card>
  );
}


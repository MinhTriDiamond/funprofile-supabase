import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Calendar } from 'lucide-react';
import { DataSourceBadge } from './DataSourceBadge';
import { PanelLoading, PanelError } from './PanelStates';
import { PanelToolbar } from './PanelToolbar';
import { downloadCSV, stamp } from '@/lib/csv';

export default function FounderEventPanel() {
  const { data, isLoading, isError, error, refetch, isFetching } = useQuery({
    queryKey: ['founder-events'],
    queryFn: async () => {
      const [events, attendance, groups] = await Promise.all([
        supabase.from('pplp_v2_events').select('id, title, status, start_at', { count: 'exact' }),
        supabase.from('pplp_v2_attendance').select('id, confirmation_status, check_in_at, check_out_at, attendance_confidence', { count: 'exact' }),
        supabase.from('pplp_v2_groups').select('id, name, expected_count', { count: 'exact' }),
      ]);

      const activeEvents = (events.data || []).filter(e => e.status === 'active' || e.status === 'scheduled').length;
      const completedEvents = (events.data || []).filter(e => e.status === 'completed').length;

      const attendanceRows = (attendance.data || []) as any[];
      const checkedIn = attendanceRows.filter(a => a.check_in_at).length;
      const checkedOut = attendanceRows.filter(a => a.check_out_at).length;
      const attendanceRate = checkedIn ? Math.round((checkedOut / checkedIn) * 100) : 0;

      const avgConfidence = attendanceRows.length
        ? Math.round(attendanceRows.reduce((s, a) => s + (a.attendance_confidence || 0), 0) / attendanceRows.length * 100)
        : 0;

      return {
        totalEvents: events.count || 0,
        activeEvents,
        completedEvents,
        totalGroups: groups.count || 0,
        totalAttendance: attendance.count || 0,
        attendanceRate,
        avgConfidence,
      };
    },
    staleTime: 60_000,
  });

  if (isLoading) return <PanelLoading />;
  if (isError) return <PanelError message={(error as any)?.message} />;
  if (!data) return <PanelError message="Không có dữ liệu" />;

  const d = data;
  const items = [
    { label: 'Tổng sự kiện', value: d.totalEvents },
    { label: 'Đang hoạt động', value: d.activeEvents },
    { label: 'Hoàn thành', value: d.completedEvents },
    { label: 'Tổng nhóm', value: d.totalGroups },
    { label: 'Lượt tham dự', value: d.totalAttendance },
    { label: 'Tỷ lệ check-out', value: `${d.attendanceRate}%` },
  ];

  const handleExport = () => {
    const rows: (string | number)[][] = [
      ['Chỉ số', 'Giá trị'],
      ...items.map((i) => [i.label, i.value]),
      ['Avg attendance confidence (%)', d.avgConfidence],
    ];
    downloadCSV(`founder-events-${stamp()}.csv`, rows);
  };

  return (
    <Card>
      <CardHeader><CardTitle className="flex items-center justify-between gap-2">
        <span className="flex items-center gap-2"><Calendar className="h-5 w-5 text-accent" /> Sự kiện & Nhà Love</span>
        <div className="flex items-center gap-2">
          <DataSourceBadge status="pilot" note="pplp_v2_events / attendance" />
          <PanelToolbar onRefresh={() => refetch()} onExport={handleExport} isRefreshing={isFetching} />
        </div>
      </CardTitle></CardHeader>
      <CardContent>
        <div className="grid grid-cols-3 gap-3">
          {items.map(item => (
            <div key={item.label} className="rounded-lg border p-3 text-center">
              <p className="text-lg font-bold">{item.value}</p>
              <p className="text-xs text-muted-foreground">{item.label}</p>
            </div>
          ))}
        </div>
        {d.avgConfidence > 0 && (
          <div className="mt-4 rounded-lg bg-primary/5 p-3 text-center">
            <p className="text-xs text-muted-foreground">Độ tin cậy tham dự trung bình</p>
            <p className="text-lg font-bold text-primary">{d.avgConfidence}%</p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}


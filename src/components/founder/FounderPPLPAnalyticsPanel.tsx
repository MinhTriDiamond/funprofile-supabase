import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Target } from 'lucide-react';
import { DataSourceBadge } from './DataSourceBadge';
import { PanelLoading, PanelError } from './PanelStates';
import { PanelToolbar } from './PanelToolbar';
import { downloadCSV, stamp } from '@/lib/csv';
import { PillarStrengthCards } from './pplp/PillarStrengthCards';
import { PillarAvgChart } from './pplp/PillarAvgChart';
import { LightScoreBucketsHistogram } from './pplp/LightScoreBucketsHistogram';

const VALIDATIONS_LIMIT = 1000;

export default function FounderPPLPAnalyticsPanel() {
  const { data, isLoading, isError, error, refetch, isFetching } = useQuery({
    queryKey: ['founder-pplp-analytics'],
    queryFn: async () => {
      const { data: vals, error } = await supabase
        .from('pplp_v2_validations')
        .select('serving_life, transparent_truth, healing_love, long_term_value, unity_over_separation, final_light_score, validation_status')
        .order('created_at', { ascending: false })
        .limit(VALIDATIONS_LIMIT);
      if (error) throw error;
      const rows = (vals || []) as any[];

      const pillarTotals = { serving_life: 0, transparent_truth: 0, healing_love: 0, long_term_value: 0, unity_over_separation: 0 };
      let count = rows.length;
      rows.forEach((r: any) => {
        pillarTotals.serving_life += r.serving_life || 0;
        pillarTotals.transparent_truth += r.transparent_truth || 0;
        pillarTotals.healing_love += r.healing_love || 0;
        pillarTotals.long_term_value += r.long_term_value || 0;
        pillarTotals.unity_over_separation += r.unity_over_separation || 0;
      });

      const pillarLabels: Record<string, string> = {
        serving_life: 'Phụng sự',
        transparent_truth: 'Chân thật',
        healing_love: 'Chữa lành',
        long_term_value: 'Giá trị',
        unity_over_separation: 'Hợp nhất',
      };

      const pillarData = Object.entries(pillarTotals).map(([k, total]) => ({
        name: pillarLabels[k] || k,
        avg: count ? Math.round(total / count) : 0,
      }));

      const strongest = pillarData.reduce((a, b) => a.avg > b.avg ? a : b, pillarData[0]);
      const weakest = pillarData.reduce((a, b) => a.avg < b.avg ? a : b, pillarData[0]);

      const buckets = [0, 0, 0, 0, 0];
      rows.forEach(r => {
        const s = r.final_light_score || 0;
        const idx = Math.min(4, Math.floor(s / 20));
        buckets[idx]++;
      });

      const rejected = rows.filter(r => r.validation_status === 'rejected').length;

      return { pillarData, strongest, weakest, buckets, total: rows.length, rejected };
    },
    staleTime: 60_000,
  });

  if (isLoading) return <PanelLoading />;
  if (isError) return <PanelError message={(error as any)?.message} />;
  if (!data) return <PanelError message="Không có dữ liệu" />;

  const d = data;

  const handleExport = () => {
    const rows: (string | number)[][] = [
      ['Trụ cột', 'Điểm trung bình'],
      ...d.pillarData.map((p) => [p.name, p.avg]),
      [],
      ['Khoảng điểm', 'Số lượng'],
      ['0-20', d.buckets[0]], ['20-40', d.buckets[1]], ['40-60', d.buckets[2]], ['60-80', d.buckets[3]], ['80-100', d.buckets[4]],
      [],
      ['Tổng', d.total],
      ['Bị từ chối', d.rejected],
    ];
    downloadCSV(`founder-pplp-${stamp()}.csv`, rows);
  };

  return (
    <Card>
      <CardHeader><CardTitle className="flex items-center justify-between gap-2">
        <span className="flex items-center gap-2"><Target className="h-5 w-5 text-accent" /> Phân tích PPLP</span>
        <div className="flex items-center gap-2">
          <DataSourceBadge status="pilot" note={`pplp_v2_validations (${d.total} dòng gần nhất)`} />
          <PanelToolbar onRefresh={() => refetch()} onExport={handleExport} isRefreshing={isFetching} />
        </div>
      </CardTitle></CardHeader>
      <CardContent className="space-y-6">
        <PillarStrengthCards strongest={d.strongest} weakest={d.weakest} rejected={d.rejected} total={d.total} />
        <PillarAvgChart data={d.pillarData} />
        <LightScoreBucketsHistogram buckets={d.buckets} />
      </CardContent>
    </Card>
  );
}


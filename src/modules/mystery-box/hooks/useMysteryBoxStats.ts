import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

export interface StatRow {
  stat_date: string;
  box_def_id: string;
  reward_code: string;
  opens_count: number;
  expected_pct: number;
  actual_pct: number;
  delta_pct: number;
}

/** Admin-only — đọc bảng stats daily 30 ngày gần nhất. */
export function useMysteryBoxStatsDaily(days = 30) {
  return useQuery({
    queryKey: ['mystery-box-stats-daily', days],
    queryFn: async (): Promise<StatRow[]> => {
      const since = new Date(Date.now() - days * 86400_000).toISOString().slice(0, 10);
      const { data, error } = await (supabase as unknown as { from: (t: string) => { select: (s: string) => { gte: (k: string, v: string) => { order: (c: string, o: { ascending: boolean }) => Promise<{ data: unknown; error: unknown }> } } } })
        .from('mystery_box_stats_daily')
        .select('stat_date, box_def_id, reward_code, opens_count, expected_pct, actual_pct, delta_pct')
        .gte('stat_date', since)
        .order('stat_date', { ascending: true });
      if (error) throw error;
      return (data ?? []) as StatRow[];
    },
    staleTime: 60_000,
  });
}

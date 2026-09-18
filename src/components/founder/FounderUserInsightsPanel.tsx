import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { TrendingUp, AlertTriangle } from 'lucide-react';
import { DataSourceBadge } from './DataSourceBadge';
import { PanelLoading, PanelError } from './PanelStates';
import { PanelToolbar } from './PanelToolbar';
import { downloadCSV, stamp } from '@/lib/csv';
import { TIER_LABEL_VI, TIER_COLOR, reputationTierToKey } from '@/lib/founderTrustTier';


export default function FounderUserInsightsPanel() {
  const { data, isLoading, isError, error, refetch, isFetching } = useQuery({
    queryKey: ['founder-user-insights'],
    queryFn: async () => {
      const [rep, flagged] = await Promise.all([
        supabase.from('light_reputation').select('user_id, total_light_score, consistency_streak, tier').order('total_light_score', { ascending: false }).limit(20),
        supabase.from('pplp_v2_user_actions').select('user_id', { count: 'exact' }).eq('status', 'flagged'),
      ]);
      if (rep.error) throw rep.error;

      const topUsers = rep.data || [];
      const tierDist: Record<number, number> = { 0: 0, 1: 0, 2: 0, 3: 0 };
      topUsers.forEach(u => { tierDist[u.tier] = (tierDist[u.tier] || 0) + 1; });

      const top10Ids = topUsers.slice(0, 10).map(u => u.user_id);
      const { data: profiles } = await supabase.from('profiles').select('id, display_name').in('id', top10Ids);
      const nameMap: Record<string, string> = {};
      (profiles || []).forEach(p => { nameMap[p.id] = p.display_name || p.id.slice(0, 8); });

      return {
        topUsers: topUsers.slice(0, 10).map(u => ({ ...u, name: nameMap[u.user_id] || u.user_id.slice(0, 8) })),
        flaggedCount: flagged.count || 0,
        tierDist,
      };
    },
    staleTime: 60_000,
  });

  if (isLoading) return <PanelLoading />;
  if (isError) return <PanelError message={(error as any)?.message} />;
  if (!data) return <PanelError message="Không có dữ liệu" />;

  const d = data;
  // Map tier 0..3 (light_reputation) → T1..T4 thống nhất với Identity Panel
  const tierEntries = [0, 1, 2, 3].map((i) => {
    const key = reputationTierToKey(i);
    return { i, key, label: TIER_LABEL_VI[key], count: d.tierDist[i] || 0 };
  });

  const handleExport = () => {
    const rows: (string | number)[][] = [
      ['Hạng', 'Tên', 'Light Score', 'Streak (ngày)', 'Tier'],
      ...d.topUsers.map((u, i) => [i + 1, u.name, u.total_light_score, u.consistency_streak || 0, reputationTierToKey(u.tier)]),
      [],
      ['Tier', 'Nhãn', 'Số lượng'],
      ...tierEntries.map((t) => [t.key, t.label, t.count]),
      [],
      ['Người dùng bị gắn cờ', d.flaggedCount],
    ];
    downloadCSV(`founder-users-${stamp()}.csv`, rows);
  };

  return (
    <Card>
      <CardHeader><CardTitle className="flex items-center justify-between gap-2">
        <span className="flex items-center gap-2"><TrendingUp className="h-5 w-5 text-primary" /> Thấu hiểu người dùng</span>
        <div className="flex items-center gap-2">
          <DataSourceBadge status="production" note="light_reputation" />
          <PanelToolbar onRefresh={() => refetch()} onExport={handleExport} isRefreshing={isFetching} />
        </div>
      </CardTitle></CardHeader>
      <CardContent className="space-y-6">
        {d.flaggedCount > 0 && (
          <div className="flex items-center gap-2 rounded-lg bg-destructive/10 p-3 text-sm text-destructive">
            <AlertTriangle className="h-4 w-4" /> {d.flaggedCount} người dùng bị gắn cờ
          </div>
        )}
        <div>
          <p className="text-sm font-semibold mb-2">Top 10 Light Score</p>
          <div className="space-y-2">
            {d.topUsers.map((u, i) => (
              <Link
                key={u.user_id}
                to={`/profile/${u.user_id}`}
                className="flex items-center justify-between text-sm rounded px-1 py-0.5 hover:bg-muted transition-colors"
                title="Mở hồ sơ chi tiết"
              >
                <div className="flex items-center gap-2">
                  <span className="text-muted-foreground w-5 text-right">{i + 1}.</span>
                  <span className="font-medium truncate max-w-[120px] hover:underline">{u.name}</span>
                  <span className="text-xs text-muted-foreground">🔥{u.consistency_streak || 0}d</span>
                </div>
                <span className="font-bold text-primary">{u.total_light_score.toLocaleString('vi-VN')}</span>
              </Link>
            ))}
          </div>
        </div>
        <div>
          <p className="text-sm font-semibold mb-2">Phân bố Trust Tier</p>
          <div className="grid grid-cols-4 gap-2">
            {tierEntries.map((t) => (
              <div key={t.key} className={`text-center rounded-lg border p-2 ${TIER_COLOR[t.key]?.split(' ')[0] || ''}`}>
                <p className="text-lg font-bold">{t.count}</p>
                <p className="text-xs opacity-80">{t.key} · {t.label}</p>
              </div>
            ))}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}


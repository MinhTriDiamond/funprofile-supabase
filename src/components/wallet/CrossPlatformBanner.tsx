import { useEffect, useState } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Globe2, Zap, CalendarDays } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';

interface MonthlyStats {
  month: string; // "2025-02", "2025-03", etc.
  label: string;
  angel_ai: number;
  fun_profile: number;
  total_light_score: number;
}

export function CrossPlatformBanner() {
  const [monthlyStats, setMonthlyStats] = useState<MonthlyStats[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchStats = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { setLoading(false); return; }

      // Dynamic: generate months from Feb 2026 to current month
      const now = new Date();
      const currentYear = now.getFullYear();
      const currentMonth = now.getMonth() + 1; // 1-indexed
      const startYear = 2026;
      const startMonth = 2;

      const months: { key: string; label: string; start: string; end: string }[] = [];
      for (let y = startYear; y <= currentYear; y++) {
        const mStart = y === startYear ? startMonth : 1;
        const mEnd = y === currentYear ? currentMonth : 12;
        for (let m = mStart; m <= mEnd; m++) {
          const key = `${y}-${String(m).padStart(2, '0')}`;
          const nextM = m === 12 ? 1 : m + 1;
          const nextY = m === 12 ? y + 1 : y;
          months.push({
            key,
            label: `Tháng ${m}`,
            start: `${key}-01`,
            end: `${nextY}-${String(nextM).padStart(2, '0')}-01`,
          });
        }
      }

      const results: MonthlyStats[] = [];

      for (const m of months) {
        const [angelRes, profileRes, scoreRes] = await Promise.all([
          supabase
            .from('light_actions')
            .select('id', { count: 'exact', head: true })
            .eq('user_id', user.id)
            .eq('reference_type', 'angel_ai')
            .gte('created_at', m.start)
            .lt('created_at', m.end),
          supabase
            .from('light_actions')
            .select('id', { count: 'exact', head: true })
            .eq('user_id', user.id)
            .neq('reference_type', 'angel_ai')
            .gte('created_at', m.start)
            .lt('created_at', m.end),
          supabase
            .from('light_actions')
            .select('light_score')
            .eq('user_id', user.id)
            .eq('is_eligible', true)
            .gte('created_at', m.start)
            .lt('created_at', m.end),
        ]);

        const totalLS = (scoreRes.data ?? []).reduce((sum, a) => sum + (a.light_score || 0), 0);

        results.push({
          month: m.key,
          label: m.label,
          angel_ai: angelRes.count ?? 0,
          fun_profile: profileRes.count ?? 0,
          total_light_score: Math.round(totalLS * 100) / 100,
        });
      }

      setMonthlyStats(results);
      setLoading(false);
    };

    fetchStats();
  }, []);

  const totalAngel = monthlyStats.reduce((s, m) => s + m.angel_ai, 0);
  const totalProfile = monthlyStats.reduce((s, m) => s + m.fun_profile, 0);
  const totalLS = monthlyStats.reduce((s, m) => s + m.total_light_score, 0);

  return (
    <Card className="border-primary/20 bg-gradient-to-r from-primary/5 via-background to-amber-500/5 shadow-sm">
      <CardContent className="py-3 px-4 space-y-3">
        {/* Header */}
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-lg bg-primary/10 flex items-center justify-center">
              <Globe2 className="w-5 h-5 text-primary" />
            </div>
            <div>
              <p className="text-sm font-semibold text-foreground">Hệ sinh thái hợp nhất</p>
              <p className="text-xs text-muted-foreground">
                Light Score & FUN Money được ghi nhận chung giữa tất cả nền tảng FUN
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Badge variant="outline" className="bg-violet-50 text-violet-700 border-violet-200 dark:bg-violet-950/30 dark:text-violet-400 dark:border-violet-800 gap-1 text-xs">
              <Zap className="w-3 h-3" /> Angel AI: {totalAngel}
            </Badge>
            <Badge variant="outline" className="bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/30 dark:text-emerald-400 dark:border-emerald-800 gap-1 text-xs">
              <Zap className="w-3 h-3" /> FUN Profile: {totalProfile}
            </Badge>
            <Badge variant="outline" className="bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-950/30 dark:text-amber-400 dark:border-amber-800 gap-1 text-xs">
              ⚡ LS: {Math.round(totalLS).toLocaleString()}
            </Badge>
          </div>
        </div>

        {/* Monthly breakdown */}
        {!loading && monthlyStats.length > 0 && (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
            {monthlyStats.map((m) => (
              <div key={m.month} className="rounded-lg border border-border/50 bg-muted/30 p-2.5 space-y-1">
                <div className="flex items-center gap-1.5">
                  <CalendarDays className="w-3.5 h-3.5 text-muted-foreground" />
                  <span className="text-xs font-semibold text-foreground">{m.label}/{m.month.split('-')[0]}</span>
                </div>
                <div className="flex flex-wrap gap-1">
                  <span className="text-[11px] text-violet-600 dark:text-violet-400">AI: {m.angel_ai}</span>
                  <span className="text-[11px] text-muted-foreground">·</span>
                  <span className="text-[11px] text-emerald-600 dark:text-emerald-400">Profile: {m.fun_profile}</span>
                </div>
                <p className="text-xs font-bold text-amber-600 dark:text-amber-400">
                  LS: {m.total_light_score.toLocaleString()}
                </p>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

import { useEffect, useMemo, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Loader2, TrendingUp, Clock, Layers } from 'lucide-react';
import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ReferenceLine,
  Legend,
} from 'recharts';

interface SummaryRow {
  action_name: string;
  backlog_count: number;
  backlog_fun: string;
  minted_today_fun: string;
  remaining_today_fun: string;
  eta_days: number;
}

interface HistoryResp {
  success: true;
  window_days: number;
  soft_cap_per_action_fun: string;
  actions: string[];
  days: Array<Record<string, string | number>>;
  summary: SummaryRow[];
}

const fmtFun = (n: number | string) => Number(n).toLocaleString('vi-VN');

// Distinct color palette using HSL semantic-ish tokens
const COLORS = [
  'hsl(45 95% 55%)',   // amber
  'hsl(160 70% 45%)',  // emerald
  'hsl(210 90% 60%)',  // blue
  'hsl(280 70% 60%)',  // violet
  'hsl(340 80% 60%)',  // pink
  'hsl(20 85% 55%)',   // orange
  'hsl(190 70% 50%)',  // cyan
  'hsl(120 50% 50%)',  // green
];

export function BacklogTrendChart() {
  const [data, setData] = useState<HistoryResp | null>(null);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<string>('__all');

  useEffect(() => {
    let cancelled = false;
    const fetchData = async () => {
      try {
        const { data: res } = await supabase.functions.invoke('pplp-backlog-history', { method: 'GET' });
        if (!cancelled && (res as HistoryResp)?.success) setData(res as HistoryResp);
      } catch (e) {
        console.error('[BacklogTrendChart]', e);
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    fetchData();
    const t = setInterval(fetchData, 120_000);
    return () => { cancelled = true; clearInterval(t); };
  }, []);

  const softCap = data ? Number(data.soft_cap_per_action_fun) : 950_000;

  const chartData = useMemo(() => {
    if (!data) return [];
    if (filter === '__all') {
      return data.days.map((d) => ({ date: (d.date as string).slice(5), Tổng: d.__total as number }));
    }
    return data.days.map((d) => ({ date: (d.date as string).slice(5), [filter]: (d[filter] as number) || 0 }));
  }, [data, filter]);

  const lines = useMemo(() => {
    if (!data) return [] as { key: string; color: string }[];
    if (filter === '__all') return [{ key: 'Tổng', color: COLORS[0] }];
    const idx = data.actions.indexOf(filter);
    return [{ key: filter, color: COLORS[idx % COLORS.length] || COLORS[0] }];
  }, [data, filter]);

  const totals = useMemo(() => {
    if (!data) return null;
    const totalBacklog = data.summary.reduce((s, r) => s + Number(r.backlog_fun), 0);
    const totalCount = data.summary.reduce((s, r) => s + r.backlog_count, 0);
    const maxEta = data.summary.reduce((m, r) => Math.max(m, r.eta_days), 0);
    const mintedToday = data.summary.reduce((s, r) => s + Number(r.minted_today_fun), 0);
    return { totalBacklog, totalCount, maxEta, mintedToday };
  }, [data]);

  if (loading) {
    return (
      <Card>
        <CardContent className="p-6 flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="w-4 h-4 animate-spin" /> Đang tải biểu đồ backlog...
        </CardContent>
      </Card>
    );
  }
  if (!data) return null;

  const filteredSummary = filter === '__all' ? data.summary : data.summary.filter(r => r.action_name === filter);

  return (
    <Card className="border-primary/20">
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <div className="flex items-center gap-2">
            <TrendingUp className="w-5 h-5 text-primary" />
            <CardTitle className="text-base">
              Xu hướng xả lệnh mint ({data.window_days} ngày)
            </CardTitle>
          </div>
          <Select value={filter} onValueChange={setFilter}>
            <SelectTrigger className="w-[200px] h-8 text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="__all">Tất cả action (tổng)</SelectItem>
              {data.actions.map((a) => (
                <SelectItem key={a} value={a}>{a}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Snapshot KPIs */}
        {totals && (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
            <div className="rounded-md border border-border/60 bg-muted/30 px-3 py-2">
              <div className="text-xs text-muted-foreground flex items-center gap-1">
                <Layers className="w-3 h-3" /> Backlog
              </div>
              <div className="text-sm font-semibold">{fmtFun(totals.totalBacklog)} FUN</div>
              <div className="text-xs text-muted-foreground">{totals.totalCount} lệnh</div>
            </div>
            <div className="rounded-md border border-border/60 bg-muted/30 px-3 py-2">
              <div className="text-xs text-muted-foreground">Mint hôm nay</div>
              <div className="text-sm font-semibold">{fmtFun(totals.mintedToday)} FUN</div>
              <div className="text-xs text-muted-foreground">UTC day</div>
            </div>
            <div className="rounded-md border border-border/60 bg-muted/30 px-3 py-2">
              <div className="text-xs text-muted-foreground flex items-center gap-1">
                <Clock className="w-3 h-3" /> ETA tối đa
              </div>
              <div className="text-sm font-semibold">{totals.maxEta} ngày</div>
            </div>
            <div className="rounded-md border border-border/60 bg-muted/30 px-3 py-2">
              <div className="text-xs text-muted-foreground">Soft cap/action</div>
              <div className="text-sm font-semibold">{fmtFun(softCap)} FUN</div>
              <div className="text-xs text-muted-foreground">UTC day</div>
            </div>
          </div>
        )}

        {/* Line chart */}
        <div className="w-full h-[260px]">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={chartData} margin={{ top: 8, right: 12, left: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
              <XAxis dataKey="date" tick={{ fontSize: 11 }} stroke="hsl(var(--muted-foreground))" />
              <YAxis
                tick={{ fontSize: 11 }}
                stroke="hsl(var(--muted-foreground))"
                tickFormatter={(v) => v >= 1_000_000 ? `${(v / 1_000_000).toFixed(1)}M` : v >= 1000 ? `${(v / 1000).toFixed(0)}K` : `${v}`}
              />
              <Tooltip
                contentStyle={{
                  background: 'hsl(var(--background))',
                  border: '1px solid hsl(var(--border))',
                  borderRadius: 8,
                  fontSize: 12,
                }}
                formatter={(v: number) => [`${fmtFun(v)} FUN`, '']}
              />
              <Legend wrapperStyle={{ fontSize: 11 }} />
              {filter !== '__all' && (
                <ReferenceLine
                  y={softCap}
                  stroke="hsl(45 95% 55%)"
                  strokeDasharray="4 4"
                  label={{ value: `Soft cap ${fmtFun(softCap)}`, fontSize: 10, fill: 'hsl(45 95% 55%)', position: 'insideTopRight' }}
                />
              )}
              {lines.map((l) => (
                <Line
                  key={l.key}
                  type="monotone"
                  dataKey={l.key}
                  stroke={l.color}
                  strokeWidth={2}
                  dot={{ r: 2 }}
                  activeDot={{ r: 4 }}
                />
              ))}
            </LineChart>
          </ResponsiveContainer>
        </div>

        {/* Per-action breakdown table */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
          {filteredSummary.map((r, i) => {
            const color = COLORS[(data.actions.indexOf(r.action_name)) % COLORS.length] || COLORS[0];
            return (
              <div key={r.action_name} className="rounded-md border border-border/60 bg-muted/30 px-3 py-2">
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2 min-w-0">
                    <span className="w-2 h-2 rounded-full shrink-0" style={{ background: color }} />
                    <span className="text-xs font-medium truncate">{r.action_name}</span>
                  </div>
                  <Badge variant="outline" className="text-[10px] px-1.5 py-0">
                    ETA {r.eta_days}d
                  </Badge>
                </div>
                <div className="mt-1 text-sm font-semibold">{fmtFun(r.backlog_fun)} FUN</div>
                <div className="text-xs text-muted-foreground">
                  {r.backlog_count} lệnh · hôm nay {fmtFun(r.minted_today_fun)} / còn {fmtFun(r.remaining_today_fun)}
                </div>
              </div>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}

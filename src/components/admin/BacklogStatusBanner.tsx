import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { AlertTriangle, Clock } from 'lucide-react';

interface BacklogRow {
  action_name: string;
  backlog_count: number;
  backlog_fun: string;
  minted_today_fun: string;
  remaining_today_fun: string;
  eta_days: number;
}

interface BacklogStatus {
  total_backlog_count: number;
  total_backlog_fun: string;
  max_eta_days: number;
  soft_cap_per_action_fun: string;
  breakdown: BacklogRow[];
}

const fmt = (s: string) => Number(s).toLocaleString('vi-VN');

export function BacklogStatusBanner() {
  const [data, setData] = useState<BacklogStatus | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    const fetchData = async () => {
      try {
        const { data: res } = await supabase.functions.invoke('pplp-backlog-status', { method: 'GET' });
        if (!cancelled && res?.success) setData(res as BacklogStatus);
      } catch (e) {
        console.error('[BacklogStatusBanner]', e);
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    fetchData();
    const t = setInterval(fetchData, 60_000);
    return () => { cancelled = true; clearInterval(t); };
  }, []);

  if (loading || !data || data.total_backlog_count === 0) return null;

  return (
    <Card className="border-amber-500/40 bg-gradient-to-br from-amber-500/10 via-background to-background">
      <CardContent className="p-4 space-y-3">
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <div className="flex items-center gap-2">
            <AlertTriangle className="w-5 h-5 text-amber-500" />
            <div>
              <div className="font-semibold text-foreground">
                Backlog mint chờ epoch UTC mở
              </div>
              <div className="text-xs text-muted-foreground">
                Throttle 950.000 FUN/loại/ngày bảo vệ contract khỏi EPOCH_CAP
              </div>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Badge variant="outline" className="text-base px-3 py-1">
              {data.total_backlog_count} lệnh · {fmt(data.total_backlog_fun)} FUN
            </Badge>
            <Badge variant="outline" className="gap-1 text-base px-3 py-1">
              <Clock className="w-3.5 h-3.5" />
              ETA {data.max_eta_days} ngày
            </Badge>
          </div>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2">
          {data.breakdown.map((row) => (
            <div
              key={row.action_name}
              className="rounded-md border border-border/60 bg-muted/30 px-3 py-2"
            >
              <div className="text-xs font-medium text-muted-foreground">{row.action_name}</div>
              <div className="text-sm font-semibold">{fmt(row.backlog_fun)} FUN</div>
              <div className="text-xs text-muted-foreground">
                {row.backlog_count} lệnh · còn {fmt(row.remaining_today_fun)} hôm nay
              </div>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

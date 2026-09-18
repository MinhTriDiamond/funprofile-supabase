/**
 * BacklogAlertsWatcher
 * - Poll dữ liệu backlog history mỗi 2 phút
 * - Phát hiện 2 loại cảnh báo:
 *   • soft_cap_exceeded: minted_today_fun >= soft cap (mặc định 950K)
 *   • eta_threshold_exceeded: eta_days >= ETA_THRESHOLD (mặc định 14 ngày)
 * - Hiển thị toast (sonner) + insert dedupe vào bảng backlog_alert_events
 * - Render lịch sử 20 cảnh báo gần nhất ngay trong card
 */
import { useEffect, useMemo, useState, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { AlertTriangle, BellRing, Loader2, RefreshCw } from 'lucide-react';
import { toast } from 'sonner';
import { formatDistanceToNow } from 'date-fns';
import { vi } from 'date-fns/locale';

const ETA_THRESHOLD_DAYS = 14;
const POLL_MS = 120_000;

interface SummaryRow {
  action_name: string;
  backlog_count: number;
  backlog_fun: string;
  minted_today_fun: string;
  remaining_today_fun: string;
  eta_days: number;
}

interface AlertRow {
  id: string;
  alert_type: 'soft_cap_exceeded' | 'eta_threshold_exceeded';
  action_name: string;
  metric_value: number;
  threshold_value: number;
  message: string;
  created_at: string;
}

const fmt = (n: number | string) => Number(n).toLocaleString('vi-VN');

export function BacklogAlertsWatcher() {
  const [alerts, setAlerts] = useState<AlertRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [checking, setChecking] = useState(false);

  const loadAlerts = useCallback(async () => {
    const { data } = await supabase
      .from('backlog_alert_events')
      .select('id, alert_type, action_name, metric_value, threshold_value, message, created_at')
      .order('created_at', { ascending: false })
      .limit(20);
    setAlerts((data || []) as AlertRow[]);
  }, []);

  const evaluate = useCallback(async () => {
    setChecking(true);
    try {
      const { data: res } = await supabase.functions.invoke('pplp-backlog-history', { method: 'GET' });
      const summary: SummaryRow[] = (res as any)?.summary || [];
      const softCap = Number((res as any)?.soft_cap_per_action_fun || 950_000);
      if (!summary.length) return;

      const today = new Date().toISOString().slice(0, 10);
      const toInsert: Array<{
        alert_type: AlertRow['alert_type'];
        action_name: string;
        metric_value: number;
        threshold_value: number;
        message: string;
        dedupe_key: string;
      }> = [];

      for (const r of summary) {
        const mintedToday = Number(r.minted_today_fun);
        if (mintedToday >= softCap) {
          toInsert.push({
            alert_type: 'soft_cap_exceeded',
            action_name: r.action_name,
            metric_value: mintedToday,
            threshold_value: softCap,
            message: `Action "${r.action_name}" đã mint ${fmt(mintedToday)} FUN hôm nay, chạm soft cap ${fmt(softCap)} FUN.`,
            dedupe_key: `soft_cap_exceeded:${r.action_name}:${today}`,
          });
        }
        if (r.eta_days >= ETA_THRESHOLD_DAYS) {
          toInsert.push({
            alert_type: 'eta_threshold_exceeded',
            action_name: r.action_name,
            metric_value: r.eta_days,
            threshold_value: ETA_THRESHOLD_DAYS,
            message: `Action "${r.action_name}" có ETA xả lệnh ${r.eta_days} ngày (ngưỡng ${ETA_THRESHOLD_DAYS}). Backlog ${fmt(r.backlog_fun)} FUN / ${r.backlog_count} lệnh.`,
            dedupe_key: `eta_threshold_exceeded:${r.action_name}:${today}`,
          });
        }
      }

      if (toInsert.length === 0) return;

      // Lấy danh sách dedupe_key đã tồn tại hôm nay để khỏi gọi insert vô ích
      const keys = toInsert.map((x) => x.dedupe_key);
      const { data: existing } = await supabase
        .from('backlog_alert_events')
        .select('dedupe_key')
        .in('dedupe_key', keys);
      const existingSet = new Set((existing || []).map((e: any) => e.dedupe_key));

      const fresh = toInsert.filter((x) => !existingSet.has(x.dedupe_key));
      if (fresh.length === 0) return;

      const { error } = await supabase.from('backlog_alert_events').insert(fresh);
      if (error) {
        console.error('[BacklogAlertsWatcher] insert error', error);
        return;
      }

      // Toast cho từng cảnh báo mới
      for (const a of fresh) {
        if (a.alert_type === 'soft_cap_exceeded') {
          toast.warning('Backlog mint chạm soft cap', { description: a.message, duration: 8000 });
        } else {
          toast.error('ETA xả lệnh vượt ngưỡng', { description: a.message, duration: 8000 });
        }
      }
      await loadAlerts();
    } catch (e) {
      console.error('[BacklogAlertsWatcher] evaluate error', e);
    } finally {
      setChecking(false);
    }
  }, [loadAlerts]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      await loadAlerts();
      if (cancelled) return;
      setLoading(false);
      await evaluate();
    })();
    const t = setInterval(evaluate, POLL_MS);
    return () => { cancelled = true; clearInterval(t); };
  }, [evaluate, loadAlerts]);

  const counts = useMemo(() => {
    const today = new Date().toISOString().slice(0, 10);
    const todayAlerts = alerts.filter((a) => a.created_at.slice(0, 10) === today);
    return {
      total: alerts.length,
      today: todayAlerts.length,
      softCap: todayAlerts.filter((a) => a.alert_type === 'soft_cap_exceeded').length,
      eta: todayAlerts.filter((a) => a.alert_type === 'eta_threshold_exceeded').length,
    };
  }, [alerts]);

  return (
    <Card className="border-amber-500/30">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <div className="flex items-center gap-2">
            <BellRing className="w-5 h-5 text-amber-500" />
            <CardTitle className="text-base">Cảnh báo backlog mint</CardTitle>
          </div>
          <div className="flex items-center gap-2">
            <Badge variant="outline" className="text-[10px]">
              Hôm nay: {counts.today} (cap {counts.softCap} · ETA {counts.eta})
            </Badge>
            <Button size="sm" variant="outline" onClick={evaluate} disabled={checking} className="h-7 px-2 text-xs">
              {checking ? <Loader2 className="w-3 h-3 animate-spin mr-1" /> : <RefreshCw className="w-3 h-3 mr-1" />}
              Kiểm tra
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        {loading ? (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="w-4 h-4 animate-spin" /> Đang tải lịch sử cảnh báo...
          </div>
        ) : alerts.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-4">
            Chưa có cảnh báo nào. Hệ thống đang theo dõi soft cap (950K/action/UTC day) và ETA ≥ {ETA_THRESHOLD_DAYS} ngày.
          </p>
        ) : (
          <ScrollArea className="h-[260px] pr-2">
            <div className="space-y-2">
              {alerts.map((a) => {
                const isSoftCap = a.alert_type === 'soft_cap_exceeded';
                return (
                  <div
                    key={a.id}
                    className={`flex items-start gap-2 rounded-md border px-3 py-2 text-sm ${
                      isSoftCap
                        ? 'border-amber-500/40 bg-amber-500/5'
                        : 'border-destructive/40 bg-destructive/5'
                    }`}
                  >
                    <AlertTriangle className={`w-4 h-4 mt-0.5 shrink-0 ${isSoftCap ? 'text-amber-500' : 'text-destructive'}`} />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <Badge variant={isSoftCap ? 'outline' : 'destructive'} className="text-[10px] px-1.5 py-0">
                          {isSoftCap ? 'SOFT CAP' : 'ETA'}
                        </Badge>
                        <span className="text-xs font-medium">{a.action_name}</span>
                        <span className="text-[11px] text-muted-foreground">
                          {formatDistanceToNow(new Date(a.created_at), { addSuffix: true, locale: vi })}
                        </span>
                      </div>
                      <div className="mt-1 text-xs text-foreground/90">{a.message}</div>
                    </div>
                  </div>
                );
              })}
            </div>
          </ScrollArea>
        )}
      </CardContent>
    </Card>
  );
}

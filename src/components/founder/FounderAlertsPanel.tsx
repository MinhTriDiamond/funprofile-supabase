import { useEffect, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Bell, AlertTriangle, Info, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { format } from 'date-fns';
import { PanelLoading, PanelError } from './PanelStates';
import { PanelToolbar } from './PanelToolbar';
import { downloadCSV, stamp } from '@/lib/csv';

const DISMISS_KEY = 'founder-alerts-dismissed-v1';
const DISMISS_TTL_MS = 24 * 60 * 60 * 1000; // 24h
const hashKey = (a: { type: string; message: string }) => `${a.type}|${a.message}`;

interface Alert {
  type: 'warning' | 'info' | 'danger';
  message: string;
  time: string;
}

const EVENT_TYPE_VI: Record<string, string> = {
  duplicate_detected: 'Phát hiện trùng lặp',
  velocity_limit: 'Vượt giới hạn tốc độ',
  spam_detected: 'Phát hiện spam',
  trust_decay: 'Suy giảm tín nhiệm',
};

export default function FounderAlertsPanel() {
  const qc = useQueryClient();
  const { data, isLoading, isError, error, refetch, isFetching } = useQuery({
    queryKey: ['founder-alerts'],
    queryFn: async () => {
      const now = new Date();
      const last24h = new Date(now.getTime() - 86400000).toISOString();
      const last1h = new Date(now.getTime() - 3600000).toISOString();

      const [recentLogs, recentActions, recentMints] = await Promise.all([
        supabase.from('pplp_v2_event_log').select('event_type, created_at, payload').gte('created_at', last24h).order('created_at', { ascending: false }).limit(50),
        supabase.from('pplp_v2_user_actions').select('id, created_at').gte('created_at', last1h),
        supabase.from('pplp_v2_mint_records').select('mint_amount_user, created_at').gte('created_at', last24h),
      ]);

      const alerts: Alert[] = [];
      const actionsLastHour = (recentActions.data || []).length;
      if (actionsLastHour > 50) {
        alerts.push({ type: 'warning', message: `Đột biến: ${actionsLastHour} hành động trong 1 giờ qua`, time: format(now, 'HH:mm') });
      }

      const mintTotal = (recentMints.data || []).reduce((s, m) => s + (m.mint_amount_user || 0), 0);
      if (mintTotal > 10000) {
        alerts.push({ type: 'danger', message: `Khối lượng mint cao: ${Math.round(mintTotal).toLocaleString('vi-VN')} FUN/24h`, time: format(now, 'HH:mm') });
      }

      const flagEvents = (recentLogs.data || []).filter(l =>
        ['duplicate_detected', 'velocity_limit', 'spam_detected'].includes(l.event_type)
      );
      if (flagEvents.length > 10) {
        alerts.push({ type: 'danger', message: `${flagEvents.length} sự kiện gắn cờ trong 24h`, time: format(new Date(flagEvents[0].created_at), 'HH:mm') });
      }

      (recentLogs.data || []).slice(0, 5).forEach(log => {
        alerts.push({
          type: 'info',
          message: EVENT_TYPE_VI[log.event_type] || log.event_type,
          time: format(new Date(log.created_at), 'HH:mm'),
        });
      });

      return { alerts: alerts.slice(0, 10), actionsLastHour, mintTotal24h: Math.round(mintTotal) };
    },
    staleTime: 30_000,
    refetchInterval: 60_000,
  });

  // Realtime: pplp_v2_event_log → invalidate ngay khi có sự kiện mới
  useEffect(() => {
    const channel = supabase
      .channel('founder-alerts-event-log')
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'pplp_v2_event_log' },
        () => {
          qc.invalidateQueries({ queryKey: ['founder-alerts'] });
        },
      )
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [qc]);



  if (isLoading) return <PanelLoading />;
  if (isError) return <PanelError message={(error as any)?.message} />;
  if (!data) return <PanelError message="Không có dữ liệu" />;

  const d = data;
  const iconMap = { danger: AlertTriangle, warning: Bell, info: Info };
  const colorMap = { danger: 'text-destructive bg-destructive/10', warning: 'text-gold bg-gold/10', info: 'text-muted-foreground bg-muted' };

  // Admin override: dismiss alerts locally (24h TTL, per-browser)
  const [dismissed, setDismissed] = useState<Record<string, number>>({});
  useEffect(() => {
    try {
      const raw = localStorage.getItem(DISMISS_KEY);
      if (!raw) return;
      const parsed = JSON.parse(raw) as Record<string, number>;
      const now = Date.now();
      const fresh = Object.fromEntries(Object.entries(parsed).filter(([, ts]) => now - ts < DISMISS_TTL_MS));
      setDismissed(fresh);
      localStorage.setItem(DISMISS_KEY, JSON.stringify(fresh));
    } catch {}
  }, []);

  const dismiss = (alert: Alert) => {
    const key = hashKey(alert);
    const next = { ...dismissed, [key]: Date.now() };
    setDismissed(next);
    try { localStorage.setItem(DISMISS_KEY, JSON.stringify(next)); } catch {}
    // Audit log server-side (best-effort, không chặn UX)
    (supabase as any).rpc('log_founder_admin_action', {
      _action: 'alert_dismiss',
      _target_kind: 'founder_alert',
      _target_ref: key,
      _payload: { type: alert.type, message: alert.message, time: alert.time },
    }).then(({ error }: any) => {
      if (error) console.warn('[founder] audit log failed:', error.message);
    });
  };
  const visibleAlerts = d.alerts.filter((a) => !dismissed[hashKey(a)]);

  const handleExport = () => {
    const rows: (string | number)[][] = [
      ['Loại', 'Thông điệp', 'Thời gian'],
      ...visibleAlerts.map((a) => [a.type, a.message, a.time]),
      [],
      ['Hành động 1h gần nhất', d.actionsLastHour],
      ['Mint 24h (FUN)', d.mintTotal24h],
    ];
    downloadCSV(`founder-alerts-${stamp()}.csv`, rows);
  };

  return (
    <Card>
      <CardHeader><CardTitle className="flex items-center gap-2">
        <Bell className="h-5 w-5 text-gold" /> Cảnh báo thời gian thực
        <div className="ml-auto"><PanelToolbar onRefresh={() => refetch()} onExport={handleExport} isRefreshing={isFetching} /></div>
      </CardTitle></CardHeader>
      <CardContent className="space-y-2">
        {visibleAlerts.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-4">Không có cảnh báo nào 🎉</p>
        ) : (
          visibleAlerts.map((alert, i) => {
            const Icon = iconMap[alert.type];
            return (
              <div key={i} className={`flex items-start gap-2 rounded-lg p-2 text-sm ${colorMap[alert.type]}`}>
                <Icon className="h-4 w-4 mt-0.5 shrink-0" />
                <span className="flex-1">{alert.message}</span>
                <span className="text-xs opacity-60 shrink-0">{alert.time}</span>
                <Button
                  size="icon"
                  variant="ghost"
                  className="h-5 w-5 -mr-1 opacity-60 hover:opacity-100"
                  onClick={() => dismiss(alert)}
                  title="Ẩn cảnh báo (24h)"
                >
                  <X className="h-3 w-3" />
                </Button>
              </div>
            );
          })
        )}
      </CardContent>
    </Card>
  );
}



import { useEffect, useMemo, useState } from "react";
import { AlertTriangle, CheckCircle, Clock, Film, Radio, RefreshCw, ShieldAlert, Users, Video } from "lucide-react";
import { toast } from "sonner";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/integrations/supabase/client";
import { useLanguage } from "@/i18n/LanguageContext";
import StreamWebhookRegisterCard from "./StreamWebhookRegisterCard";
import ReplayBacklogCard from "./ReplayBacklogCard";
import { getAgoraUsageAdminStats, type AgoraUsageAdminStats } from "@/modules/live/agoraUsageService";

interface LivestreamStats {
  total_sessions: number;
  active_sessions: number;
  ended_sessions: number;
  total_recordings: number;
  done_recordings: number;
  failed_recordings: number;
  stuck_recordings: number;
  assembling_recordings: number;
  avg_duration_minutes: number;
  success_rate: number;
  total_chunks: number;
  total_chunks_uploaded: number;
}

const safeNumber = (value: unknown, fallback = 0): number => {
  const numeric = Number(value ?? fallback);
  return Number.isFinite(numeric) ? numeric : fallback;
};

function formatMinutes(value: unknown): string {
  return safeNumber(value).toLocaleString("vi-VN", { maximumFractionDigits: 1 });
}

function statusVariant(status: string): "default" | "secondary" | "destructive" | "outline" {
  if (status === "live" || status === "connecting") return "default";
  if (status === "failed") return "destructive";
  if (status === "ended") return "secondary";
  return "outline";
}

const LivestreamHealthTab = () => {
  const { t } = useLanguage();
  const [stats, setStats] = useState<LivestreamStats | null>(null);
  const [agoraStats, setAgoraStats] = useState<AgoraUsageAdminStats | null>(null);
  const [loading, setLoading] = useState(false);

  const quotaLevel = useMemo(() => {
    const percent = safeNumber(agoraStats?.quota_percent);
    if (percent >= 100) return { label: "Đã đạt giới hạn Agora tháng này", tone: "destructive" as const };
    if (percent >= 90) return { label: "Agora usage gần chạm giới hạn", tone: "destructive" as const };
    if (percent >= 70) return { label: "Agora usage đã vượt 70%", tone: "warning" as const };
    return null;
  }, [agoraStats?.quota_percent]);

  const fetchStats = async () => {
    setLoading(true);
    try {
      const [{ data, error }, usage] = await Promise.all([
        supabase.rpc('get_livestream_stats'),
        getAgoraUsageAdminStats().catch((err) => {
          console.warn("[LivestreamHealthTab] Agora usage stats unavailable:", err);
          return null;
        }),
      ]);
      if (error) throw error;
      const raw = (data ?? {}) as Partial<LivestreamStats> & Record<string, unknown>;
      setStats({
        total_sessions: safeNumber(raw.total_sessions),
        active_sessions: safeNumber(raw.active_sessions),
        ended_sessions: safeNumber(raw.ended_sessions),
        total_recordings: safeNumber(raw.total_recordings),
        done_recordings: safeNumber(raw.done_recordings ?? raw.recordings_done),
        failed_recordings: safeNumber(raw.failed_recordings ?? raw.recordings_failed),
        stuck_recordings: safeNumber(raw.stuck_recordings ?? raw.recordings_stuck),
        assembling_recordings: safeNumber(raw.assembling_recordings),
        avg_duration_minutes: safeNumber(raw.avg_duration_minutes),
        success_rate: safeNumber(raw.success_rate),
        total_chunks: safeNumber(raw.total_chunks),
        total_chunks_uploaded: safeNumber(raw.total_chunks_uploaded),
      });
      setAgoraStats(usage);
    } catch (err: unknown) {
      console.error("Error fetching livestream stats:", err);
      toast.error(t('adminCannotLoadStats'));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchStats(); }, []);

  const statCards = [
    { label: "Agora hôm nay", value: `${formatMinutes(agoraStats?.today_minutes)} phút`, icon: Video, color: "text-emerald-500" },
    { label: "Agora tháng này", value: `${formatMinutes(agoraStats?.month_minutes)} phút`, icon: Clock, color: "text-amber-500" },
    { label: "Phiên Agora", value: safeNumber(agoraStats?.live_sessions), icon: Radio, color: "text-red-500" },
    { label: "Agora lỗi", value: safeNumber(agoraStats?.failed_sessions), icon: ShieldAlert, color: "text-destructive" },
    ...(stats ? [
      { label: t('adminTotalSessions'), value: stats.total_sessions, icon: Film, color: "text-blue-500" },
      { label: t('adminCurrentlyLive'), value: stats.active_sessions, icon: Radio, color: "text-red-500" },
      { label: t('adminCompleted'), value: stats.done_recordings, icon: CheckCircle, color: "text-emerald-500" },
      { label: t('adminStuck'), value: stats.stuck_recordings, icon: AlertTriangle, color: stats.stuck_recordings > 0 ? "text-yellow-500" : "text-muted-foreground" },
    ] : []),
  ];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h2 className="text-xl font-bold text-foreground">{t('adminLivestreamHealth')}</h2>
          <p className="text-sm text-muted-foreground">Theo dõi sức khỏe live, Agora usage, quota và lỗi kết nối gần đây.</p>
        </div>
        <Button variant="outline" size="sm" onClick={fetchStats} disabled={loading} className="gap-2">
          <RefreshCw className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} />
          {t('adminRefresh')}
        </Button>
      </div>

      <StreamWebhookRegisterCard />
      <ReplayBacklogCard />

      {quotaLevel && (
        <Card className={quotaLevel.tone === "destructive" ? "border-destructive/50 bg-destructive/5" : "border-amber-400/60 bg-amber-50"}>
          <CardContent className="flex items-start gap-3 p-4">
            <AlertTriangle className={quotaLevel.tone === "destructive" ? "mt-0.5 h-5 w-5 text-destructive" : "mt-0.5 h-5 w-5 text-amber-600"} />
            <div>
              <p className="font-semibold">{quotaLevel.label}</p>
              <p className="text-sm text-muted-foreground">
                Đã dùng {formatMinutes(agoraStats?.month_minutes)} / {formatMinutes(agoraStats?.quota_minutes)} phút trong tháng.
              </p>
            </div>
          </CardContent>
        </Card>
      )}

      {agoraStats?.quota_minutes ? (
        <Card>
          <CardHeader>
            <CardTitle className="text-sm">Agora quota tháng</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            <div className="flex items-center justify-between text-sm">
              <span className="text-muted-foreground">{formatMinutes(agoraStats.month_minutes)} phút đã dùng</span>
              <span className="font-medium">{formatMinutes(agoraStats.quota_percent)}%</span>
            </div>
            <Progress value={Math.min(100, safeNumber(agoraStats.quota_percent))} />
          </CardContent>
        </Card>
      ) : null}

      {stats || agoraStats ? (
        <>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {statCards.map((s, i) => (
              <Card key={`${s.label}-${i}`}>
                <CardContent className="p-4 flex items-center gap-3">
                  <s.icon className={`w-8 h-8 ${s.color}`} />
                  <div>
                    <p className="text-2xl font-bold text-foreground">{s.value}</p>
                    <p className="text-xs text-muted-foreground">{s.label}</p>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>

          {agoraStats && (
            <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
              <Card>
                <CardHeader>
                  <CardTitle className="text-sm">User dùng Agora nhiều nhất</CardTitle>
                </CardHeader>
                <CardContent>
                  {agoraStats.top_users.length === 0 ? (
                    <p className="text-sm text-muted-foreground py-6 text-center">Chưa có dữ liệu Agora usage.</p>
                  ) : (
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>User</TableHead>
                          <TableHead>Phiên</TableHead>
                          <TableHead>Tổng phút</TableHead>
                          <TableHead>Viewer minutes</TableHead>
                          <TableHead>Lỗi gần nhất</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {agoraStats.top_users.map((row) => (
                          <TableRow key={row.user_id ?? row.username ?? "unknown"}>
                            <TableCell className="font-medium">{row.full_name || row.username || "Không rõ"}</TableCell>
                            <TableCell>{row.live_sessions}</TableCell>
                            <TableCell>{formatMinutes(row.total_minutes)}</TableCell>
                            <TableCell>{formatMinutes(row.viewer_minutes)}</TableCell>
                            <TableCell className="max-w-[180px] truncate">{row.latest_error || "—"}</TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  )}
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle className="text-sm">Phiên live gần đây</CardTitle>
                </CardHeader>
                <CardContent>
                  {agoraStats.recent_sessions.length === 0 ? (
                    <p className="text-sm text-muted-foreground py-6 text-center">Chưa có phiên Agora nào.</p>
                  ) : (
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>User</TableHead>
                          <TableHead>Phút</TableHead>
                          <TableHead>Viewer</TableHead>
                          <TableHead>Trạng thái</TableHead>
                          <TableHead>Lỗi</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {agoraStats.recent_sessions.map((row) => (
                          <TableRow key={row.id}>
                            <TableCell className="font-medium">{row.full_name || row.username || "Không rõ"}</TableCell>
                            <TableCell>{formatMinutes(row.total_duration_minutes)}</TableCell>
                            <TableCell>{row.peak_viewers}</TableCell>
                            <TableCell>
                              <Badge variant={statusVariant(row.status)}>{row.status}</Badge>
                            </TableCell>
                            <TableCell className="max-w-[220px] truncate" title={row.error_message_internal || row.error_code || undefined}>
                              {row.error_code || "—"}
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  )}
                </CardContent>
              </Card>
            </div>
          )}

          {stats && (
            <Card>
              <CardHeader><CardTitle className="text-sm">{t('adminRecordingDetails')}</CardTitle></CardHeader>
              <CardContent className="grid grid-cols-1 md:grid-cols-4 gap-3 text-sm">
                <div className="flex justify-between rounded-lg bg-muted/50 p-3"><span className="text-muted-foreground">{t('adminAssembling')}</span><span className="font-medium">{stats.assembling_recordings}</span></div>
                <div className="flex justify-between rounded-lg bg-muted/50 p-3"><span className="text-muted-foreground">{t('adminAvgDuration')}</span><span className="font-medium">{formatMinutes(stats.avg_duration_minutes)} {t('adminMinutes')}</span></div>
                <div className="flex justify-between rounded-lg bg-muted/50 p-3"><span className="text-muted-foreground">{t('adminTotalChunks')}</span><span className="font-medium">{stats.total_chunks.toLocaleString()}</span></div>
                <div className="flex justify-between rounded-lg bg-muted/50 p-3"><span className="text-muted-foreground">{t('adminSuccessRate')}</span><span className="font-medium">{formatMinutes(stats.success_rate)}%</span></div>
              </CardContent>
            </Card>
          )}
        </>
      ) : loading ? (
        <div className="flex items-center justify-center py-12">
          <RefreshCw className="w-8 h-8 animate-spin text-muted-foreground" />
        </div>
      ) : null}
    </div>
  );
};

export default LivestreamHealthTab;

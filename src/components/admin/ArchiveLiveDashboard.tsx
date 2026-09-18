/**
 * V2 (17/05/2026) — Realtime dashboard cho admin theo dõi pipeline archive replay.
 * Đọc snapshot từ edge `admin-replay-debug` action `archive_dashboard_snapshot`,
 * + Supabase Realtime subscribe `live_replays` để refresh nhanh.
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { RefreshCw, Wrench, Activity, AlertTriangle, Clock } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { supabase } from "@/integrations/supabase/client";

interface DashboardItem {
  id: string;
  replay_post_id: string | null;
  user: { username?: string | null; full_name?: string | null; avatar_url?: string | null } | null;
  session: { id: string; mode: string; status: string; title?: string | null } | null;
  archive_phase: string | null;
  archive_status: string | null;
  archive_attempts: number | null;
  archive_error: string | null;
  archive_next_retry_at: string | null;
  archive_lease_until: string | null;
  lease_remaining_seconds: number;
  stale_seconds: number;
  duration_seconds: number | null;
  mp4_total_bytes: number | null;
  progress: {
    percent: number | null;
    bytes_done: number | null;
    total_bytes: number | null;
    parts_done: number | null;
    total_parts: number | null;
    part_size: number | null;
  };
  eta_seconds: number | null;
  eligibility: { eligible: boolean; reason: string };
  updated_at: string;
  created_at: string;
}

interface DashboardSnapshot {
  summary: {
    total_in_progress: number;
    by_phase: Record<string, number>;
    unrecoverable_count: number;
    long_in_progress: number;
  };
  items: DashboardItem[];
}

const PHASE_LABEL: Record<string, string> = {
  mp4_export: "Yêu cầu MP4",
  mp4_wait: "Đợi MP4",
  multipart_init: "Khởi tạo multipart",
  multipart_upload: "Đang upload",
  verifying: "Đang verify",
  posting: "Đang publish",
  deleting_stream: "Đang xoá Stream",
};

function formatDuration(sec: number | null | undefined): string {
  if (!sec || sec <= 0) return "—";
  if (sec < 60) return `${Math.round(sec)}s`;
  const m = Math.floor(sec / 60);
  const s = Math.round(sec % 60);
  if (m < 60) return s ? `${m}'${s}"` : `${m}'`;
  const h = Math.floor(m / 60);
  return `${h}h${m % 60}'`;
}

function formatBytes(bytes: number | null | undefined): string {
  if (!bytes) return "—";
  const mb = bytes / (1024 * 1024);
  if (mb < 1024) return `${mb.toFixed(0)} MB`;
  return `${(mb / 1024).toFixed(2)} GB`;
}

async function callDebug(action: string, extra?: Record<string, unknown>) {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session?.access_token) throw new Error("Not signed in");
  const url = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/admin-replay-debug`;
  const resp = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${session.access_token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ action, ...(extra || {}) }),
  });
  const data = await resp.json().catch(() => ({}));
  if (!resp.ok) throw new Error((data as any)?.error || `HTTP ${resp.status}`);
  return data;
}

export function ArchiveLiveDashboard() {
  const [snapshot, setSnapshot] = useState<DashboardSnapshot | null>(null);
  const [loading, setLoading] = useState(false);
  const [repairing, setRepairing] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const data = await callDebug("archive_dashboard_snapshot", { limit: 100 });
      setSnapshot({ summary: (data as any).summary, items: (data as any).items });
    } catch (err) {
      toast.error("Không tải được dashboard", { description: err instanceof Error ? err.message : String(err) });
    } finally {
      setLoading(false);
    }
  }, []);

  // Initial + 15s polling
  useEffect(() => {
    refresh();
    const t = setInterval(refresh, 15_000);
    return () => clearInterval(t);
  }, [refresh]);

  // Realtime: khi `live_replays` đổi → refresh ngay (debounce 1s)
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | null = null;
    const channel = supabase
      .channel("admin-archive-live-dashboard")
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "live_replays" },
        () => {
          if (timer) clearTimeout(timer);
          timer = setTimeout(() => refresh(), 1000);
        },
      )
      .subscribe();
    return () => {
      if (timer) clearTimeout(timer);
      supabase.removeChannel(channel);
    };
  }, [refresh]);

  const handleRepair = useCallback(async (replayId: string) => {
    setRepairing(replayId);
    try {
      const data = await callDebug("repair_long_rtmp_archive", { replay_id: replayId, dry_run: false });
      toast.success("Đã kick repair", { description: `Replay ${replayId.slice(0, 8)}…` });
      console.log("[ArchiveLiveDashboard] repair result", data);
      await refresh();
    } catch (err) {
      toast.error("Repair thất bại", { description: err instanceof Error ? err.message : String(err) });
    } finally {
      setRepairing(null);
    }
  }, [refresh]);

  const summary = snapshot?.summary;
  const items = snapshot?.items || [];
  const byPhaseChips = useMemo(() => Object.entries(summary?.by_phase || {}), [summary]);

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="flex flex-row items-center justify-between pb-2">
          <CardTitle className="text-base flex items-center gap-2">
            <Activity className="h-4 w-4 text-emerald-500" />
            Archive đang chạy
          </CardTitle>
          <Button variant="outline" size="sm" onClick={refresh} disabled={loading}>
            <RefreshCw className={`mr-1 h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} />
            Refresh
          </Button>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap items-center gap-2 text-sm">
            <Badge variant="secondary" className="text-sm">Đang archive: {summary?.total_in_progress ?? "—"}</Badge>
            <Badge variant="secondary" className="text-sm">
              <Clock className="mr-1 h-3 w-3" />
              Video dài (≥1h): {summary?.long_in_progress ?? "—"}
            </Badge>
            {summary?.unrecoverable_count ? (
              <Badge variant="destructive" className="text-sm">
                <AlertTriangle className="mr-1 h-3 w-3" />
                Unrecoverable: {summary.unrecoverable_count}
              </Badge>
            ) : null}
            {byPhaseChips.map(([phase, count]) => (
              <Badge key={phase} variant="outline" className="text-xs">
                {PHASE_LABEL[phase] || phase}: {count}
              </Badge>
            ))}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Replay đang archive (live updates)</CardTitle>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Replay</TableHead>
                <TableHead>User</TableHead>
                <TableHead>Phase</TableHead>
                <TableHead className="min-w-[180px]">Tiến độ</TableHead>
                <TableHead>ETA</TableHead>
                <TableHead>Lease</TableHead>
                <TableHead>Stale</TableHead>
                <TableHead>Attempts</TableHead>
                <TableHead className="text-right">Hành động</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {items.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={9} className="text-center text-muted-foreground py-6">
                    Không có replay nào đang archive
                  </TableCell>
                </TableRow>
              ) : (
                items.map((it) => {
                  const percent = it.progress.percent ?? 0;
                  const isLong = Number(it.duration_seconds || 0) >= 3600;
                  return (
                    <TableRow key={it.id}>
                      <TableCell className="font-mono text-xs">
                        <div className="flex flex-col">
                          <span>{it.id.slice(0, 8)}…</span>
                          {isLong ? (
                            <Badge variant="outline" className="mt-1 text-[10px] w-fit">
                              {formatDuration(it.duration_seconds)} • {formatBytes(it.mp4_total_bytes)}
                            </Badge>
                          ) : null}
                        </div>
                      </TableCell>
                      <TableCell className="text-xs">
                        @{it.user?.username || it.user?.full_name || "—"}
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline" className="text-xs">
                          {PHASE_LABEL[it.archive_phase || ""] || it.archive_phase || "—"}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        {it.progress.percent !== null ? (
                          <div className="space-y-1">
                            <Progress value={percent} className="h-2" />
                            <div className="text-[10px] text-muted-foreground">
                              {percent}% • {it.progress.parts_done}/{it.progress.total_parts} parts •{" "}
                              {formatBytes(it.progress.bytes_done)}/{formatBytes(it.progress.total_bytes)}
                            </div>
                          </div>
                        ) : (
                          <span className="text-xs text-muted-foreground">—</span>
                        )}
                      </TableCell>
                      <TableCell className="text-xs">{formatDuration(it.eta_seconds || undefined)}</TableCell>
                      <TableCell className="text-xs">
                        {it.lease_remaining_seconds > 0 ? (
                          <Badge variant="secondary" className="text-[10px]">
                            {formatDuration(it.lease_remaining_seconds)}
                          </Badge>
                        ) : (
                          <span className="text-muted-foreground">—</span>
                        )}
                      </TableCell>
                      <TableCell className="text-xs">
                        <span className={it.stale_seconds > 480 ? "text-destructive font-medium" : ""}>
                          {formatDuration(it.stale_seconds)}
                        </span>
                      </TableCell>
                      <TableCell className="text-xs">{it.archive_attempts ?? 0}</TableCell>
                      <TableCell className="text-right">
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => handleRepair(it.id)}
                          disabled={repairing === it.id}
                        >
                          <Wrench className="mr-1 h-3 w-3" />
                          {repairing === it.id ? "Đang sửa…" : "Repair"}
                        </Button>
                      </TableCell>
                    </TableRow>
                  );
                })
              )}
            </TableBody>
          </Table>
          {items.some((it) => it.archive_error) ? (
            <div className="mt-4 space-y-1 text-xs">
              <p className="font-medium text-muted-foreground">Lỗi gần nhất:</p>
              {items.filter((it) => it.archive_error).map((it) => (
                <div key={it.id} className="text-destructive">
                  <span className="font-mono">{it.id.slice(0, 8)}…</span>: {it.archive_error}
                </div>
              ))}
            </div>
          ) : null}
        </CardContent>
      </Card>
    </div>
  );
}

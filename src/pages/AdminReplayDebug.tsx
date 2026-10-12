import { useCallback, useEffect, useMemo, useState } from "react";
import { useLanguage } from '@/i18n/LanguageContext';
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { RefreshCw, RotateCcw, Satellite, Shield, TestTube2, Trash2, Search, Wrench, AlertTriangle, Activity } from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ArchiveLiveDashboard } from "@/components/admin/ArchiveLiveDashboard";
import { FixReplayOrientationPanel } from "@/components/admin/FixReplayOrientationPanel";
import { FacebookNavbar } from "@/components/layout/FacebookNavbar";
import { MobileBottomNav } from "@/components/layout/MobileBottomNav";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useAdminRole } from "@/hooks/useAdminRole";
import { supabase } from "@/integrations/supabase/client";
import { cn } from "@/lib/utils";

type ReplayDebugRow = {
  id: string;
  live_session_id: string;
  chunked_recording_id: string | null;
  stream_uid: string | null;
  status: string;
  cloudflare_vod_enabled: boolean;
  archive_status: string | null;
  archive_phase: string | null;
  archive_attempts: number | null;
  archive_next_retry_at: string | null;
  r2_video_url: string | null;
  mp4_total_bytes: number | null;
  multipart_bytes_done: number | null;
  multipart_total_parts: number | null;
  multipart_part_size: number | null;
  tus_offset: number;
  next_chunk_seq: number;
  total_chunks_for_ingest: number | null;
  ingest_attempts: number;
  last_ingest_at: string | null;
  webhook_received_at: string | null;
  playback_hls: string | null;
  thumbnail_url: string | null;
  duration_seconds: number | null;
  error_message: string | null;
  last_error_at: string | null;
  last_webhook_event: string | null;
  last_cf_status: string | null;
  last_cf_response: unknown;
  created_at: string;
  updated_at: string;
};

type LiveRecordingHealthRow = {
  id: string;
  post_id: string | null;
  live_post_id: string | null;
  mode: string | null;
  status: string | null;
  title: string | null;
  recording_provider: string | null;
  recording_status: string | null;
  recording_error_code: string | null;
  recording_error_message: string | null;
  browser_recording_status: string | null;
  browser_recording_chunk_count: number | null;
  browser_recording_total_bytes: number | null;
  archive_status: string | null;
  archive_error: string | null;
  archive_retry_count: number | null;
  archive_next_retry_at: string | null;
  archive_key?: string | null;
  archive_url?: string | null;
  archive_verified?: boolean;
  temp_bucket: string | null;
  temp_object_key: string | null;
  temp_path?: string | null;
  temp_object_count: number | null;
  temp_total_bytes: number | null;
  temp_scan_error: string | null;
  processor_eligible: boolean;
  playback_url: string | null;
  replay_url: string | null;
  r2_video_url: string | null;
  resource_id?: string | null;
  sid?: string | null;
  recording_uid?: number | null;
  recording_started_at?: string | null;
  recording_stopped_at?: string | null;
  recording_last_query_at?: string | null;
  last_agora_query_response?: unknown;
  last_worker_response?: unknown;
  host_connection_status?: string | null;
  last_host_heartbeat_at?: string | null;
  last_seen_at?: string | null;
  last_host_disconnected_at?: string | null;
  last_host_reconnected_at?: string | null;
  replay_post_id?: string | null;
  cleanup_attempts?: number | null;
  last_cleanup_at?: string | null;
  heartbeat_age_ms?: number | null;
  watchdog_decision?: string | null;
  timeline?: Array<{ at: string; reason: string; source: string; payload?: unknown }>;
  active_agora_recording_count: number;
  replay_expected: boolean | "browser_chunks_only";
  started_at: string | null;
  ended_at: string | null;
  updated_at: string;
};

const STUCK_PHASES = new Set([
  "mp4_wait",
  "multipart_init",
  "multipart_upload",
  "posting",
  "exporting_mp4",
  "uploading_r2",
  "verifying_r2",
]);
const STUCK_STATUSES = new Set([
  "pending",
  "failed",
  "exporting_mp4",
  "stream_ready",
  "uploading_r2",
  "verifying_r2",
  "archiving",
  "processing_stream",
]);

const statusClass: Record<string, string> = {
  ready: "bg-emerald-500 text-white",
  processing: "bg-blue-500 text-white",
  uploading: "bg-amber-500 text-white",
  queued: "bg-slate-500 text-white",
  failed: "bg-destructive text-destructive-foreground",
  skipped_legacy: "bg-zinc-400 text-white",
};

async function callDebug(action: string, replayId?: string, extra?: Record<string, unknown>) {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) throw new Error("Admin session required");
  const res = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/admin-replay-debug`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${session.access_token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ action, replay_id: replayId, ...(extra || {}) }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data?.error || `HTTP ${res.status}`);
  return data;
}

function shortId(id: string | null | undefined) {
  return id ? `${id.slice(0, 8)}...${id.slice(-4)}` : "-";
}

function fmtDate(value: string | null) {
  return value ? new Date(value).toLocaleString() : "-";
}

function archiveProgress(row: ReplayDebugRow) {
  const total = Number(row.mp4_total_bytes || 0);
  const done = Number(row.multipart_bytes_done || 0);
  if (!total) return "-";
  return `${Math.round((done / total) * 100)}%`;
}

export default function AdminReplayDebug() {
  const { t } = useLanguage();
  const navigate = useNavigate();
  const { isAdmin, isLoading } = useAdminRole();
  const [rows, setRows] = useState<ReplayDebugRow[]>([]);
  const [liveRows, setLiveRows] = useState<LiveRecordingHealthRow[]>([]);
  const [activeAgoraRecordingCount, setActiveAgoraRecordingCount] = useState(0);
  const [loading, setLoading] = useState(false);
  const [busyAction, setBusyAction] = useState<string | null>(null);
  const [cfResult, setCfResult] = useState<unknown>(null);

  useEffect(() => {
    if (!isLoading && !isAdmin) {
      toast.error(t("ardNoAccess"));
      navigate("/");
    }
  }, [isAdmin, isLoading, navigate]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await callDebug("list");
      const liveData = await callDebug("list_live_recording_health");
      setRows(data.replays || []);
      setLiveRows(liveData.sessions || []);
      setActiveAgoraRecordingCount(Number(liveData.active_agora_recording_count || 0));
    } catch (error) {
      toast.error(error instanceof Error ? error.message : t("ardLoadFail"));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (isAdmin) void load();
  }, [isAdmin, load]);

  const stats = useMemo(() => ({
    total: rows.length,
    ready: rows.filter((r) => r.status === "ready").length,
    active: rows.filter((r) => r.cloudflare_vod_enabled && ["queued", "uploading", "processing"].includes(r.status)).length,
    failed: rows.filter((r) => r.status === "failed").length,
  }), [rows]);

  const runAction = async (action: string, replayId?: string, extra?: Record<string, unknown>) => {
    setBusyAction(`${action}:${replayId || "global"}`);
    try {
      const data = await callDebug(action, replayId, extra);
      if (
        action === "test_cloudflare_api" ||
        action === "repair_stuck_r2_archive" ||
        action === "repair_agora_webcam_temp_replays" ||
        action === "repair_long_rtmp_archive" ||
        action === "diagnose_replay_archive"
      ) setCfResult(data);
      toast.success(t("ardActionDone"));
      await load();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : t("ardActionFail"));
    } finally {
      setBusyAction(null);
    }
  };

  const stuckRows = useMemo(
    () => rows.filter((r) =>
      !r.r2_video_url && (
        (r.archive_phase && STUCK_PHASES.has(r.archive_phase)) ||
        (r.archive_status && STUCK_STATUSES.has(r.archive_status))
      )
    ),
    [rows],
  );

  const groupedStuck = useMemo(() => {
    const map = new Map<string, ReplayDebugRow[]>();
    for (const r of stuckRows) {
      const key = `${r.archive_status || "null"} / ${r.archive_phase || "null"}`;
      const arr = map.get(key) || [];
      arr.push(r);
      map.set(key, arr);
    }
    return Array.from(map.entries())
      .map(([key, items]) => ({ key, items }))
      .sort((a, b) => b.items.length - a.items.length);
  }, [stuckRows]);

  const hourlyBuckets = useMemo(() => {
    const now = Date.now();
    const buckets = [
      { label: "< 1h", min: 0, max: 1 },
      { label: "1–6h", min: 1, max: 6 },
      { label: "6–24h", min: 6, max: 24 },
      { label: t("ardAge13"), min: 24, max: 72 },
      { label: t("ardAge3p"), min: 72, max: Infinity },
    ];
    return buckets.map((b) => ({
      ...b,
      count: stuckRows.filter((r) => {
        const ageH = (now - new Date(r.updated_at).getTime()) / 3_600_000;
        return ageH >= b.min && ageH < b.max;
      }).length,
    }));
  }, [stuckRows]);

  if (isLoading || !isAdmin) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <RefreshCw className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background overflow-hidden">
      <FacebookNavbar />
      <main data-app-scroll className="app-main app-pb-nav">
        <div className="mx-auto max-w-7xl px-4 py-4 space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <div className="p-3 bg-primary rounded-lg text-primary-foreground">
                <Shield className="h-6 w-6" />
              </div>
              <div>
                <h1 className="text-2xl font-bold">Replay Debug</h1>
                <p className="text-sm text-muted-foreground">Cloudflare Stream ingest, webhook, and HLS readiness</p>
              </div>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button variant="outline" onClick={load} disabled={loading}>
                <RefreshCw className={cn("mr-2 h-4 w-4", loading && "animate-spin")} />
                Refresh
              </Button>
              <Button variant="outline" onClick={() => runAction("force_status_refresh")} disabled={!!busyAction}>
                <Satellite className="mr-2 h-4 w-4" />
                Force status refresh
              </Button>
              <Button onClick={() => runAction("test_cloudflare_api")} disabled={!!busyAction}>
                <TestTube2 className="mr-2 h-4 w-4" />
                Test Cloudflare API
              </Button>
              <Button
                variant="outline"
                onClick={async () => {
                  setBusyAction("orphan_dry");
                  try {
                    const { data: { session } } = await supabase.auth.getSession();
                    const res = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/stream-orphan-cleanup`, {
                      method: "POST",
                      headers: { Authorization: `Bearer ${session?.access_token}`, "Content-Type": "application/json" },
                      body: JSON.stringify({ dry_run: true }),
                    });
                    const data = await res.json();
                    setCfResult(data);
                    toast.success(`${t("ardScanPrefix")}${data.cf_total}${t("ardScanMid")}${data.candidates_total}${t("ardScanSuffix")}`);
                  } catch (e) { toast.error(String(e)); } finally { setBusyAction(null); }
                }}
                disabled={!!busyAction}
              >
                <Search className="mr-2 h-4 w-4" />
                {t('ardScanOrphan')}
              </Button>
              <Button
                variant="destructive"
                onClick={async () => {
                  if (!confirm(t("ardConfirmDelete"))) return;
                  setBusyAction("orphan_delete");
                  try {
                    const { data: { session } } = await supabase.auth.getSession();
                    const res = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/stream-orphan-cleanup`, {
                      method: "POST",
                      headers: { Authorization: `Bearer ${session?.access_token}`, "Content-Type": "application/json" },
                      body: JSON.stringify({ dry_run: false, max_delete: 200 }),
                    });
                    const data = await res.json();
                    setCfResult(data);
                    toast.success(`${t("ardDeletedPrefix")}${data.deleted_count}/${data.candidates_total}${t("ardDeletedSuffix")}`);
                  } catch (e) { toast.error(String(e)); } finally { setBusyAction(null); }
                }}
                disabled={!!busyAction}
              >
                <Trash2 className="mr-2 h-4 w-4" />
                {t('ardCleanup')}
              </Button>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
            {Object.entries(stats).map(([label, value]) => (
              <Card key={label}>
                <CardContent className="p-4">
                  <div className="text-xs uppercase text-muted-foreground">{label}</div>
                  <div className="text-2xl font-semibold">{value}</div>
                </CardContent>
              </Card>
            ))}
          </div>

          {cfResult !== null && (
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Cloudflare API Result</CardTitle>
              </CardHeader>
              <CardContent>
                <pre className="max-h-72 overflow-auto rounded bg-muted p-3 text-xs">{JSON.stringify(cfResult, null, 2)}</pre>
              </CardContent>
            </Card>
          )}

          <Tabs defaultValue="live" className="w-full">
            <TabsList>
              <TabsTrigger value="live">
                <Activity className="mr-1 h-3.5 w-3.5" />
                Archive Live
              </TabsTrigger>
              <TabsTrigger value="recent">Recent Replays</TabsTrigger>
              <TabsTrigger value="recording-health">Recording Health</TabsTrigger>
              <TabsTrigger value="stuck">
                <AlertTriangle className="mr-1 h-3.5 w-3.5" />
                {t('ardStuckPrefix')}{stuckRows.length})
              </TabsTrigger>
            </TabsList>

            <TabsContent value="live">
              <ArchiveLiveDashboard />
            </TabsContent>

            <TabsContent value="recent">
              <Card>
                <CardHeader>
                  <CardTitle className="text-base">Recent Replays</CardTitle>
                </CardHeader>
                <CardContent className="p-0">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Replay</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead>Stream UID</TableHead>
                        <TableHead>TUS</TableHead>
                        <TableHead>Webhook</TableHead>
                        <TableHead>Playback</TableHead>
                        <TableHead>Last Error</TableHead>
                        <TableHead className="text-right">Actions</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {rows.map((row) => (
                        <TableRow key={row.id}>
                          <TableCell className="min-w-48">
                            <div className="font-mono text-xs">{shortId(row.id)}</div>
                            <div className="text-xs text-muted-foreground">{fmtDate(row.created_at)}</div>
                          </TableCell>
                          <TableCell>
                            <Badge className={statusClass[row.status] || ""}>{row.status}</Badge>
                            {!row.cloudflare_vod_enabled && (
                              <div className="mt-1 text-xs text-muted-foreground">legacy chunk fallback</div>
                            )}
                            <div className="mt-1 text-xs text-muted-foreground">{row.last_cf_status || "-"}</div>
                          </TableCell>
                          <TableCell className="font-mono text-xs">{shortId(row.stream_uid)}</TableCell>
                          <TableCell className="text-xs">
                            <div>offset: {Number(row.tus_offset || 0).toLocaleString()}</div>
                            <div>next seq: {row.next_chunk_seq} / {row.total_chunks_for_ingest ?? "-"}</div>
                            <div>attempts: {row.ingest_attempts}</div>
                          </TableCell>
                          <TableCell className="text-xs">
                            <div>{row.last_webhook_event || "-"}</div>
                            <div className="text-muted-foreground">{fmtDate(row.webhook_received_at)}</div>
                          </TableCell>
                          <TableCell className="max-w-64 text-xs">
                            <div className="truncate" title={row.playback_hls || ""}>HLS: {row.playback_hls || "-"}</div>
                            <div className="truncate" title={row.thumbnail_url || ""}>Thumb: {row.thumbnail_url || "-"}</div>
                          </TableCell>
                          <TableCell className="max-w-64 text-xs">
                            <div className="line-clamp-3">{row.error_message || "-"}</div>
                            <div className="text-muted-foreground">{fmtDate(row.last_error_at)}</div>
                          </TableCell>
                          <TableCell className="text-right">
                            <div className="flex justify-end gap-2">
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => runAction("retry_upload", row.id)}
                                disabled={!!busyAction || row.status === "skipped_legacy"}
                              >
                                <RotateCcw className="mr-1 h-3.5 w-3.5" />
                                Upload
                              </Button>
                              <Button
                                size="sm"
                                variant="ghost"
                                onClick={() => runAction("retry_webhook_sync", row.id)}
                                disabled={!!busyAction}
                              >
                                Sync
                              </Button>
                            </div>
                          </TableCell>
                        </TableRow>
                      ))}
                      {rows.length === 0 && (
                        <TableRow>
                          <TableCell colSpan={8} className="py-10 text-center text-muted-foreground">
                            No replay records found.
                          </TableCell>
                        </TableRow>
                      )}
                    </TableBody>
                  </Table>
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="recording-health" className="space-y-4">
              <FixReplayOrientationPanel />
              <Card>
                <CardHeader>
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <CardTitle className="text-base">
                      Recording fallback health
                      <span className="ml-2 text-xs font-normal text-muted-foreground">
                        Active Agora recordings: {activeAgoraRecordingCount}
                      </span>
                    </CardTitle>
                    <div className="flex flex-wrap gap-2">
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => runAction("repair_agora_webcam_temp_replays", undefined, { dry_run: true, limit: 50, days: 7 })}
                        disabled={!!busyAction}
                      >
                        <Search className="mr-1 h-3.5 w-3.5" />
                        Preview webcam repair
                      </Button>
                      <Button
                        size="sm"
                        onClick={() => {
                          if (!confirm("Queue stuck Agora webcam replays from R2 temp and invoke processor?")) return;
                          void runAction("repair_agora_webcam_temp_replays", undefined, { apply: true, limit: 50, days: 7 });
                        }}
                        disabled={!!busyAction}
                      >
                        <Wrench className="mr-1 h-3.5 w-3.5" />
                        Repair webcam temp
                      </Button>
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="p-0">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Live session</TableHead>
                        <TableHead>Agora</TableHead>
                        <TableHead>RTC</TableHead>
                        <TableHead>Agora temp</TableHead>
                        <TableHead>Archive/feed</TableHead>
                        <TableHead>Replay expected</TableHead>
                        <TableHead>Last error</TableHead>
                        <TableHead>Updated</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {liveRows.map((row) => (
                        <TableRow key={row.id}>
                          <TableCell className="min-w-56">
                            <div className="font-mono text-xs">{shortId(row.id)}</div>
                            <div className="line-clamp-1 text-xs text-muted-foreground">{row.title || row.mode || "-"}</div>
                            <div className="text-xs text-muted-foreground">{row.status || "-"}</div>
                          </TableCell>
                          <TableCell className="text-xs">
                            <div>provider: {row.recording_provider || "-"}</div>
                            <div>status: {row.recording_status || "-"}</div>
                            <div>resource: <span className="font-mono">{shortId(row.resource_id)}</span></div>
                            <div>sid: <span className="font-mono">{shortId(row.sid)}</span></div>
                            <div>uid: {row.recording_uid || "-"}</div>
                            <div>last query: {fmtDate(row.recording_last_query_at || null)}</div>
                          </TableCell>
                          <TableCell className="text-xs">
                            <div>host: {row.host_connection_status || "-"}</div>
                            <div>heartbeat: {fmtDate(row.last_host_heartbeat_at || null)}</div>
                            <div>seen: {fmtDate(row.last_seen_at || null)}</div>
                            <div>age: {typeof row.heartbeat_age_ms === "number" ? `${Math.round(row.heartbeat_age_ms / 1000)}s` : "-"}</div>
                            <div>watchdog: {row.watchdog_decision || "-"}</div>
                            <div>disconnect: {fmtDate(row.last_host_disconnected_at || null)}</div>
                            <div>reconnect: {fmtDate(row.last_host_reconnected_at || null)}</div>
                          </TableCell>
                          <TableCell className="max-w-72 text-xs">
                            <div>objects: {Number(row.temp_object_count || 0).toLocaleString()}</div>
                            <div>bytes: {Number(row.temp_total_bytes || 0).toLocaleString()}</div>
                            <div>eligible: {row.processor_eligible ? "yes" : "no"}</div>
                            <div className="truncate text-muted-foreground" title={row.temp_object_key || ""}>
                              {row.temp_object_key || "-"}
                            </div>
                          </TableCell>
                          <TableCell className="max-w-72 text-xs">
                            <div>post: <span className="font-mono">{shortId(row.post_id || row.live_post_id)}</span></div>
                            <div>replay: <span className="font-mono">{shortId(row.replay_post_id)}</span></div>
                            <div>archive: {row.archive_verified ? "verified" : row.archive_status || "-"}</div>
                            <div className="truncate" title={row.archive_key || ""}>{row.archive_key || "-"}</div>
                            <div className="truncate text-muted-foreground" title={row.archive_url || ""}>{row.archive_url || "-"}</div>
                          </TableCell>
                          <TableCell className="text-xs">
                            {row.replay_expected === "browser_chunks_only" ? (
                              <Badge variant="outline">browser chunks only</Badge>
                            ) : row.replay_expected ? (
                              <Badge className="bg-emerald-500 text-white">yes</Badge>
                            ) : (
                              <Badge variant="secondary">no</Badge>
                            )}
                          </TableCell>
                          <TableCell className="max-w-80 text-xs">
                            <div className="font-mono">{row.recording_error_code || "-"}</div>
                            <div className="line-clamp-2 text-muted-foreground">
                              {row.recording_error_message || row.archive_error || row.temp_scan_error || "-"}
                            </div>
                            <div>cleanup: {Number(row.cleanup_attempts || 0)} / {fmtDate(row.last_cleanup_at || null)}</div>
                            {row.timeline?.length ? (
                              <details className="mt-1">
                                <summary className="cursor-pointer text-primary">timeline</summary>
                                <div className="mt-1 max-h-40 space-y-1 overflow-auto rounded bg-muted p-2">
                                  {row.timeline.map((event, index) => (
                                    <div key={`${row.id}-${event.at}-${index}`} className="font-mono text-[11px]">
                                      {fmtDate(event.at)} {event.reason} [{event.source}]
                                    </div>
                                  ))}
                                </div>
                              </details>
                            ) : null}
                          </TableCell>
                          <TableCell className="text-xs">{fmtDate(row.updated_at)}</TableCell>
                        </TableRow>
                      ))}
                      {liveRows.length === 0 && (
                        <TableRow>
                          <TableCell colSpan={8} className="py-10 text-center text-muted-foreground">
                            No live recording sessions found.
                          </TableCell>
                        </TableRow>
                      )}
                    </TableBody>
                  </Table>
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="stuck" className="space-y-4">
              <Card>
                <CardHeader className="flex flex-row items-center justify-between space-y-0">
                  <div>
                    <CardTitle className="text-base">{t('ardAgeDistTitle')}</CardTitle>
                    <p className="text-xs text-muted-foreground mt-1">
                      {t('ardStuckSummaryPrefix')}{stuckRows.length}{t('ardStuckSummarySuffix')}
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => runAction("repair_stuck_r2_archive", undefined, { dry_run: true, limit: 100 })}
                      disabled={!!busyAction}
                    >
                      <Search className="mr-1 h-3.5 w-3.5" />
                      Preview repair
                    </Button>
                    <Button
                      size="sm"
                      onClick={() => {
                        if (!confirm(t("ardConfirmRepair"))) return;
                        void runAction("repair_stuck_r2_archive", undefined, { dry_run: false, limit: 100 });
                      }}
                      disabled={!!busyAction || stuckRows.length === 0}
                    >
                      <Wrench className="mr-1 h-3.5 w-3.5" />
                      Repair nhanh (×100)
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => runAction("repair_long_rtmp_archive", undefined, { dry_run: true, limit: 50 })}
                      disabled={!!busyAction}
                    >
                      <Search className="mr-1 h-3.5 w-3.5" />
                      Preview long video
                    </Button>
                    <Button
                      size="sm"
                      onClick={() => {
                        if (!confirm("Repair long/stuck RTMP replays and kick archive again?")) return;
                        void runAction("repair_long_rtmp_archive", undefined, { dry_run: false, limit: 50 });
                      }}
                      disabled={!!busyAction || stuckRows.length === 0}
                    >
                      <Wrench className="mr-1 h-3.5 w-3.5" />
                      Repair long video
                    </Button>
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
                    {hourlyBuckets.map((b) => (
                      <div key={b.label} className="rounded border p-3">
                        <div className="text-xs uppercase text-muted-foreground">{b.label}</div>
                        <div className="text-2xl font-semibold">{b.count}</div>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle className="text-base">{t('ardStatusCountTitle')}</CardTitle>
                </CardHeader>
                <CardContent className="p-0">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>archive_status / archive_phase</TableHead>
                        <TableHead className="text-right">{t('ardColCount')}</TableHead>
                        <TableHead>{t('ardColOldest')}</TableHead>
                        <TableHead>{t('ardColNewest')}</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {groupedStuck.map((g) => {
                        const sorted = [...g.items].sort((a, b) => a.updated_at.localeCompare(b.updated_at));
                        return (
                          <TableRow key={g.key}>
                            <TableCell className="font-mono text-xs">{g.key}</TableCell>
                            <TableCell className="text-right font-semibold">{g.items.length}</TableCell>
                            <TableCell className="text-xs">{fmtDate(sorted[0]?.updated_at)}</TableCell>
                            <TableCell className="text-xs">{fmtDate(sorted[sorted.length - 1]?.updated_at)}</TableCell>
                          </TableRow>
                        );
                      })}
                      {groupedStuck.length === 0 && (
                        <TableRow>
                          <TableCell colSpan={4} className="py-8 text-center text-muted-foreground">
                            {t('ardNoneStuck')}
                          </TableCell>
                        </TableRow>
                      )}
                    </TableBody>
                  </Table>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle className="text-base">{t('ardStuckDetailPrefix')}{stuckRows.length})</CardTitle>
                </CardHeader>
                <CardContent className="p-0">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Replay</TableHead>
                        <TableHead>archive_status</TableHead>
                        <TableHead>archive_phase</TableHead>
                        <TableHead>Attempts</TableHead>
                        <TableHead>R2 progress</TableHead>
                        <TableHead>Updated</TableHead>
                        <TableHead>Last Error</TableHead>
                        <TableHead className="text-right">Actions</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {stuckRows.map((row) => (
                        <TableRow key={row.id}>
                          <TableCell className="min-w-48">
                            <div className="font-mono text-xs">{shortId(row.id)}</div>
                            <div className="text-xs text-muted-foreground">{fmtDate(row.created_at)}</div>
                          </TableCell>
                          <TableCell className="text-xs">{row.archive_status || "-"}</TableCell>
                          <TableCell className="text-xs">{row.archive_phase || "-"}</TableCell>
                          <TableCell className="text-xs">{row.archive_attempts ?? 0}</TableCell>
                          <TableCell className="text-xs">
                            <div>{archiveProgress(row)}</div>
                            <div className="text-muted-foreground">
                              {row.multipart_total_parts ? `${Number(row.multipart_bytes_done || 0).toLocaleString()} / ${Number(row.mp4_total_bytes || 0).toLocaleString()} bytes` : ""}
                            </div>
                          </TableCell>
                          <TableCell className="text-xs">{fmtDate(row.updated_at)}</TableCell>
                          <TableCell className="max-w-64 text-xs">
                            <div className="line-clamp-2">{row.error_message || "-"}</div>
                          </TableCell>
                          <TableCell className="text-right">
                            <div className="flex justify-end gap-2">
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => runAction("diagnose_replay_archive", row.id)}
                                disabled={!!busyAction}
                              >
                                <Search className="mr-1 h-3.5 w-3.5" />
                                Diagnose
                              </Button>
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => runAction("repair_long_rtmp_archive", row.id, { dry_run: false })}
                                disabled={!!busyAction}
                              >
                                <Wrench className="mr-1 h-3.5 w-3.5" />
                                Repair
                              </Button>
                              <Button
                                size="sm"
                                variant="ghost"
                                onClick={() => runAction("retry_webhook_sync", row.id)}
                                disabled={!!busyAction}
                              >
                                Sync
                              </Button>
                            </div>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </CardContent>
              </Card>
            </TabsContent>
          </Tabs>
        </div>
      </main>
      <MobileBottomNav />
    </div>
  );
}

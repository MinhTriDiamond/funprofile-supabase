import { useState, useEffect, useCallback } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { RefreshCw, AlertTriangle, PlayCircle, Hourglass, RotateCw, Wrench } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { formatDistanceToNow } from "date-fns";
import { vi } from "date-fns/locale";

interface BacklogSummary {
  now: string;
  queued_count: number;
  uploading_count: number;
  processing_count: number;
  ready_count: number;
  failed_count: number;
  stale_30m: number;
  stale_1h: number;
  stale_2h: number;
  oldest_last_ingest_at: string | null;
  top_stale: Array<{
    id: string;
    status: string;
    stream_uid: string | null;
    tus_offset: number | null;
    total_chunks_for_ingest: number | null;
    ingest_attempts: number | null;
    last_ingest_at: string | null;
    created_at: string;
    error_message: string | null;
  }>;
}

const ReplayBacklogCard = () => {
  const [data, setData] = useState<BacklogSummary | null>(null);
  const [loading, setLoading] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [triggering, setTriggering] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const { data: res, error } = await supabase.rpc("get_replay_backlog_summary");
      if (error) throw error;
      setData(res as unknown as BacklogSummary);
    } catch (err) {
      console.error("[ReplayBacklog] load error", err);
      toast.error("Không tải được backlog replay");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const triggerIngest = async (fn: "live-replay-stream-ingest" | "live-replay-watchdog") => {
    setTriggering(true);
    try {
      const { data: res, error } = await supabase.functions.invoke(fn, { body: {} });
      if (error) {
        // Lấy chi tiết từ Cloudflare/edge nếu có
        const ctx = (error as any).context;
        let detail = error.message || String(error);
        try {
          if (ctx && typeof ctx.text === "function") {
            const body = await ctx.text();
            if (body) detail = `${ctx.status ?? ""} — ${body.slice(0, 300)}`;
          }
        } catch (_) { /* ignore */ }
        toast.error(`Lỗi ${fn}: ${detail}`);
        console.error("[ReplayBacklog] invoke error", error, res);
        return;
      }
      const r = res as any;
      if (r?.accepted) {
        toast.success(`Đã đẩy ${fn} cho ${r.picked ?? 0} replay (backlog ${r.backlog_total ?? "?"})`);
      } else if (r?.processed != null) {
        toast.success(`${fn}: xử lý ${r.processed} replay`);
      } else {
        toast.success(`Đã kích hoạt ${fn}`);
      }
      setTimeout(load, 1500);
    } catch (err: any) {
      toast.error(`Lỗi ${fn}: ${err?.message || err}`);
      console.error(err);
    } finally {
      setTriggering(false);
    }
  };

  const forceResync = async (replayId: string) => {
    setBusyId(replayId);
    try {
      const { data: res, error } = await supabase.rpc("live_replay_force_resync", { p_replay_id: replayId });
      if (error) throw error;
      toast.success(`Đã reset offset replay ${replayId.slice(0, 8)}…`);
      console.log("[ReplayBacklog] resync", res);
      setTimeout(load, 1000);
    } catch (err: any) {
      toast.error(`Lỗi resync: ${err?.message || err}`);
    } finally {
      setBusyId(null);
    }
  };

  const recover409 = async () => {
    setTriggering(true);
    try {
      const { data: res, error } = await supabase.rpc("live_replay_recover_409_failed");
      if (error) throw error;
      const n = (res as any)?.recovered ?? 0;
      toast.success(`Đã khôi phục ${n} replay lỗi 409 về trạng thái uploading`);
      setTimeout(load, 1000);
    } catch (err: any) {
      toast.error(`Lỗi khôi phục: ${err?.message || err}`);
    } finally {
      setTriggering(false);
    }
  };

  const totalPending = (data?.queued_count ?? 0) + (data?.uploading_count ?? 0);
  const oldestStr = data?.oldest_last_ingest_at
    ? formatDistanceToNow(new Date(data.oldest_last_ingest_at), { addSuffix: true, locale: vi })
    : "—";

  return (
    <Card className={data && data.stale_1h > 0 ? "border-yellow-500/50" : ""}>
      <CardHeader className="flex flex-row items-center justify-between gap-2 pb-3">
        <CardTitle className="text-sm flex items-center gap-2">
          <Hourglass className="w-4 h-4" />
          Backlog Replay Ingest (TUS → Cloudflare Stream)
        </CardTitle>
        <div className="flex flex-wrap gap-2">
          <Button size="sm" variant="outline" onClick={load} disabled={loading}>
            <RefreshCw className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} />
          </Button>
          <Button size="sm" variant="outline" onClick={() => triggerIngest("live-replay-stream-ingest")} disabled={triggering}>
            <PlayCircle className="w-4 h-4 mr-1" /> Đẩy ingest
          </Button>
          <Button size="sm" variant="outline" onClick={() => triggerIngest("live-replay-watchdog")} disabled={triggering}>
            <AlertTriangle className="w-4 h-4 mr-1" /> Watchdog
          </Button>
          {(data?.failed_count ?? 0) > 0 && (
            <Button size="sm" variant="outline" onClick={recover409} disabled={triggering}>
              <Wrench className="w-4 h-4 mr-1" /> Khôi phục lỗi 409
            </Button>
          )}
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        {data ? (
          <>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-sm">
              <div className="rounded-md border p-2">
                <p className="text-xs text-muted-foreground">Đang xếp hàng</p>
                <p className="text-xl font-bold">{data.queued_count}</p>
              </div>
              <div className="rounded-md border p-2">
                <p className="text-xs text-muted-foreground">Đang upload TUS</p>
                <p className="text-xl font-bold">{data.uploading_count}</p>
              </div>
              <div className="rounded-md border p-2">
                <p className="text-xs text-muted-foreground">CF đang encode</p>
                <p className="text-xl font-bold">{data.processing_count}</p>
              </div>
              <div className="rounded-md border p-2">
                <p className="text-xs text-muted-foreground">Hoàn tất / Thất bại</p>
                <p className="text-xl font-bold">{data.ready_count} / {data.failed_count}</p>
              </div>
            </div>

            <div className="grid grid-cols-3 gap-3 text-sm">
              <div className={`rounded-md border p-2 ${data.stale_30m > 0 ? "border-yellow-500/40" : ""}`}>
                <p className="text-xs text-muted-foreground">Stale &gt; 30'</p>
                <p className="text-lg font-semibold">{data.stale_30m}</p>
              </div>
              <div className={`rounded-md border p-2 ${data.stale_1h > 0 ? "border-orange-500/40" : ""}`}>
                <p className="text-xs text-muted-foreground">Stale &gt; 1h</p>
                <p className="text-lg font-semibold">{data.stale_1h}</p>
              </div>
              <div className={`rounded-md border p-2 ${data.stale_2h > 0 ? "border-destructive/50" : ""}`}>
                <p className="text-xs text-muted-foreground">Stale &gt; 2h</p>
                <p className="text-lg font-semibold">{data.stale_2h}</p>
              </div>
            </div>

            <p className="text-xs text-muted-foreground">
              Tổng đang chờ: <strong>{totalPending}</strong> · Cũ nhất: <strong>{oldestStr}</strong>
            </p>

            {data.top_stale.length > 0 && (
              <div className="border rounded-md overflow-hidden">
                <div className="bg-muted/40 px-3 py-1.5 text-xs font-medium text-muted-foreground">
                  Top 10 replay đợi lâu nhất
                </div>
                <div className="divide-y text-xs">
                  {data.top_stale.map((r) => {
                    const offsetMb = r.tus_offset ? (r.tus_offset / 1048576).toFixed(1) : "0";
                    const lastStr = r.last_ingest_at
                      ? formatDistanceToNow(new Date(r.last_ingest_at), { addSuffix: true, locale: vi })
                      : "chưa start";
                    return (
                      <div key={r.id} className="px-3 py-2 flex items-start justify-between gap-2">
                        <div className="min-w-0 flex-1">
                          <p className="font-mono truncate">{r.id.slice(0, 8)}…</p>
                          <p className="text-muted-foreground">
                            {r.status} · offset {offsetMb} MB · attempts {r.ingest_attempts ?? 0} · {lastStr}
                          </p>
                          {r.error_message && (
                            <p className="text-destructive truncate" title={r.error_message}>{r.error_message}</p>
                          )}
                        </div>
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => forceResync(r.id)}
                          disabled={busyId === r.id}
                          title="Reset offset, để cron HEAD-sync lại từ Cloudflare"
                        >
                          <RotateCw className={`w-3.5 h-3.5 ${busyId === r.id ? "animate-spin" : ""}`} />
                        </Button>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </>
        ) : loading ? (
          <div className="flex items-center justify-center py-6">
            <RefreshCw className="w-5 h-5 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">Chưa có dữ liệu.</p>
        )}
      </CardContent>
    </Card>
  );
};

export default ReplayBacklogCard;

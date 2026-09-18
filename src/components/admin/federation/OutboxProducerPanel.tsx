import { useEffect, useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { FlaskConical, RefreshCw, Loader2, ShieldAlert, Send, RotateCcw, PlayCircle } from "lucide-react";
import { toast } from "sonner";

const EVENT_TYPES = [
  "PROFILE_UPDATED",
  "DID_PROMOTED",
  "TRUST_UPDATED",
  "SBT_ISSUED",
  "SBT_REVOKED",
  "WALLET_LINKED",
  "WALLET_UNLINKED",
] as const;

type EventType = (typeof EVENT_TYPES)[number];

interface OutboxRow {
  id: string;
  event_type: string;
  aggregate_id: string;
  status: string;
  attempts: number;
  trace_id: string | null;
  idempotency_key: string;
  last_error: string | null;
  payload: any;
  created_at: string;
  sent_at: string | null;
}

type RolloutPreset = "R1" | "R2" | "R3" | "OFF_ALL" | "CUSTOM";

function detectPreset(flags: Record<string, boolean>): RolloutPreset {
  const f = (k: string) => !!flags?.[k];
  if (EVENT_TYPES.every((t) => !f(t))) return "OFF_ALL";
  if (EVENT_TYPES.every((t) => f(t))) return "R3";
  if (f("PROFILE_UPDATED") && f("TRUST_UPDATED") && f("DID_PROMOTED")
      && !f("SBT_ISSUED") && !f("SBT_REVOKED") && !f("WALLET_LINKED") && !f("WALLET_UNLINKED")) return "R2";
  if (f("PROFILE_UPDATED") && f("TRUST_UPDATED")
      && !f("DID_PROMOTED") && !f("SBT_ISSUED") && !f("SBT_REVOKED")
      && !f("WALLET_LINKED") && !f("WALLET_UNLINKED")) return "R1";
  return "CUSTOM";
}

export function OutboxProducerPanel() {
  const [enabled, setEnabled] = useState<boolean>(false);
  const [publisherEnabled, setPublisherEnabled] = useState<boolean>(false);
  const [loadingFlag, setLoadingFlag] = useState(true);
  const [dryRunUser, setDryRunUser] = useState("");
  const [dryRunEvent, setDryRunEvent] = useState<EventType>("PROFILE_UPDATED");
  const [busy, setBusy] = useState(false);
  const [rows, setRows] = useState<OutboxRow[]>([]);
  const [selected, setSelected] = useState<OutboxRow | null>(null);
  const [eventFlags, setEventFlags] = useState<Record<string, boolean>>({});
  const [stats, setStats] = useState<{ pending: number; in_flight: number; sent: number; failed: number; dead: number }>({
    pending: 0, in_flight: 0, sent: 0, failed: 0, dead: 0,
  });

  const loadFlag = useCallback(async () => {
    setLoadingFlag(true);
    const { data } = await supabase
      .from("app_settings")
      .select("key,value")
      .in("key", [
        "federation_outbox_producer_enabled",
        "federation_outbox_publisher_enabled",
        "federation_outbox_event_flags",
      ]);
    const map = new Map((data ?? []).map((r: any) => [r.key, r.value]));
    setEnabled(Boolean(map.get("federation_outbox_producer_enabled")));
    setPublisherEnabled(Boolean(map.get("federation_outbox_publisher_enabled")));
    const ef = map.get("federation_outbox_event_flags");
    if (ef && typeof ef === "object") setEventFlags(ef as Record<string, boolean>);
    setLoadingFlag(false);
  }, []);

  const loadRows = useCallback(async () => {
    const { data } = await supabase
      .from("fun_profile_event_outbox" as any)
      .select("*")
      .order("created_at", { ascending: false })
      .limit(30);
    setRows((data ?? []) as any);

    const { data: agg } = await supabase
      .from("fun_profile_event_outbox" as any)
      .select("status")
      .limit(10000);
    const s = { pending: 0, in_flight: 0, sent: 0, failed: 0, dead: 0 };
    (agg ?? []).forEach((r: any) => {
      if (r.status in s) (s as any)[r.status]++;
    });
    setStats(s);
  }, []);

  useEffect(() => {
    loadFlag();
    loadRows();
  }, [loadFlag, loadRows]);

  async function setEventFlag(eventType: EventType, next: boolean) {
    setBusy(true);
    try {
      const { data, error } = await supabase.rpc("fun_profile_set_outbox_event_flag" as any, {
        p_event_type: eventType,
        p_enabled: next,
      });
      if (error) throw error;
      const flags = (data as any)?.flags;
      if (flags) setEventFlags(flags);
      toast.success(`${eventType} = ${next ? "BẬT" : "TẮT"}`);
    } catch (e: any) {
      toast.error(e?.message ?? "Lỗi đổi cờ event");
    } finally {
      setBusy(false);
    }
  }

  async function applyPreset(preset: "R1" | "R2" | "R3" | "OFF_ALL") {
    setBusy(true);
    try {
      const { data, error } = await supabase.rpc("fun_profile_apply_outbox_rollout_preset" as any, {
        p_preset: preset,
      });
      if (error) throw error;
      const flags = (data as any)?.flags;
      if (flags) setEventFlags(flags);
      toast.success(`Đã áp preset ${preset}`);
      await loadRows();
    } catch (e: any) {
      toast.error(e?.message ?? "Lỗi áp preset");
    } finally {
      setBusy(false);
    }
  }

  async function toggleEnabled(next: boolean) {
    setBusy(true);
    try {
      const { data, error } = await supabase.rpc("fun_profile_toggle_outbox_producer" as any, {
        p_enabled: next,
      });
      if (error) throw error;
      setEnabled(Boolean((data as any)?.enabled));
      toast.success(`Producer ${next ? "BẬT" : "TẮT"}`);
    } catch (e: any) {
      toast.error(e?.message ?? "Lỗi toggle");
    } finally {
      setBusy(false);
    }
  }

  async function togglePublisher(next: boolean) {
    setBusy(true);
    try {
      const { data, error } = await supabase.rpc("fun_profile_toggle_outbox_publisher" as any, {
        p_enabled: next,
      });
      if (error) throw error;
      setPublisherEnabled(Boolean((data as any)?.enabled));
      toast.success(`Publisher ${next ? "BẬT" : "TẮT"}`);
    } catch (e: any) {
      toast.error(e?.message ?? "Lỗi toggle publisher");
    } finally {
      setBusy(false);
    }
  }

  async function runPublisherNow() {
    setBusy(true);
    try {
      const { data, error } = await supabase.functions.invoke("fun-profile-outbox-publisher", {
        body: { limit: 20 },
      });
      if (error) throw error;
      const r = data as any;
      toast.success(`Publisher: claimed ${r?.claimed ?? 0} · sent ${r?.sent ?? 0} · failed ${r?.failed ?? 0} · dead ${r?.dead ?? 0}`);
      await loadRows();
    } catch (e: any) {
      toast.error(e?.message ?? "Lỗi publisher");
    } finally {
      setBusy(false);
    }
  }

  async function retryOne(id: string) {
    setBusy(true);
    try {
      const { error } = await supabase.rpc("fun_profile_outbox_retry_one" as any, { p_id: id });
      if (error) throw error;
      toast.success("Đã đẩy về pending");
      await loadRows();
    } catch (e: any) {
      toast.error(e?.message ?? "Lỗi retry");
    } finally {
      setBusy(false);
    }
  }

  async function retryDeadBatch() {
    setBusy(true);
    try {
      const { data, error } = await supabase.rpc("fun_profile_outbox_retry_dead_batch" as any, { p_limit: 50 });
      if (error) throw error;
      toast.success(`Đã retry ${(data as any)?.updated ?? 0} dead → pending`);
      await loadRows();
    } catch (e: any) {
      toast.error(e?.message ?? "Lỗi retry batch");
    } finally {
      setBusy(false);
    }
  }

  async function runDryRun() {
    if (!dryRunUser.trim()) return toast.error("Nhập user_id");
    setBusy(true);
    try {
      const { data, error } = await supabase.rpc("fun_profile_dry_run_emit_event" as any, {
        p_user_id: dryRunUser.trim(),
        p_event_type: dryRunEvent,
      });
      if (error) throw error;
      toast.success(`Dry-run ${dryRunEvent}: ${(data as any)?.outbox_id ? "đã ghi outbox" : "duplicate (idempotent OK)"}`);
      await loadRows();
    } catch (e: any) {
      toast.error(e?.message ?? "Lỗi dry-run");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card className="border-amber-500/40">
      <CardHeader>
        <div className="flex items-center justify-between flex-wrap gap-2">
          <CardTitle className="text-base flex items-center gap-2">
            <ShieldAlert className="h-4 w-4 text-amber-500" />
            Federation Outbox — Phase 4A + 4B
          </CardTitle>
          {loadingFlag ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <div className="flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-4">
              <div className="flex items-center gap-2">
                <Label htmlFor="producer-switch" className="text-xs">Producer:</Label>
                <Badge variant={enabled ? "default" : "secondary"}>{enabled ? "BẬT" : "TẮT"}</Badge>
                <Switch id="producer-switch" checked={enabled} disabled={busy} onCheckedChange={toggleEnabled} />
              </div>
              <div className="flex items-center gap-2">
                <Label htmlFor="publisher-switch" className="text-xs">Publisher:</Label>
                <Badge variant={publisherEnabled ? "default" : "secondary"}>{publisherEnabled ? "BẬT" : "TẮT"}</Badge>
                <Switch id="publisher-switch" checked={publisherEnabled} disabled={busy} onCheckedChange={togglePublisher} />
              </div>
            </div>
          )}
        </div>
        <p className="text-xs text-muted-foreground">
          Producer: trigger ghi outbox. Publisher: worker bắn lên FUN Core (cron 1 phút). Dry-run bypass cả 2.
        </p>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
          <Stat label="pending" value={stats.pending} />
          <Stat label="in_flight" value={stats.in_flight} variant="outline" />
          <Stat label="sent" value={stats.sent} variant="default" />
          <Stat label="failed" value={stats.failed} variant="secondary" />
          <Stat label="dead" value={stats.dead} variant="destructive" />
        </div>

        <div className="flex flex-wrap gap-2">
          <Button size="sm" variant="outline" onClick={runPublisherNow} disabled={busy}>
            <PlayCircle className="h-4 w-4 mr-1" /> Chạy publisher ngay
          </Button>
          <Button size="sm" variant="outline" onClick={retryDeadBatch} disabled={busy || stats.dead === 0}>
            <RotateCcw className="h-4 w-4 mr-1" /> Retry dead ({stats.dead})
          </Button>
        </div>

        {/* ── Rollout presets + per-event flags ── */}
        <div className="border rounded p-3 space-y-3 bg-muted/30">
          <div className="flex items-center justify-between flex-wrap gap-2">
            <div className="text-sm font-medium">Production Rollout</div>
            <Badge variant="outline">
              Preset hiện tại: <span className="ml-1 font-mono">{detectPreset(eventFlags)}</span>
            </Badge>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button size="sm" variant="default" onClick={() => applyPreset("R1")} disabled={busy}>
              R1 · Profile + Trust
            </Button>
            <Button size="sm" variant="secondary" onClick={() => applyPreset("R2")} disabled={busy}>
              R2 · + DID
            </Button>
            <Button size="sm" variant="secondary" onClick={() => applyPreset("R3")} disabled={busy}>
              R3 · Toàn bộ
            </Button>
            <Button size="sm" variant="destructive" onClick={() => applyPreset("OFF_ALL")} disabled={busy}>
              Tắt tất cả event
            </Button>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 pt-1">
            {EVENT_TYPES.map((t) => {
              const on = !!eventFlags[t];
              return (
                <div key={t} className="flex items-center justify-between border rounded px-3 py-2 bg-background">
                  <div className="flex items-center gap-2 min-w-0">
                    <Badge variant={on ? "default" : "secondary"} className="text-[10px]">
                      {on ? "ON" : "OFF"}
                    </Badge>
                    <span className="text-xs font-mono truncate">{t}</span>
                  </div>
                  <Switch
                    checked={on}
                    disabled={busy}
                    onCheckedChange={(v) => setEventFlag(t, v)}
                  />
                </div>
              );
            })}
          </div>
          <p className="text-[11px] text-muted-foreground">
            Cờ này gate trigger ghi outbox theo từng event. Producer phải BẬT thì cờ mới có tác dụng.
          </p>
        </div>



        <div className="border rounded p-3 space-y-2">
          <div className="text-sm font-medium flex items-center gap-2">
            <FlaskConical className="h-4 w-4" /> Dry-run 1 user (bypass switch)
          </div>
          <div className="flex flex-col sm:flex-row gap-2">
            <Input
              placeholder="user_id (UUID profile)"
              value={dryRunUser}
              onChange={(e) => setDryRunUser(e.target.value)}
              className="flex-1"
            />
            <Select value={dryRunEvent} onValueChange={(v) => setDryRunEvent(v as EventType)}>
              <SelectTrigger className="sm:w-[220px]"><SelectValue /></SelectTrigger>
              <SelectContent>
                {EVENT_TYPES.map((t) => (
                  <SelectItem key={t} value={t}>{t}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button onClick={runDryRun} disabled={busy}>
              {busy ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <FlaskConical className="h-4 w-4 mr-1" />}
              Dry-run
            </Button>
          </div>
        </div>

        <div>
          <div className="flex items-center justify-between mb-2">
            <div className="text-sm font-medium">30 outbox events gần nhất</div>
            <Button size="sm" variant="ghost" onClick={loadRows}>
              <RefreshCw className="h-4 w-4" />
            </Button>
          </div>
          <div className="space-y-1 max-h-96 overflow-auto">
            {rows.map((r) => (
              <button
                key={r.id}
                onClick={() => setSelected(r)}
                className={`w-full text-left p-2 rounded border text-xs ${
                  selected?.id === r.id ? "border-primary bg-muted" : "hover:bg-muted/50"
                }`}
              >
                <div className="flex items-center justify-between gap-2 flex-wrap">
                  <div className="flex items-center gap-2">
                    <Badge variant="outline">{r.event_type}</Badge>
                    <Badge
                      variant={
                        r.status === "sent" ? "default" : r.status === "dead" ? "destructive" : "secondary"
                      }
                    >
                      {r.status}
                    </Badge>
                    <span className="text-muted-foreground">attempts: {r.attempts}</span>
                  </div>
                  <span className="text-muted-foreground">
                    {new Date(r.created_at).toLocaleString("vi-VN")}
                  </span>
                </div>
                <div className="text-muted-foreground mt-1 truncate">
                  user: {r.aggregate_id.slice(0, 8)}… · trace: {r.trace_id?.slice(0, 12) ?? "—"}
                </div>
                {r.last_error && <div className="text-destructive mt-1 truncate">{r.last_error}</div>}
              </button>
            ))}
            {!rows.length && <div className="text-xs text-muted-foreground">Chưa có event nào</div>}
          </div>
        </div>

        {selected && (
          <div className="border rounded p-3">
            <div className="flex items-center justify-between mb-2 gap-2 flex-wrap">
              <div className="text-sm font-medium">Payload — {selected.event_type}</div>
              {(selected.status === "failed" || selected.status === "dead") && (
                <Button size="sm" variant="outline" onClick={() => retryOne(selected.id)} disabled={busy}>
                  <Send className="h-3 w-3 mr-1" /> Retry event này
                </Button>
              )}
            </div>
            <div className="text-xs text-muted-foreground mb-2 break-all">
              idempotency_key: <code>{selected.idempotency_key}</code>
            </div>
            <pre className="text-xs bg-muted p-3 rounded overflow-auto max-h-96">
              {JSON.stringify(selected.payload, null, 2)}
            </pre>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function Stat({
  label,
  value,
  variant = "outline",
}: {
  label: string;
  value: number;
  variant?: "default" | "secondary" | "destructive" | "outline";
}) {
  return (
    <div className="border rounded p-2 flex items-center justify-between">
      <span className="text-xs text-muted-foreground">{label}</span>
      <Badge variant={variant}>{value}</Badge>
    </div>
  );
}

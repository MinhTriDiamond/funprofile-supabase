import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription,
} from "@/components/ui/dialog";
import { toast } from "sonner";
import { Link2, Clock, Settings, BarChart3, RefreshCcw, ShieldOff, Database } from "lucide-react";
import { usePersistedTab } from "@/hooks/usePersistedTab";

interface Props { adminId: string; }

const ConnectorAdminTab = ({ adminId }: Props) => {
  const [sub, setSub] = usePersistedTab(
    "admin-connector-sub",
    "overview",
    ["overview", "links", "windows", "config"] as const,
  );

  return (
    <Tabs value={sub} onValueChange={setSub} className="space-y-4">
      <TabsList className="grid w-full grid-cols-4 h-auto">
        <TabsTrigger value="overview" className="gap-2 py-2"><BarChart3 className="w-4 h-4" /><span className="hidden sm:inline">Tổng quan</span></TabsTrigger>
        <TabsTrigger value="links" className="gap-2 py-2"><Link2 className="w-4 h-4" /><span className="hidden sm:inline">Links</span></TabsTrigger>
        <TabsTrigger value="windows" className="gap-2 py-2"><Clock className="w-4 h-4" /><span className="hidden sm:inline">Windows</span></TabsTrigger>
        <TabsTrigger value="config" className="gap-2 py-2"><Settings className="w-4 h-4" /><span className="hidden sm:inline">Config</span></TabsTrigger>
      </TabsList>

      <TabsContent value="overview"><OverviewPanel adminId={adminId} /></TabsContent>
      <TabsContent value="links"><LinksPanel adminId={adminId} /></TabsContent>
      <TabsContent value="windows"><WindowsPanel /></TabsContent>
      <TabsContent value="config"><ConfigPanel adminId={adminId} /></TabsContent>
    </Tabs>
  );
};

// ----------------------------------------------------------------------------- Overview
const OverviewPanel = ({ adminId }: { adminId: string }) => {
  const qc = useQueryClient();
  const { data, isLoading, refetch } = useQuery({
    queryKey: ["admin-connector-overview"],
    queryFn: async () => {
      const [links, windows, audit] = await Promise.all([
        supabase.from("connector_links").select("status", { count: "exact" }),
        supabase.from("connector_windows").select("status"),
        supabase.from("connector_admin_audit").select("id", { count: "exact", head: true }),
      ]);
      const linkStatus = { confirmed: 0, reverted: 0 };
      (links.data ?? []).forEach((r: any) => {
        if (r.status === "reverted") linkStatus.reverted++;
        else linkStatus.confirmed++;
      });
      const winStatus = { open: 0, matched: 0, expired: 0 };
      (windows.data ?? []).forEach((r: any) => {
        if (r.status in winStatus) (winStatus as any)[r.status]++;
      });
      return {
        totalLinks: links.count ?? 0,
        ...linkStatus,
        windows: winStatus,
        auditCount: audit.count ?? 0,
      };
    },
    staleTime: 30_000,
  });

  const [running, setRunning] = useState<"dry" | "execute" | null>(null);

  const runBackfill = async (dryRun: boolean) => {
    setRunning(dryRun ? "dry" : "execute");
    try {
      const { data: res, error } = await supabase.functions.invoke("connector-backfill-7d", {
        body: { dry_run: dryRun, days: 7 },
      });
      if (error) throw error;
      if (!(res as any)?.ok) throw new Error((res as any)?.reason || "failed");
      const s = (res as any).stats;
      toast.success(
        dryRun
          ? `Dry-run: ${s.eligible} eligible / ${s.scanned} scanned`
          : `Đã tạo ${s.created} links, gửi noti tới ${(res as any).notified_users} users`,
      );
      qc.invalidateQueries({ queryKey: ["admin-connector-overview"] });
      qc.invalidateQueries({ queryKey: ["admin-connector-links"] });
    } catch (e: any) {
      toast.error(`Backfill lỗi: ${e?.message ?? e}`);
    } finally {
      setRunning(null);
    }
  };

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <Stat label="Tổng links" value={data?.totalLinks ?? "…"} />
        <Stat label="Confirmed" value={data?.confirmed ?? "…"} tone="success" />
        <Stat label="Reverted" value={data?.reverted ?? "…"} tone="danger" />
        <Stat label="Audit logs" value={data?.auditCount ?? "…"} />
      </div>
      <div className="grid grid-cols-3 gap-3">
        <Stat label="Window open" value={data?.windows.open ?? "…"} />
        <Stat label="Window matched" value={data?.windows.matched ?? "…"} tone="success" />
        <Stat label="Window expired" value={data?.windows.expired ?? "…"} />
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2"><Database className="w-5 h-5" /> Backfill 7 ngày</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <p className="text-sm text-muted-foreground">
            Quét <code>wallet_transfers</code> 7 ngày qua để ghi nhận Connector còn thiếu.
            Khi execute: chạy <strong>im lặng</strong> (không spam noti từng giao dịch) và gửi
            <strong> 1 noti tổng kết</strong> cho mỗi new user được ghi nhận.
          </p>
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" disabled={running !== null} onClick={() => runBackfill(true)}>
              {running === "dry" ? "Đang chạy…" : "Dry-run (chỉ thống kê)"}
            </Button>
            <Button disabled={running !== null} onClick={() => runBackfill(false)}>
              {running === "execute" ? "Đang chạy…" : "Execute (ghi DB + gửi noti tổng kết)"}
            </Button>
            <Button variant="ghost" onClick={() => refetch()}><RefreshCcw className="w-4 h-4 mr-1" />Refresh</Button>
          </div>
          {isLoading && <p className="text-xs text-muted-foreground">Đang tải thống kê…</p>}
          <p className="text-xs text-muted-foreground">Admin: {adminId}</p>
        </CardContent>
      </Card>
    </div>
  );
};

const Stat = ({ label, value, tone }: { label: string; value: any; tone?: "success" | "danger" }) => (
  <Card><CardContent className="pt-4">
    <div className="text-xs text-muted-foreground">{label}</div>
    <div className={`text-2xl font-bold ${tone === "success" ? "text-emerald-600" : tone === "danger" ? "text-red-600" : ""}`}>{value}</div>
  </CardContent></Card>
);

// ----------------------------------------------------------------------------- Links
const LinksPanel = ({ adminId }: { adminId: string }) => {
  const qc = useQueryClient();
  const [filter, setFilter] = useState<"all" | "confirmed" | "reverted">("all");
  const { data: links = [], isLoading } = useQuery({
    queryKey: ["admin-connector-links", filter],
    queryFn: async () => {
      let q = supabase.from("connector_links")
        .select("id,new_user_id,connector_user_id,tx_hash,chain,token_symbol,amount,status,matched_at,reverted_at,revert_reason")
        .order("matched_at", { ascending: false }).limit(200);
      if (filter !== "all") q = q.eq("status", filter);
      const { data, error } = await q;
      if (error) throw error;
      return data ?? [];
    },
  });

  const [revertTarget, setRevertTarget] = useState<string | null>(null);
  const [reason, setReason] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const onRevert = async () => {
    if (!revertTarget || reason.trim().length < 5) {
      toast.error("Lý do revert tối thiểu 5 ký tự");
      return;
    }
    setSubmitting(true);
    try {
      const { data, error } = await supabase.functions.invoke("connector-admin-revert", {
        body: { link_id: revertTarget, reason: reason.trim() },
      });
      if (error) throw error;
      if (!(data as any)?.ok) throw new Error((data as any)?.reason || "failed");
      toast.success(`Đã revert link, hoàn -${(data as any).reverted_score} điểm`);
      setRevertTarget(null); setReason("");
      qc.invalidateQueries({ queryKey: ["admin-connector-links"] });
      qc.invalidateQueries({ queryKey: ["admin-connector-overview"] });
    } catch (e: any) {
      toast.error(`Revert lỗi: ${e?.message ?? e}`);
    } finally { setSubmitting(false); }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Connector Links</CardTitle>
        <div className="flex gap-2 pt-2">
          {(["all", "confirmed", "reverted"] as const).map((f) => (
            <Button key={f} size="sm" variant={filter === f ? "default" : "outline"} onClick={() => setFilter(f)}>
              {f}
            </Button>
          ))}
        </div>
      </CardHeader>
      <CardContent>
        {isLoading ? <p className="text-sm text-muted-foreground">Đang tải…</p> : (
          <div className="space-y-2 max-h-[60vh] overflow-y-auto">
            {links.length === 0 && <p className="text-sm text-muted-foreground">Không có link nào.</p>}
            {links.map((l: any) => (
              <div key={l.id} className="border rounded-lg p-3 text-sm space-y-1">
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <Badge variant={l.status === "reverted" ? "destructive" : "default"}>{l.status}</Badge>
                    <span className="font-mono text-xs">{l.amount} {l.token_symbol} • {l.chain}</span>
                  </div>
                  {l.status !== "reverted" && (
                    <Button size="sm" variant="destructive" onClick={() => setRevertTarget(l.id)}>
                      <ShieldOff className="w-3 h-3 mr-1" /> Revert
                    </Button>
                  )}
                </div>
                <div className="text-xs text-muted-foreground space-y-0.5">
                  <div>New user: <span className="font-mono">{l.new_user_id}</span></div>
                  <div>Connector: <span className="font-mono">{l.connector_user_id}</span></div>
                  <div>Tx: <span className="font-mono break-all">{l.tx_hash}</span></div>
                  <div>Matched: {l.matched_at ? new Date(l.matched_at).toLocaleString("vi-VN") : "—"}</div>
                  {l.status === "reverted" && (
                    <div className="text-red-600">Reverted: {new Date(l.reverted_at).toLocaleString("vi-VN")} — {l.revert_reason}</div>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>

      <Dialog open={!!revertTarget} onOpenChange={(o) => { if (!o) { setRevertTarget(null); setReason(""); } }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Revert Connector Link</DialogTitle>
            <DialogDescription>
              Hành động này sẽ huỷ link, đóng vĩnh viễn cửa sổ 48h của user mới (KHÔNG mở lại),
              và trừ Light Score đã trao. Tất cả thao tác được ghi audit log.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <Label>Lý do revert (≥5 ký tự)</Label>
            <Textarea value={reason} onChange={(e) => setReason(e.target.value)} rows={3} placeholder="Vd: Phát hiện sybil farm, ví trùng device fingerprint…" />
            <p className="text-xs text-muted-foreground">Admin: {adminId}</p>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setRevertTarget(null); setReason(""); }}>Huỷ</Button>
            <Button variant="destructive" disabled={submitting} onClick={onRevert}>
              {submitting ? "Đang revert…" : "Xác nhận Revert"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
};

// ----------------------------------------------------------------------------- Windows
const WindowsPanel = () => {
  const [filter, setFilter] = useState<"all" | "open" | "matched" | "expired">("open");
  const { data: windows = [], isLoading } = useQuery({
    queryKey: ["admin-connector-windows", filter],
    queryFn: async () => {
      let q = supabase.from("connector_windows")
        .select("id,user_id,opened_at,expires_at,status,matched_link_id")
        .order("opened_at", { ascending: false }).limit(200);
      if (filter !== "all") q = q.eq("status", filter);
      const { data, error } = await q;
      if (error) throw error;
      return data ?? [];
    },
  });

  return (
    <Card>
      <CardHeader>
        <CardTitle>Connector Windows (48h)</CardTitle>
        <div className="flex gap-2 pt-2 flex-wrap">
          {(["open", "matched", "expired", "all"] as const).map((f) => (
            <Button key={f} size="sm" variant={filter === f ? "default" : "outline"} onClick={() => setFilter(f)}>{f}</Button>
          ))}
        </div>
      </CardHeader>
      <CardContent>
        {isLoading ? <p className="text-sm text-muted-foreground">Đang tải…</p> : (
          <div className="space-y-2 max-h-[60vh] overflow-y-auto">
            {windows.length === 0 && <p className="text-sm text-muted-foreground">Không có window.</p>}
            {windows.map((w: any) => {
              const remaining = new Date(w.expires_at).getTime() - Date.now();
              return (
                <div key={w.id} className="border rounded-lg p-3 text-sm">
                  <div className="flex justify-between items-center">
                    <Badge variant={w.status === "matched" ? "default" : w.status === "open" ? "secondary" : "outline"}>{w.status}</Badge>
                    <span className="text-xs text-muted-foreground">
                      {w.status === "open" && remaining > 0 ? `Còn ${Math.floor(remaining / 3600_000)}h ${Math.floor((remaining % 3600_000) / 60_000)}m` : "—"}
                    </span>
                  </div>
                  <div className="text-xs text-muted-foreground mt-1 space-y-0.5">
                    <div>User: <span className="font-mono">{w.user_id}</span></div>
                    <div>Opened: {new Date(w.opened_at).toLocaleString("vi-VN")}</div>
                    <div>Expires: {new Date(w.expires_at).toLocaleString("vi-VN")}</div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
};

// ----------------------------------------------------------------------------- Config
const ConfigPanel = ({ adminId }: { adminId: string }) => {
  const qc = useQueryClient();
  const { data: rows = [], isLoading } = useQuery({
    queryKey: ["admin-connector-config"],
    queryFn: async () => {
      const { data, error } = await supabase.from("connector_config")
        .select("key,value,description,updated_at,updated_by").order("key");
      if (error) throw error;
      return data ?? [];
    },
  });

  const [edits, setEdits] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState<string | null>(null);

  const save = async (key: string) => {
    const raw = edits[key];
    if (raw === undefined) return;
    let parsed: any;
    try { parsed = JSON.parse(raw); } catch { toast.error("Value phải là JSON hợp lệ"); return; }
    setSaving(key);
    try {
      const { error } = await supabase.from("connector_config").update({
        value: parsed, updated_at: new Date().toISOString(), updated_by: adminId,
      }).eq("key", key);
      if (error) throw error;
      await supabase.from("connector_admin_audit").insert({
        admin_id: adminId, action: "config_update",
        reason: `update ${key}`, metadata: { key, new_value: parsed },
      });
      toast.success(`Đã lưu ${key}`);
      setEdits((e) => { const n = { ...e }; delete n[key]; return n; });
      qc.invalidateQueries({ queryKey: ["admin-connector-config"] });
    } catch (e: any) {
      toast.error(`Lỗi: ${e?.message ?? e}`);
    } finally { setSaving(null); }
  };

  return (
    <Card>
      <CardHeader><CardTitle>Connector Config</CardTitle></CardHeader>
      <CardContent className="space-y-4">
        {isLoading && <p className="text-sm text-muted-foreground">Đang tải…</p>}
        {rows.map((r: any) => {
          const current = JSON.stringify(r.value, null, 2);
          const value = edits[r.key] ?? current;
          const dirty = edits[r.key] !== undefined && edits[r.key] !== current;
          return (
            <div key={r.key} className="space-y-1 border-b pb-3">
              <div className="flex justify-between items-center">
                <Label className="font-mono text-sm">{r.key}</Label>
                <Button size="sm" disabled={!dirty || saving === r.key} onClick={() => save(r.key)}>
                  {saving === r.key ? "Đang lưu…" : "Lưu"}
                </Button>
              </div>
              {r.description && <p className="text-xs text-muted-foreground">{r.description}</p>}
              <Textarea
                value={value}
                onChange={(e) => setEdits((s) => ({ ...s, [r.key]: e.target.value }))}
                rows={Math.min(8, Math.max(2, current.split("\n").length))}
                className="font-mono text-xs"
              />
            </div>
          );
        })}
      </CardContent>
    </Card>
  );
};

export default ConnectorAdminTab;

import { useEffect, useMemo, useState } from "react";
import { Navigate } from "react-router-dom";
import { useAdminRole } from "@/hooks/useAdminRole";
import { useCurrentUser } from "@/hooks/useCurrentUser";
import { useFunCoreProxy, type FunCoreEndpoint, type FunCoreResponse } from "@/hooks/useFunCoreProxy";
import { useFunCorePilotFlag } from "@/hooks/useFunCorePilotFlag";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Copy, Play, Loader2 } from "lucide-react";
import { toast } from "sonner";
import FunCoreComparePanel from "@/components/admin/FunCoreComparePanel";

const PILOT_USER_ID = "11add0ae-0f26-46f3-88bd-eea81e046b01";
const ENDPOINTS: { key: FunCoreEndpoint; label: string }[] = [
  { key: "profile", label: "Profile" },
  { key: "badges", label: "Badges" },
  { key: "light-score", label: "Light Score" },
];

interface AuditRow {
  id: string;
  actor_id: string;
  endpoint: string;
  target_user_id: string;
  upstream_status: number | null;
  success: boolean;
  duration_ms: number | null;
  error_code: string | null;
  trace_id: string | null;
  denied_reason: string | null;
  created_at: string;
}

function hintForError(code: string, status?: number | null): string | null {
  if (code === "CONFIG_ERROR") return "Kiểm tra biến môi trường FUN_PROFILE_SERVICE_SECRET trên Lovable Cloud.";
  if (code === "FORBIDDEN_NOT_ADMIN") return "Tài khoản hiện tại không có quyền admin.";
  if (code === "FORBIDDEN_PILOT_SCOPE") return "userId không nằm trong allowlist pilot. Cập nhật app_settings.fun_core_pilot_allowed_user_ids để mở rộng.";
  if (code === "TIMEOUT") return "FUN Core không phản hồi trong 10 giây.";
  if (status === 401 || status === 403) {
    return "FUN Core từ chối service identity 'fun-profile'. Kiểm tra whitelist phía FUN Core.";
  }
  if (status && status >= 500) return "FUN Core lỗi nội bộ. Thử lại hoặc kiểm tra log FUN Core.";
  return null;
}

function ResponseCard({ label, resp }: { label: string; resp: FunCoreResponse | null | "loading" }) {
  if (resp === "loading") {
    return (
      <Card>
        <CardHeader><CardTitle className="text-base flex items-center gap-2"><Loader2 className="h-4 w-4 animate-spin" /> {label}…</CardTitle></CardHeader>
      </Card>
    );
  }
  if (!resp) return null;
  const status = resp._http?.status ?? 0;
  const dur = resp._http?.durationMs ?? 0;
  const hint = !resp.success ? hintForError(resp.error?.code ?? "", resp.error?.upstreamStatus) : null;
  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base flex flex-wrap items-center gap-2">
          <span>{label}</span>
          <Badge variant={resp.success ? "default" : "destructive"}>
            {resp.success ? "success" : "error"}
          </Badge>
          <Badge variant="outline">HTTP {status || "—"}</Badge>
          <Badge variant="outline">{dur} ms</Badge>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {resp.meta && (
          <div className="flex flex-wrap gap-2 text-xs">
            {resp.meta.schemaVersion && <Badge variant="secondary">schema: {resp.meta.schemaVersion}</Badge>}
            {resp.meta.traceId && (
              <Badge
                variant="secondary"
                className="cursor-pointer"
                onClick={() => { navigator.clipboard.writeText(resp.meta!.traceId!); toast.success("Đã copy traceId"); }}
              >
                trace: {resp.meta.traceId.slice(0, 12)}… <Copy className="ml-1 h-3 w-3" />
              </Badge>
            )}
          </div>
        )}
        {hint && (
          <div className="rounded border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
            {hint}
          </div>
        )}
        <pre className="bg-muted rounded p-3 overflow-x-auto text-xs max-h-[420px]">
{JSON.stringify(resp.success ? resp.data : resp.error, null, 2)}
        </pre>
      </CardContent>
    </Card>
  );
}

function Stats24h() {
  const [stats, setStats] = useState<{
    total: number; success: number; error: number; p50: number; p95: number;
    topErrors: { code: string; count: number }[];
  } | null>(null);
  const [loading, setLoading] = useState(false);

  const refresh = async () => {
    setLoading(true);
    const since = new Date(Date.now() - 24 * 3600_000).toISOString();
    const { data } = await supabase
      .from("fun_core_proxy_audit")
      .select("success, duration_ms, error_code")
      .gte("created_at", since)
      .limit(5000);
    const rows = (data ?? []) as { success: boolean; duration_ms: number | null; error_code: string | null }[];
    const durations = rows.map((r) => r.duration_ms ?? 0).filter((d) => d > 0).sort((a, b) => a - b);
    const pct = (p: number) => durations.length ? durations[Math.min(durations.length - 1, Math.floor((p / 100) * durations.length))] : 0;
    const errMap = new Map<string, number>();
    rows.filter((r) => !r.success && r.error_code).forEach((r) => {
      errMap.set(r.error_code!, (errMap.get(r.error_code!) ?? 0) + 1);
    });
    const topErrors = [...errMap.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5).map(([code, count]) => ({ code, count }));
    setStats({
      total: rows.length,
      success: rows.filter((r) => r.success).length,
      error: rows.filter((r) => !r.success).length,
      p50: pct(50),
      p95: pct(95),
      topErrors,
    });
    setLoading(false);
  };

  useEffect(() => { refresh(); }, []);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base flex items-center justify-between">
          <span>Thống kê 24h</span>
          <Button size="sm" variant="ghost" onClick={refresh} disabled={loading}>
            {loading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : "Làm mới"}
          </Button>
        </CardTitle>
      </CardHeader>
      <CardContent>
        {!stats ? <p className="text-sm text-muted-foreground">Đang tải…</p> : (
          <div className="grid grid-cols-2 md:grid-cols-5 gap-3 text-center">
            <div className="rounded-lg border p-2"><p className="text-lg font-bold">{stats.total}</p><p className="text-[10px] uppercase text-muted-foreground">Tổng</p></div>
            <div className="rounded-lg border p-2"><p className="text-lg font-bold text-emerald-600">{stats.success}</p><p className="text-[10px] uppercase text-muted-foreground">OK</p></div>
            <div className="rounded-lg border p-2"><p className="text-lg font-bold text-destructive">{stats.error}</p><p className="text-[10px] uppercase text-muted-foreground">Lỗi</p></div>
            <div className="rounded-lg border p-2"><p className="text-lg font-bold">{stats.p50} ms</p><p className="text-[10px] uppercase text-muted-foreground">p50</p></div>
            <div className="rounded-lg border p-2"><p className="text-lg font-bold">{stats.p95} ms</p><p className="text-[10px] uppercase text-muted-foreground">p95</p></div>
            {stats.topErrors.length > 0 && (
              <div className="col-span-2 md:col-span-5 mt-2 text-left text-xs">
                <p className="text-muted-foreground mb-1">Top lỗi:</p>
                <div className="flex flex-wrap gap-2">
                  {stats.topErrors.map((e) => (
                    <Badge key={e.code} variant="destructive">{e.code} · {e.count}</Badge>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export default function FunCoreDebugPage() {
  const { user, isLoading: authLoading } = useCurrentUser();
  const { isAdmin, isLoading: roleLoading } = useAdminRole();
  const { call, loading } = useFunCoreProxy();
  const { data: flag } = useFunCorePilotFlag();

  const [userId, setUserId] = useState(PILOT_USER_ID);
  const [results, setResults] = useState<Partial<Record<FunCoreEndpoint, FunCoreResponse | null | "loading">>>({
    "profile": null, "badges": null, "light-score": null,
  });
  const [audit, setAudit] = useState<AuditRow[]>([]);

  const refreshAudit = async () => {
    const { data } = await supabase
      .from("fun_core_proxy_audit")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(20);
    setAudit((data ?? []) as AuditRow[]);
  };

  useEffect(() => { if (isAdmin) refreshAudit(); }, [isAdmin]);

  const runOne = async (ep: FunCoreEndpoint) => {
    setResults((r) => ({ ...r, [ep]: "loading" }));
    const resp = await call(ep, userId);
    setResults((r) => ({ ...r, [ep]: resp }));
    refreshAudit();
  };

  const runAll = async () => {
    setResults({ "profile": "loading", "badges": "loading", "light-score": "loading" });
    const [p, b, l] = await Promise.all([
      call("profile", userId),
      call("badges", userId),
      call("light-score", userId),
    ]);
    setResults({ "profile": p, "badges": b, "light-score": l });
    refreshAudit();
  };

  const anyLoading = useMemo(() => Object.values(loading).some(Boolean), [loading]);

  if (authLoading || roleLoading) return <div className="p-6 text-sm text-muted-foreground">Đang kiểm tra quyền…</div>;
  if (!user) return <Navigate to="/auth" replace />;
  if (!isAdmin) return <Navigate to="/" replace />;

  return (
    <div className="max-w-5xl mx-auto p-4 md:p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-bold">FUN Core Debug · Pilot</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Read-only proxy đến FUN Core API qua service identity <code>fun-profile</code>. Chỉ admin.
          {" "}
          <Badge variant={flag?.enabled ? "default" : "outline"} className="ml-2 text-[10px]">
            Pilot flag: {flag?.enabled ? "ON" : "OFF"}
          </Badge>
          {flag?.allowedUserIds && flag.allowedUserIds.length > 0 && (
            <Badge variant="outline" className="ml-1 text-[10px]">Allowlist: {flag.allowedUserIds.length} userId</Badge>
          )}
        </p>
      </div>

      <Tabs defaultValue="raw" className="space-y-4">
        <TabsList>
          <TabsTrigger value="raw">Raw debug</TabsTrigger>
          <TabsTrigger value="compare">So sánh nội bộ ↔ FUN Core</TabsTrigger>
          <TabsTrigger value="stats">Audit & Thống kê</TabsTrigger>
        </TabsList>

        <TabsContent value="raw" className="space-y-4">
          <Card>
            <CardHeader><CardTitle className="text-base">Tham số test</CardTitle></CardHeader>
            <CardContent className="space-y-3">
              <div className="flex flex-col md:flex-row gap-2">
                <Input
                  value={userId}
                  onChange={(e) => setUserId(e.target.value)}
                  placeholder="userId (UUID)"
                  className="font-mono text-sm"
                />
                <Button onClick={() => setUserId(PILOT_USER_ID)} variant="outline">Pilot ID</Button>
              </div>
              <div className="flex flex-wrap gap-2">
                {ENDPOINTS.map((e) => (
                  <Button key={e.key} variant="secondary" onClick={() => runOne(e.key)} disabled={anyLoading}>
                    <Play className="h-4 w-4 mr-1" /> {e.label}
                  </Button>
                ))}
                <Button onClick={runAll} disabled={anyLoading}>
                  {anyLoading ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <Play className="h-4 w-4 mr-1" />}
                  Chạy cả 3
                </Button>
              </div>
            </CardContent>
          </Card>

          <div className="grid gap-4">
            {ENDPOINTS.map((e) => (
              <ResponseCard key={e.key} label={e.label} resp={results[e.key]} />
            ))}
          </div>
        </TabsContent>

        <TabsContent value="compare" className="space-y-4">
          <Card>
            <CardHeader><CardTitle className="text-base">userId đối soát</CardTitle></CardHeader>
            <CardContent className="flex flex-col md:flex-row gap-2">
              <Input
                value={userId}
                onChange={(e) => setUserId(e.target.value)}
                placeholder="userId (UUID)"
                className="font-mono text-sm"
              />
              <Button onClick={() => setUserId(PILOT_USER_ID)} variant="outline">Pilot ID</Button>
            </CardContent>
          </Card>
          <FunCoreComparePanel userId={userId} />
        </TabsContent>

        <TabsContent value="stats" className="space-y-4">
          <Stats24h />
          <Card>
            <CardHeader>
              <CardTitle className="text-base flex items-center justify-between">
                <span>Audit gần đây (20 dòng)</span>
                <Button size="sm" variant="ghost" onClick={refreshAudit}>Làm mới</Button>
              </CardTitle>
            </CardHeader>
            <CardContent>
              {audit.length === 0 ? (
                <p className="text-sm text-muted-foreground">Chưa có log.</p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-xs">
                    <thead className="text-muted-foreground">
                      <tr className="text-left border-b">
                        <th className="py-2 pr-3">Thời gian</th>
                        <th className="py-2 pr-3">Endpoint</th>
                        <th className="py-2 pr-3">Target</th>
                        <th className="py-2 pr-3">HTTP</th>
                        <th className="py-2 pr-3">Kết quả</th>
                        <th className="py-2 pr-3">ms</th>
                        <th className="py-2 pr-3">Error</th>
                        <th className="py-2 pr-3">Denied</th>
                        <th className="py-2 pr-3">Trace</th>
                      </tr>
                    </thead>
                    <tbody>
                      {audit.map((row) => (
                        <tr key={row.id} className="border-b last:border-0">
                          <td className="py-1.5 pr-3 whitespace-nowrap">{new Date(row.created_at).toLocaleString("vi-VN")}</td>
                          <td className="py-1.5 pr-3 font-mono">{row.endpoint}</td>
                          <td className="py-1.5 pr-3 font-mono">{row.target_user_id.slice(0, 8)}…</td>
                          <td className="py-1.5 pr-3">{row.upstream_status ?? "—"}</td>
                          <td className="py-1.5 pr-3">
                            <Badge variant={row.success ? "default" : "destructive"}>{row.success ? "ok" : "fail"}</Badge>
                          </td>
                          <td className="py-1.5 pr-3">{row.duration_ms ?? "—"}</td>
                          <td className="py-1.5 pr-3 text-destructive">{row.error_code ?? ""}</td>
                          <td className="py-1.5 pr-3 text-amber-600">{row.denied_reason ?? ""}</td>
                          <td className="py-1.5 pr-3 font-mono">{row.trace_id ? `${row.trace_id.slice(0, 8)}…` : ""}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}

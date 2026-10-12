import { useEffect, useState } from "react";
import { useLanguage } from '@/i18n/LanguageContext';
import { Navigate } from "react-router-dom";
import { useAdminRole } from "@/hooks/useAdminRole";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Loader2, Play, FlaskConical, Square, PauseCircle, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { OutboxProducerPanel } from "@/components/admin/federation/OutboxProducerPanel";


interface JobRow {
  id: string; mode: string; status: string;
  total_count: number; processed_count: number; succeeded_count: number; failed_count: number; skipped_count: number;
  last_error: string | null; created_at: string; finished_at: string | null;
}
interface LogRow {
  id: string; job_id: string; target_user_id: string | null; platform_user_id: string;
  trace_id: string; http_status: number | null; status: string; attempts: number;
  last_error: string | null; ecosystem_identity_id: string | null;
  request_sample: any; response_sample: any; created_at: string;
}

export default function FederationBackfillPage() {
  const { t } = useLanguage();
  const { isAdmin, isLoading: loading } = useAdminRole();
  const [filters, setFilters] = useState({ include_banned: false, include_test: false, include_unverified: false });
  const [batchSize, setBatchSize] = useState(1);
  const [busy, setBusy] = useState(false);
  const [jobs, setJobs] = useState<JobRow[]>([]);
  const [selectedJobId, setSelectedJobId] = useState<string | null>(null);
  const [logs, setLogs] = useState<LogRow[]>([]);
  const [oneUserId, setOneUserId] = useState("");
  const [smokeUserId, setSmokeUserId] = useState("");
  const [smokeResult, setSmokeResult] = useState<any>(null);
  const [dryRunResult, setDryRunResult] = useState<any>(null);

  async function loadJobs() {
    const { data } = await supabase.from("federation_sync_jobs").select("*").order("created_at", { ascending: false }).limit(20);
    setJobs((data ?? []) as any);
  }
  async function loadLogs(jobId: string) {
    const { data } = await supabase.from("federation_sync_logs").select("*").eq("job_id", jobId).order("created_at", { ascending: false }).limit(100);
    setLogs((data ?? []) as any);
  }
  useEffect(() => { if (isAdmin) loadJobs(); }, [isAdmin]);
  useEffect(() => { if (selectedJobId) loadLogs(selectedJobId); }, [selectedJobId]);

  if (loading) return <div className="p-8"><Loader2 className="h-4 w-4 animate-spin" /></div>;
  if (!isAdmin) return <Navigate to="/" replace />;

  async function callFn(action: string, extra: any = {}) {
    setBusy(true);
    try {
      const { data, error } = await supabase.functions.invoke("federation-backfill-identity", {
        body: { action, filters, batch_size: batchSize, ...extra },
      });
      if (error) throw error;
      await loadJobs();
      if (data?.job_id) setSelectedJobId(data.job_id);
      return data;
    } catch (e: any) {
      toast.error(e?.message ?? t("fbpError"));
      return null;
    } finally { setBusy(false); }
  }

  async function onDryRun() {
    const d = await callFn("dry_run", { batch_size: 50 });
    if (d) { setDryRunResult(d); toast.success(`${t("fbpDryRunPrefix")}${d.total_eligible}${t("fbpDryRunSuffix")}`); }
  }
  async function onRunOne() {
    if (!oneUserId.trim()) return toast.error(t("fbpNeedUserId"));
    const d = await callFn("run_one", { target_user_id: oneUserId.trim() });
    if (d) toast[d.result?.ok ? "success" : "error"](`Run 1 user: ${d.result?.ok ? "OK" : "FAILED"} (HTTP ${d.result?.status})`);
  }
  async function onRunBatch(n: number) {
    setBatchSize(n);
    const d = await callFn("run_batch", { batch_size: n });
    if (d) toast.success(`Batch ${n}: OK ${d.succeeded}/${d.processed}, fail ${d.failed}`);
  }
  async function onPause() { if (selectedJobId) { await callFn("pause", { job_id: selectedJobId }); toast.message(t("fbpPaused")); } }
  async function onStop() { if (selectedJobId) { await callFn("stop", { job_id: selectedJobId }); toast.message(t("fbpStopped")); } }
  async function onRetry() { if (selectedJobId) { const d = await callFn("retry_failed", { job_id: selectedJobId }); if (d) toast.success(`Retry: OK ${d.succeeded}, fail ${d.failed}`); } }

  async function onSmoke() {
    if (!smokeUserId.trim()) return toast.error(t("fbpNeedPlatformId"));
    setBusy(true);
    try {
      const { data, error } = await supabase.functions.invoke("federation-backfill-smoke", { body: { platform_user_id: smokeUserId.trim() } });
      if (error) throw error;
      setSmokeResult(data);
      toast[data?.pass ? "success" : "error"](`Smoke: ${data?.pass ? "PASS ✅" : "FAIL ❌"}`);
    } catch (e: any) { toast.error(e?.message ?? t("fbpError")); } finally { setBusy(false); }
  }

  return (
    <div className="container mx-auto p-4 md:p-8 max-w-6xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Federation Backfill — FP-2A</h1>
        <p className="text-sm text-muted-foreground">{t('fbpSubtitle')}</p>
      </div>

      <OutboxProducerPanel />



      <Card>
        <CardHeader><CardTitle className="text-base">{t('fbpFiltersTitle')}</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          <div className="flex flex-wrap gap-4">
            <label className="flex items-center gap-2"><Checkbox checked={!filters.include_banned} onCheckedChange={(v) => setFilters((f) => ({ ...f, include_banned: !v }))} /> {t('fbpExcludeBanned')}</label>
            <label className="flex items-center gap-2"><Checkbox checked={!filters.include_test} onCheckedChange={(v) => setFilters((f) => ({ ...f, include_test: !v }))} /> {t('fbpExcludeTest')}</label>
            <label className="flex items-center gap-2"><Checkbox checked={!filters.include_unverified} onCheckedChange={(v) => setFilters((f) => ({ ...f, include_unverified: !v }))} /> {t('fbpExcludeUnverified')}</label>
          </div>
          <div className="flex flex-wrap gap-2 pt-2">
            <Button onClick={onDryRun} disabled={busy} variant="secondary"><FlaskConical className="h-4 w-4 mr-1" /> Dry run</Button>
            <Button onClick={() => onRunBatch(10)} disabled={busy}><Play className="h-4 w-4 mr-1" /> Run batch 10</Button>
            <Button onClick={() => onRunBatch(50)} disabled={busy}><Play className="h-4 w-4 mr-1" /> Run batch 50</Button>
            <Button onClick={() => onRunBatch(100)} disabled={busy}><Play className="h-4 w-4 mr-1" /> Run batch 100</Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle className="text-base">{t('fbpRunOneTitle')}</CardTitle></CardHeader>
        <CardContent className="flex gap-2">
          <Input placeholder="profile user_id (UUID)" value={oneUserId} onChange={(e) => setOneUserId(e.target.value)} />
          <Button onClick={onRunOne} disabled={busy}><Play className="h-4 w-4 mr-1" /> Push 1 user</Button>
        </CardContent>
      </Card>

      {dryRunResult && (
        <Card>
          <CardHeader><CardTitle className="text-base">{t('fbpDryRunTitle')}</CardTitle></CardHeader>
          <CardContent>
            <pre className="text-xs bg-muted p-3 rounded overflow-auto max-h-96">{JSON.stringify(dryRunResult, null, 2)}</pre>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="text-base">{t('fbpJobsTitle')}</CardTitle>
          <div className="flex gap-2">
            <Button size="sm" variant="ghost" onClick={loadJobs}><RefreshCw className="h-4 w-4" /></Button>
            {selectedJobId && <>
              <Button size="sm" variant="outline" onClick={onPause}><PauseCircle className="h-4 w-4 mr-1" />Pause</Button>
              <Button size="sm" variant="outline" onClick={onStop}><Square className="h-4 w-4 mr-1" />Stop</Button>
              <Button size="sm" variant="outline" onClick={onRetry}><RefreshCw className="h-4 w-4 mr-1" />Retry failed</Button>
            </>}
          </div>
        </CardHeader>
        <CardContent>
          <div className="space-y-1 text-sm">
            {jobs.map((j) => (
              <button key={j.id} onClick={() => setSelectedJobId(j.id)} className={`w-full text-left p-2 rounded border ${selectedJobId === j.id ? "bg-muted border-primary" : "hover:bg-muted/50"}`}>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Badge variant="outline">{j.mode}</Badge>
                    <Badge variant={j.status === "completed" ? "default" : j.status === "failed" ? "destructive" : "secondary"}>{j.status}</Badge>
                    <span className="text-xs text-muted-foreground">{new Date(j.created_at).toLocaleString("vi-VN")}</span>
                  </div>
                  <div className="text-xs">OK {j.succeeded_count} / Fail {j.failed_count} / {j.total_count}</div>
                </div>
                {j.last_error && <div className="text-xs text-destructive mt-1 truncate">{j.last_error}</div>}
              </button>
            ))}
            {!jobs.length && <div className="text-muted-foreground text-sm">{t('fbpNoJobs')}</div>}
          </div>
        </CardContent>
      </Card>

      {selectedJobId && (
        <Card>
          <CardHeader><CardTitle className="text-base">{t('fbpLogTitlePrefix')}{selectedJobId.slice(0, 8)}…</CardTitle></CardHeader>
          <CardContent>
            <Tabs defaultValue="list">
              <TabsList><TabsTrigger value="list">{t('fbpTabList')}</TabsTrigger><TabsTrigger value="raw">Raw JSON</TabsTrigger></TabsList>
              <TabsContent value="list" className="space-y-2">
                {logs.map((l) => (
                  <div key={l.id} className="border rounded p-2 text-xs space-y-1">
                    <div className="flex items-center gap-2">
                      <Badge variant={l.status === "ok" ? "default" : l.status === "failed" ? "destructive" : "secondary"}>{l.status}</Badge>
                      <span>HTTP {l.http_status ?? "?"}</span>
                      <span className="text-muted-foreground">attempts: {l.attempts}</span>
                      <span className="text-muted-foreground">user: {l.platform_user_id?.slice(0, 8)}…</span>
                      <span className="text-muted-foreground">trace: {l.trace_id?.slice(0, 8)}…</span>
                    </div>
                    {l.ecosystem_identity_id && <div>ecosystem_identity_id: <code>{l.ecosystem_identity_id}</code></div>}
                    {l.last_error && <div className="text-destructive">{l.last_error}</div>}
                  </div>
                ))}
                {!logs.length && <div className="text-muted-foreground">{t('fbpNoLogs')}</div>}
              </TabsContent>
              <TabsContent value="raw">
                <pre className="text-xs bg-muted p-3 rounded overflow-auto max-h-96">{JSON.stringify(logs, null, 2)}</pre>
              </TabsContent>
            </Tabs>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader><CardTitle className="text-base">Smoke test — GET /identity/by-platform</CardTitle></CardHeader>
        <CardContent className="space-y-2">
          <div className="flex gap-2">
            <Input placeholder={t('fbpSmokePlaceholder')} value={smokeUserId} onChange={(e) => setSmokeUserId(e.target.value)} />
            <Button onClick={onSmoke} disabled={busy}><FlaskConical className="h-4 w-4 mr-1" />Smoke test</Button>
          </div>
          {smokeResult && (
            <div className="space-y-2">
              <div className="flex gap-2 flex-wrap">
                <Badge variant={smokeResult.pass ? "default" : "destructive"}>{smokeResult.pass ? "PASS ✅" : "FAIL ❌"}</Badge>
                <Badge variant="outline">HTTP {smokeResult.http_status}</Badge>
                <Badge variant="outline">{smokeResult.duration_ms} ms</Badge>
                <Badge variant="outline">trace: {smokeResult.trace_id?.slice(0, 8)}…</Badge>
              </div>
              <pre className="text-xs bg-muted p-3 rounded overflow-auto max-h-96">{JSON.stringify(smokeResult, null, 2)}</pre>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { RefreshCw, ShieldCheck, AlertTriangle, BarChart3, Plus, Ban, Check } from "lucide-react";

interface RegistryRow {
  id: string;
  chain_id: number;
  network: string;
  token_address: string | null;
  symbol: string;
  name: string;
  decimals: number;
  risk_level: string;
  is_verified: boolean;
  is_active: boolean;
  source: string;
  notes: string | null;
  updated_at: string;
}

interface SuspiciousRow {
  id: string;
  chain_id: number;
  network: string;
  watched_address: string;
  tx_hash: string;
  raw_token_address: string | null;
  raw_symbol: string | null;
  raw_decimals: number | null;
  raw_amount_wei: string | null;
  reason: string;
  occurrences: number;
  last_seen_at: string;
}

interface DriftAlert {
  id: string;
  window_start: string;
  window_end: string;
  reason: string;
  event_count: number;
  threshold: number;
  sample_contracts: any;
  ack: boolean;
  created_at: string;
}

interface CoverageRow {
  total_scans: number;
  total_verified: number;
  total_suspicious: number;
  coverage_pct: number | null;
  top_suspicious: Array<{ contract: string; raw_symbol: string | null; occurrences: number; last_seen: string }>;
  by_reason: Record<string, number>;
}

function riskColor(r: string) {
  if (r === "trusted") return "bg-emerald-500/15 text-emerald-700 border-emerald-500/30";
  if (r === "allowed") return "bg-sky-500/15 text-sky-700 border-sky-500/30";
  if (r === "suspicious") return "bg-amber-500/15 text-amber-700 border-amber-500/30";
  return "bg-red-500/15 text-red-700 border-red-500/30";
}

const TransactionsTrustPage = () => {
  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <ShieldCheck className="h-6 w-6 text-primary" />
        <div>
          <h1 className="text-xl font-semibold">Transaction Trust — Registry &amp; Suspicious</h1>
          <p className="text-sm text-muted-foreground">
            Phase 1.5 — Quản lý whitelist token, hàng đợi suspicious, và báo cáo coverage của
            <code className="mx-1">fetch-wallet-history</code>.
          </p>
        </div>
      </div>

      <Tabs defaultValue="registry" className="space-y-4">
        <TabsList>
          <TabsTrigger value="registry"><ShieldCheck className="h-4 w-4 mr-1" /> Token Registry</TabsTrigger>
          <TabsTrigger value="suspicious"><AlertTriangle className="h-4 w-4 mr-1" /> Suspicious Queue</TabsTrigger>
          <TabsTrigger value="coverage"><BarChart3 className="h-4 w-4 mr-1" /> Coverage 30d</TabsTrigger>
        </TabsList>

        <TabsContent value="registry"><RegistryTab /></TabsContent>
        <TabsContent value="suspicious"><SuspiciousTab /></TabsContent>
        <TabsContent value="coverage"><CoverageTab /></TabsContent>
      </Tabs>
    </div>
  );
};

// ===== Registry Tab =====
const RegistryTab = () => {
  const [rows, setRows] = useState<RegistryRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [form, setForm] = useState({
    chain_id: 56,
    network: "bsc",
    token_address: "",
    symbol: "",
    name: "",
    decimals: 18,
    risk_level: "allowed",
    source: "manual",
  });

  const load = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("tokens_registry")
      .select("*")
      .order("chain_id")
      .order("symbol");
    if (error) toast.error(error.message);
    else setRows((data || []) as RegistryRow[]);
    setLoading(false);
  };
  useEffect(() => { load(); }, []);

  const saveForm = async () => {
    if (!form.symbol || !form.name) {
      toast.error("Symbol và Name bắt buộc");
      return;
    }
    const addr = form.token_address.trim().toLowerCase() || null;
    const { error } = await supabase.from("tokens_registry").insert({
      chain_id: form.chain_id,
      network: form.network,
      token_address: addr,
      symbol: form.symbol,
      name: form.name,
      decimals: form.decimals,
      risk_level: form.risk_level,
      is_verified: true,
      is_active: true,
      source: form.source,
    });
    if (error) toast.error(error.message);
    else { toast.success("Đã thêm vào Registry"); setForm({ ...form, token_address: "", symbol: "", name: "" }); load(); }
  };

  const toggleActive = async (r: RegistryRow) => {
    const { error } = await supabase
      .from("tokens_registry")
      .update({ is_active: !r.is_active })
      .eq("id", r.id);
    if (error) toast.error(error.message);
    else { toast.success("Đã cập nhật"); load(); }
  };

  const changeRisk = async (r: RegistryRow, risk: string) => {
    const { error } = await supabase
      .from("tokens_registry")
      .update({ risk_level: risk })
      .eq("id", r.id);
    if (error) toast.error(error.message);
    else { toast.success("Đã đổi risk level"); load(); }
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
      <Card className="lg:col-span-1">
        <CardHeader className="pb-3"><CardTitle className="text-base flex items-center gap-2"><Plus className="h-4 w-4" /> Thêm token</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          <div className="grid grid-cols-2 gap-2">
            <div>
              <Label className="text-xs">Chain ID</Label>
              <Input type="number" value={form.chain_id} onChange={(e) => setForm({ ...form, chain_id: Number(e.target.value) })} />
            </div>
            <div>
              <Label className="text-xs">Network</Label>
              <Input value={form.network} onChange={(e) => setForm({ ...form, network: e.target.value })} />
            </div>
          </div>
          <div>
            <Label className="text-xs">Contract address (để trống = native)</Label>
            <Input value={form.token_address} onChange={(e) => setForm({ ...form, token_address: e.target.value })} placeholder="0x..." />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <Label className="text-xs">Symbol</Label>
              <Input value={form.symbol} onChange={(e) => setForm({ ...form, symbol: e.target.value })} />
            </div>
            <div>
              <Label className="text-xs">Decimals</Label>
              <Input type="number" value={form.decimals} onChange={(e) => setForm({ ...form, decimals: Number(e.target.value) })} />
            </div>
          </div>
          <div>
            <Label className="text-xs">Name</Label>
            <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <Label className="text-xs">Risk level</Label>
              <Select value={form.risk_level} onValueChange={(v) => setForm({ ...form, risk_level: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="trusted">trusted</SelectItem>
                  <SelectItem value="allowed">allowed</SelectItem>
                  <SelectItem value="suspicious">suspicious</SelectItem>
                  <SelectItem value="blocked">blocked</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs">Source</Label>
              <Input value={form.source} onChange={(e) => setForm({ ...form, source: e.target.value })} />
            </div>
          </div>
          <Button onClick={saveForm} className="w-full">Thêm vào Registry</Button>
        </CardContent>
      </Card>

      <Card className="lg:col-span-2">
        <CardHeader className="pb-3 flex flex-row items-center justify-between">
          <CardTitle className="text-base">Token Registry ({rows.length})</CardTitle>
          <Button size="sm" variant="ghost" onClick={load}><RefreshCw className="h-4 w-4" /></Button>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-xs text-muted-foreground">
                <tr className="border-b">
                  <th className="text-left py-2 px-2">Chain</th>
                  <th className="text-left py-2 px-2">Symbol</th>
                  <th className="text-left py-2 px-2">Contract</th>
                  <th className="text-left py-2 px-2">Dec</th>
                  <th className="text-left py-2 px-2">Risk</th>
                  <th className="text-left py-2 px-2">Active</th>
                </tr>
              </thead>
              <tbody>
                {loading && <tr><td colSpan={6} className="py-4 text-center text-muted-foreground">Đang tải...</td></tr>}
                {!loading && rows.map((r) => (
                  <tr key={r.id} className="border-b hover:bg-muted/30">
                    <td className="py-2 px-2 font-mono text-xs">{r.chain_id}<div className="text-[10px] text-muted-foreground">{r.network}</div></td>
                    <td className="py-2 px-2 font-semibold">{r.symbol}<div className="text-[10px] text-muted-foreground">{r.name}</div></td>
                    <td className="py-2 px-2 font-mono text-[11px]">{r.token_address || <span className="italic text-muted-foreground">native</span>}</td>
                    <td className="py-2 px-2">{r.decimals}</td>
                    <td className="py-2 px-2">
                      <Select value={r.risk_level} onValueChange={(v) => changeRisk(r, v)}>
                        <SelectTrigger className={`h-7 text-xs border ${riskColor(r.risk_level)}`}><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="trusted">trusted</SelectItem>
                          <SelectItem value="allowed">allowed</SelectItem>
                          <SelectItem value="suspicious">suspicious</SelectItem>
                          <SelectItem value="blocked">blocked</SelectItem>
                        </SelectContent>
                      </Select>
                    </td>
                    <td className="py-2 px-2">
                      <Button size="sm" variant={r.is_active ? "default" : "outline"} onClick={() => toggleActive(r)}>
                        {r.is_active ? "ON" : "OFF"}
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

// ===== Suspicious Tab =====
const SuspiciousTab = () => {
  const [rows, setRows] = useState<SuspiciousRow[]>([]);
  const [filter, setFilter] = useState<string>("all");
  const [loading, setLoading] = useState(false);

  const load = async () => {
    setLoading(true);
    let q = supabase
      .from("suspicious_wallet_events")
      .select("*")
      .order("last_seen_at", { ascending: false })
      .limit(300);
    if (filter !== "all") q = q.eq("reason", filter);
    const { data, error } = await q;
    if (error) toast.error(error.message);
    else setRows((data || []) as SuspiciousRow[]);
    setLoading(false);
  };
  useEffect(() => { load(); }, [filter]);

  const approveAsAllowed = async (r: SuspiciousRow) => {
    if (!r.raw_token_address) { toast.error("Native không thể auto-approve"); return; }
    const symbol = prompt("Symbol hiển thị (chuẩn của Cha):", r.raw_symbol || "") || "";
    if (!symbol) return;
    const name = prompt("Tên token:", r.raw_symbol || "") || symbol;
    const decimals = Number(prompt("Decimals:", String(r.raw_decimals || 18)) || "18");
    const { error } = await supabase.rpc("tt_approve_suspicious", {
      p_event_id: r.id,
      p_symbol: symbol,
      p_name: name,
      p_decimals: decimals,
    });
    if (error) { toast.error(error.message); return; }
    toast.success("Đã duyệt + ghi audit");
    load();
  };

  const blockContract = async (r: SuspiciousRow) => {
    if (!r.raw_token_address) return;
    const { error } = await supabase.rpc("tt_block_suspicious", { p_event_id: r.id });
    if (error) { toast.error(error.message); return; }
    toast.success("Đã chặn contract + ghi audit");
    load();
  };

  const ignore = async (r: SuspiciousRow) => {
    const { error } = await supabase.rpc("tt_ignore_suspicious", { p_event_id: r.id });
    if (error) toast.error(error.message); else { toast.success("Đã bỏ qua + ghi audit"); load(); }
  };

  return (
    <Card>
      <CardHeader className="pb-3 flex flex-row items-center justify-between gap-3">
        <CardTitle className="text-base">Suspicious Wallet Events ({rows.length})</CardTitle>
        <div className="flex gap-2">
          <Select value={filter} onValueChange={setFilter}>
            <SelectTrigger className="w-48"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Tất cả lý do</SelectItem>
              <SelectItem value="unknown_contract">unknown_contract</SelectItem>
              <SelectItem value="symbol_collision">symbol_collision</SelectItem>
              <SelectItem value="decimals_mismatch">decimals_mismatch</SelectItem>
              <SelectItem value="native_not_in_registry">native_not_in_registry</SelectItem>
            </SelectContent>
          </Select>
          <Button size="sm" variant="ghost" onClick={load}><RefreshCw className="h-4 w-4" /></Button>
        </div>
      </CardHeader>
      <CardContent>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-xs text-muted-foreground">
              <tr className="border-b">
                <th className="text-left py-2 px-2">Time</th>
                <th className="text-left py-2 px-2">Chain</th>
                <th className="text-left py-2 px-2">Watched</th>
                <th className="text-left py-2 px-2">Contract</th>
                <th className="text-left py-2 px-2">Raw Symbol</th>
                <th className="text-left py-2 px-2">Raw Dec</th>
                <th className="text-left py-2 px-2">Reason</th>
                <th className="text-left py-2 px-2">Action</th>
              </tr>
            </thead>
            <tbody>
              {loading && <tr><td colSpan={8} className="py-4 text-center text-muted-foreground">Đang tải...</td></tr>}
              {!loading && rows.length === 0 && <tr><td colSpan={8} className="py-4 text-center text-muted-foreground">Không có sự kiện nào.</td></tr>}
              {rows.map((r) => (
                <tr key={r.id} className="border-b hover:bg-muted/30">
                  <td className="py-2 px-2 text-xs text-muted-foreground">{new Date(r.last_seen_at).toLocaleString("vi-VN")}</td>
                  <td className="py-2 px-2 font-mono text-xs">{r.chain_id}</td>
                  <td className="py-2 px-2 font-mono text-[10px]">{r.watched_address.slice(0, 10)}…</td>
                  <td className="py-2 px-2 font-mono text-[10px]">{r.raw_token_address ? r.raw_token_address.slice(0, 10) + "…" : "(native)"}</td>
                  <td className="py-2 px-2 font-semibold">{r.raw_symbol || "—"}</td>
                  <td className="py-2 px-2">{r.raw_decimals ?? "—"}</td>
                  <td className="py-2 px-2"><Badge variant="outline" className="text-[10px]">{r.reason}</Badge></td>
                  <td className="py-2 px-2 flex gap-1">
                    {r.raw_token_address && (
                      <>
                        <Button size="sm" variant="outline" onClick={() => approveAsAllowed(r)}><Check className="h-3 w-3" /></Button>
                        <Button size="sm" variant="outline" onClick={() => blockContract(r)}><Ban className="h-3 w-3" /></Button>
                      </>
                    )}
                    <Button size="sm" variant="ghost" onClick={() => ignore(r)}>Bỏ qua</Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </CardContent>
    </Card>
  );
};

// ===== Coverage Tab =====
const CoverageTab = () => {
  const [data, setData] = useState<CoverageRow | null>(null);
  const [alerts, setAlerts] = useState<DriftAlert[]>([]);
  const [loading, setLoading] = useState(false);

  const load = async () => {
    setLoading(true);
    const [{ data: cov, error: e1 }, { data: al, error: e2 }] = await Promise.all([
      supabase.rpc("tokens_registry_coverage_30d"),
      supabase.from("registry_drift_alerts").select("*").order("created_at", { ascending: false }).limit(30),
    ]);
    if (e1) toast.error(e1.message);
    else if (cov && cov[0]) setData(cov[0] as CoverageRow);
    if (e2) toast.error(e2.message);
    else setAlerts((al || []) as DriftAlert[]);
    setLoading(false);
  };
  useEffect(() => { load(); }, []);

  const ackAlert = async (id: string) => {
    const { error } = await supabase.rpc("tt_ack_drift", { p_alert_id: id });
    if (error) toast.error(error.message); else { toast.success("Đã xác nhận alert"); load(); }
  };

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Card><CardContent className="pt-4"><div className="text-xs text-muted-foreground">Scans 30d</div><div className="text-2xl font-bold">{data?.total_scans ?? "—"}</div></CardContent></Card>
        <Card><CardContent className="pt-4"><div className="text-xs text-muted-foreground">Verified</div><div className="text-2xl font-bold text-emerald-600">{data?.total_verified ?? "—"}</div></CardContent></Card>
        <Card><CardContent className="pt-4"><div className="text-xs text-muted-foreground">Suspicious</div><div className="text-2xl font-bold text-amber-600">{data?.total_suspicious ?? "—"}</div></CardContent></Card>
        <Card>
          <CardContent className="pt-4">
            <div className="text-xs text-muted-foreground">Coverage</div>
            <div className={`text-2xl font-bold ${(data?.coverage_pct ?? 0) >= 95 ? "text-emerald-600" : "text-amber-600"}`}>
              {data?.coverage_pct != null ? `${data.coverage_pct}%` : "—"}
            </div>
            <div className="text-[10px] text-muted-foreground mt-1">{(data?.coverage_pct ?? 0) >= 95 ? "Đủ điều kiện Phase 2" : "Cần mở rộng registry"}</div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader className="pb-3 flex flex-row items-center justify-between">
          <CardTitle className="text-base">Top Suspicious Tokens (30d)</CardTitle>
          <Button size="sm" variant="ghost" onClick={load}><RefreshCw className="h-4 w-4" /></Button>
        </CardHeader>
        <CardContent>
          <table className="w-full text-sm">
            <thead className="text-xs text-muted-foreground">
              <tr className="border-b"><th className="text-left py-2 px-2">Contract</th><th className="text-left py-2 px-2">Raw Symbol</th><th className="text-left py-2 px-2">Occurrences</th><th className="text-left py-2 px-2">Last seen</th></tr>
            </thead>
            <tbody>
              {(data?.top_suspicious || []).map((t, i) => (
                <tr key={i} className="border-b">
                  <td className="py-2 px-2 font-mono text-[11px]">{t.contract}</td>
                  <td className="py-2 px-2">{t.raw_symbol || "—"}</td>
                  <td className="py-2 px-2 font-semibold">{t.occurrences}</td>
                  <td className="py-2 px-2 text-xs text-muted-foreground">{t.last_seen ? new Date(t.last_seen).toLocaleString("vi-VN") : "—"}</td>
                </tr>
              ))}
              {(!data || data.top_suspicious.length === 0) && <tr><td colSpan={4} className="py-4 text-center text-muted-foreground">Chưa có dữ liệu.</td></tr>}
            </tbody>
          </table>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-3"><CardTitle className="text-base">Registry Drift Alerts</CardTitle></CardHeader>
        <CardContent>
          {alerts.length === 0 && <div className="text-sm text-muted-foreground py-4 text-center">Không có alert.</div>}
          <div className="space-y-2">
            {alerts.map((a) => (
              <div key={a.id} className={`p-3 rounded border ${a.ack ? "opacity-60" : "border-amber-500/50 bg-amber-500/5"}`}>
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <div className="font-semibold text-sm">{a.reason} — {a.event_count} events (ngưỡng {a.threshold})</div>
                    <div className="text-xs text-muted-foreground">{new Date(a.window_start).toLocaleString("vi-VN")} → {new Date(a.window_end).toLocaleString("vi-VN")}</div>
                    <div className="text-[11px] mt-1 font-mono">{JSON.stringify(a.sample_contracts).slice(0, 200)}…</div>
                  </div>
                  {!a.ack && <Button size="sm" onClick={() => ackAlert(a.id)}>Ack</Button>}
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

export default TransactionsTrustPage;

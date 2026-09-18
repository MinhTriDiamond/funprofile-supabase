import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ShieldAlert, Power, Lock, RefreshCw, AlertTriangle } from "lucide-react";
import { toast } from "sonner";

type Alert = {
  id: string;
  window_start: string;
  window_end: string;
  affected_count: number;
  application_name: string | null;
  db_session_user: string | null;
  client_addr: string | null;
  changed_by: string | null;
  sample_user_ids: string[] | null;
  severity: string;
  note: string | null;
  created_at: string;
};

type WriterAudit = {
  id: string;
  occurred_at: string;
  user_id: string | null;
  column_name: string;
  writer_tag: string | null;
  is_allowed: boolean;
  strict_mode: boolean;
  blocked: boolean;
  application_name: string | null;
  client_addr: string | null;
};

type SecurityAudit = {
  id: string;
  changed_at: string;
  changed_by: string;
  setting_key: string;
  old_value: string | null;
  new_value: string | null;
  reason: string | null;
};

const severityBadge: Record<string, string> = {
  critical: "bg-red-600 text-white",
  high: "bg-orange-500 text-white",
  medium: "bg-yellow-500 text-black",
  low: "bg-slate-400 text-white",
};

const WalletSecurityTab = () => {
  const [killEnabled, setKillEnabled] = useState<boolean | null>(null);
  const [strict, setStrict] = useState<boolean | null>(null);
  const [reason, setReason] = useState("");
  const [alerts, setAlerts] = useState<Alert[]>([]);
  const [writes, setWrites] = useState<WriterAudit[]>([]);
  const [audits, setAudits] = useState<SecurityAudit[]>([]);
  const [severityFilter, setSeverityFilter] = useState<string>("all");
  const [hoursFilter, setHoursFilter] = useState<string>("168");
  const [loading, setLoading] = useState(false);

  const loadSettings = async () => {
    const { data } = await (supabase as any).from("app_settings").select("key,value").in("key", ["wallet_updates_enabled", "wallet_writes_strict_mode"]);
    const row = (k: string) => (data ?? []).find((d: any) => d.key === k)?.value;
    setKillEnabled(row("wallet_updates_enabled") === "true");
    setStrict(row("wallet_writes_strict_mode") === "true");
  };

  const loadAlerts = async () => {
    const since = new Date(Date.now() - parseInt(hoursFilter) * 3600_000).toISOString();
    let q = supabase
      .from("wallet_bulk_update_alerts")
      .select("*")
      .gte("created_at", since)
      .order("created_at", { ascending: false })
      .limit(200);
    if (severityFilter !== "all") q = q.eq("severity", severityFilter);
    const { data } = await q;
    setAlerts((data ?? []) as Alert[]);
  };

  const loadWrites = async () => {
    const { data } = await supabase
      .from("wallet_writer_audit")
      .select("id,occurred_at,user_id,column_name,writer_tag,is_allowed,strict_mode,blocked,application_name,client_addr")
      .order("occurred_at", { ascending: false })
      .limit(100);
    setWrites((data ?? []) as WriterAudit[]);
  };

  const loadAudits = async () => {
    const { data } = await supabase
      .from("wallet_security_audit")
      .select("*")
      .order("changed_at", { ascending: false })
      .limit(50);
    setAudits((data ?? []) as SecurityAudit[]);
  };

  const refreshAll = async () => {
    setLoading(true);
    await Promise.all([loadSettings(), loadAlerts(), loadWrites(), loadAudits()]);
    setLoading(false);
  };

  useEffect(() => { refreshAll(); /* eslint-disable-next-line */ }, []);
  useEffect(() => { loadAlerts(); /* eslint-disable-next-line */ }, [severityFilter, hoursFilter]);

  const toggleKill = async (next: boolean) => {
    if (!reason.trim()) {
      toast.error("Phải nhập lý do trước khi đổi kill switch");
      return;
    }
    const { error } = await supabase.rpc("set_wallet_kill_switch", { _enabled: next, _reason: reason.trim() });
    if (error) return toast.error(error.message);
    toast.success(next ? "Đã BẬT cập nhật ví" : "Đã TẮT cập nhật ví (kill switch ON)");
    setReason("");
    refreshAll();
  };

  const toggleStrict = async (next: boolean) => {
    if (!reason.trim()) {
      toast.error("Phải nhập lý do trước khi đổi strict mode");
      return;
    }
    const { error } = await supabase.rpc("set_wallet_strict_mode", { _enabled: next, _reason: reason.trim() });
    if (error) return toast.error(error.message);
    toast.success(next ? "Đã BẬT strict mode (chặn writer ngoài allowlist)" : "Đã TẮT strict mode (chỉ monitor)");
    setReason("");
    refreshAll();
  };

  const blockedCount = useMemo(() => writes.filter(w => w.blocked).length, [writes]);

  return (
    <div className="space-y-6">
      {/* Status + Controls */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <ShieldAlert className="w-5 h-5 text-orange-500" />
            Bảo vệ ví — Trạng thái & điều khiển
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <Input
            placeholder="Lý do thay đổi (bắt buộc, lưu vào audit)"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
          />

          <div className="flex items-center justify-between p-3 rounded-lg border">
            <div className="flex items-center gap-3">
              <Power className={killEnabled ? "text-green-500" : "text-red-500"} />
              <div>
                <div className="font-semibold">Cập nhật ví (Kill Switch)</div>
                <div className="text-xs text-muted-foreground">
                  {killEnabled ? "Đang BẬT — cho phép update 4 cột ví" : "Đang TẮT — chặn mọi update ví"}
                </div>
              </div>
            </div>
            <Switch
              checked={killEnabled ?? false}
              onCheckedChange={toggleKill}
              disabled={killEnabled === null}
            />
          </div>

          <div className="flex items-center justify-between p-3 rounded-lg border">
            <div className="flex items-center gap-3">
              <Lock className={strict ? "text-orange-500" : "text-slate-400"} />
              <div>
                <div className="font-semibold">Strict Mode (Allowlist)</div>
                <div className="text-xs text-muted-foreground">
                  {strict
                    ? "BẬT — chỉ edge function trong allowlist (khai báo app.wallet_writer) mới được ghi"
                    : "TẮT — chỉ monitor + log, không chặn"}
                </div>
              </div>
            </div>
            <Switch
              checked={strict ?? false}
              onCheckedChange={toggleStrict}
              disabled={strict === null}
            />
          </div>

          <Button variant="outline" size="sm" onClick={refreshAll} disabled={loading}>
            <RefreshCw className={`w-4 h-4 mr-2 ${loading ? "animate-spin" : ""}`} />
            Làm mới
          </Button>
        </CardContent>
      </Card>

      {/* Alerts */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center justify-between">
            <span className="flex items-center gap-2">
              <AlertTriangle className="w-5 h-5 text-yellow-500" />
              Cảnh báo bulk update ({alerts.length})
            </span>
            <div className="flex items-center gap-2">
              <Select value={hoursFilter} onValueChange={setHoursFilter}>
                <SelectTrigger className="w-32"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="1">1 giờ</SelectItem>
                  <SelectItem value="24">24 giờ</SelectItem>
                  <SelectItem value="168">7 ngày</SelectItem>
                  <SelectItem value="720">30 ngày</SelectItem>
                  <SelectItem value="8760">1 năm</SelectItem>
                </SelectContent>
              </Select>
              <Select value={severityFilter} onValueChange={setSeverityFilter}>
                <SelectTrigger className="w-32"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Tất cả</SelectItem>
                  <SelectItem value="critical">Critical</SelectItem>
                  <SelectItem value="high">High</SelectItem>
                  <SelectItem value="medium">Medium</SelectItem>
                  <SelectItem value="low">Low</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Thời gian</TableHead>
                  <TableHead>Severity</TableHead>
                  <TableHead>Số profile</TableHead>
                  <TableHead>App</TableHead>
                  <TableHead>Session user</TableHead>
                  <TableHead>IP</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {alerts.length === 0 && (
                  <TableRow><TableCell colSpan={6} className="text-center text-muted-foreground py-6">Không có cảnh báo</TableCell></TableRow>
                )}
                {alerts.map((a) => (
                  <TableRow key={a.id}>
                    <TableCell className="text-xs">{new Date(a.created_at).toLocaleString("vi-VN")}</TableCell>
                    <TableCell>
                      <Badge className={severityBadge[a.severity] ?? ""}>{a.severity}</Badge>
                    </TableCell>
                    <TableCell className="font-mono">{a.affected_count}</TableCell>
                    <TableCell className="text-xs">{a.application_name ?? "-"}</TableCell>
                    <TableCell className="text-xs">{a.db_session_user ?? "-"}</TableCell>
                    <TableCell className="text-xs font-mono">{a.client_addr ?? "-"}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      {/* Writer Audit */}
      <Card>
        <CardHeader>
          <CardTitle>
            Nhật ký ghi ví (100 dòng mới nhất){" "}
            {blockedCount > 0 && <Badge className="bg-red-600 text-white ml-2">{blockedCount} bị chặn</Badge>}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Thời gian</TableHead>
                  <TableHead>Cột</TableHead>
                  <TableHead>Writer tag</TableHead>
                  <TableHead>Allowed</TableHead>
                  <TableHead>Blocked</TableHead>
                  <TableHead>App</TableHead>
                  <TableHead>IP</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {writes.length === 0 && (
                  <TableRow><TableCell colSpan={7} className="text-center text-muted-foreground py-6">Chưa có ghi nhận</TableCell></TableRow>
                )}
                {writes.map((w) => (
                  <TableRow key={w.id} className={w.blocked ? "bg-red-50 dark:bg-red-950/30" : ""}>
                    <TableCell className="text-xs">{new Date(w.occurred_at).toLocaleString("vi-VN")}</TableCell>
                    <TableCell className="text-xs font-mono">{w.column_name}</TableCell>
                    <TableCell className="text-xs">{w.writer_tag ?? <span className="text-red-500 italic">(none)</span>}</TableCell>
                    <TableCell>{w.is_allowed ? "✅" : "⚠️"}</TableCell>
                    <TableCell>{w.blocked ? <Badge className="bg-red-600 text-white">BLOCKED</Badge> : "—"}</TableCell>
                    <TableCell className="text-xs">{w.application_name ?? "-"}</TableCell>
                    <TableCell className="text-xs font-mono">{w.client_addr ?? "-"}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      {/* Settings audit */}
      <Card>
        <CardHeader>
          <CardTitle>Nhật ký bật/tắt thiết lập bảo vệ</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Thời gian</TableHead>
                  <TableHead>Setting</TableHead>
                  <TableHead>Old → New</TableHead>
                  <TableHead>Admin</TableHead>
                  <TableHead>Lý do</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {audits.length === 0 && (
                  <TableRow><TableCell colSpan={5} className="text-center text-muted-foreground py-6">Chưa có thay đổi</TableCell></TableRow>
                )}
                {audits.map((a) => (
                  <TableRow key={a.id}>
                    <TableCell className="text-xs">{new Date(a.changed_at).toLocaleString("vi-VN")}</TableCell>
                    <TableCell className="text-xs font-mono">{a.setting_key}</TableCell>
                    <TableCell className="text-xs">{a.old_value ?? "∅"} → <strong>{a.new_value}</strong></TableCell>
                    <TableCell className="text-xs font-mono">{a.changed_by.slice(0, 8)}…</TableCell>
                    <TableCell className="text-xs">{a.reason ?? "-"}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

export default WalletSecurityTab;

import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Ban, RefreshCw, Search, ShieldOff, Clock, ExternalLink } from "lucide-react";
import { toast } from "sonner";
import { Link } from "react-router-dom";

interface BannedRow {
  id: string;
  username: string | null;
  full_name: string | null;
  avatar_url: string | null;
  banned_at: string | null;
  ban_reason: string | null;
}

function timeAgo(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso).getTime();
  const diff = Date.now() - d;
  const s = Math.floor(diff / 1000);
  if (s < 60) return `${s}s trước`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m} phút trước`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h} giờ trước`;
  const day = Math.floor(h / 24);
  if (day < 30) return `${day} ngày trước`;
  const mo = Math.floor(day / 30);
  if (mo < 12) return `${mo} tháng trước`;
  return `${Math.floor(mo / 12)} năm trước`;
}

export default function BannedUsersTab() {
  const [rows, setRows] = useState<BannedRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState("");
  const [target, setTarget] = useState<BannedRow | null>(null);
  const [busy, setBusy] = useState(false);

  const load = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("admin_profiles_moderation")
      .select("id, username, full_name, avatar_url, banned_at, ban_reason")
      .eq("is_banned", true)
      .order("banned_at", { ascending: false, nullsFirst: false })
      .limit(500);
    if (error) {
      toast.error("Không tải được danh sách bị chặn: " + error.message);
    } else {
      setRows((data ?? []) as BannedRow[]);
    }
    setLoading(false);
  };

  useEffect(() => {
    load();
  }, []);

  const filtered = useMemo(() => {
    const k = q.trim().toLowerCase();
    if (!k) return rows;
    return rows.filter(
      (r) =>
        r.username?.toLowerCase().includes(k) ||
        r.full_name?.toLowerCase().includes(k) ||
        r.ban_reason?.toLowerCase().includes(k),
    );
  }, [rows, q]);

  const handleUnban = async () => {
    if (!target) return;
    setBusy(true);
    const { data: auth } = await supabase.auth.getUser();
    const adminId = auth.user?.id;
    if (!adminId) {
      setBusy(false);
      toast.error("Không xác thực được admin");
      return;
    }
    const { error } = await supabase.rpc("unban_user", {
      p_admin_id: adminId,
      p_user_id: target.id,
      p_reason: "Unbanned from Banned Users tab",
    });
    setBusy(false);
    if (error) {
      toast.error("Bỏ chặn thất bại: " + error.message);
      return;
    }
    toast.success(`Đã bỏ chặn @${target.username ?? target.id.slice(0, 8)}`);
    setRows((prev) => prev.filter((r) => r.id !== target.id));
    setTarget(null);
  };

  return (
    <Card>
      <CardHeader>
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div>
            <CardTitle className="flex items-center gap-2">
              <Ban className="w-5 h-5 text-destructive" />
              Người dùng bị chặn
              <Badge variant="secondary" className="ml-2">
                {rows.length}
              </Badge>
            </CardTitle>
            <p className="text-sm text-muted-foreground mt-1">
              Danh sách tài khoản đang bị chặn trên fun.rich, kèm lý do và thời điểm chặn.
            </p>
          </div>
          <Button variant="outline" size="sm" onClick={load} disabled={loading} className="gap-2">
            <RefreshCw className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} />
            Tải lại
          </Button>
        </div>
        <div className="relative mt-4">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Tìm theo username, họ tên, hoặc lý do…"
            className="pl-9"
          />
        </div>
      </CardHeader>
      <CardContent>
        {loading ? (
          <div className="py-12 text-center text-muted-foreground">Đang tải…</div>
        ) : filtered.length === 0 ? (
          <div className="py-12 text-center text-muted-foreground">
            {rows.length === 0 ? "Chưa có ai bị chặn." : "Không tìm thấy kết quả phù hợp."}
          </div>
        ) : (
          <div className="space-y-3">
            {filtered.map((u) => (
              <div
                key={u.id}
                className="flex flex-col sm:flex-row sm:items-center gap-3 p-4 rounded-lg border bg-card/50"
              >
                <Avatar className="w-12 h-12 shrink-0">
                  <AvatarImage src={u.avatar_url ?? undefined} alt={u.username ?? "user"} />
                  <AvatarFallback>{(u.username ?? "?").slice(0, 2).toUpperCase()}</AvatarFallback>
                </Avatar>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-semibold truncate">
                      {u.full_name || u.username || u.id.slice(0, 8)}
                    </span>
                    {u.username && (
                      <Link
                        to={`/${u.username}`}
                        target="_blank"
                        rel="noreferrer"
                        className="text-xs text-muted-foreground hover:text-primary inline-flex items-center gap-1"
                      >
                        @{u.username}
                        <ExternalLink className="w-3 h-3" />
                      </Link>
                    )}
                    <Badge variant="destructive" className="gap-1">
                      <ShieldOff className="w-3 h-3" />
                      Bị chặn
                    </Badge>
                  </div>
                  <div className="text-sm text-muted-foreground mt-1 break-words">
                    <span className="font-medium text-foreground">Lý do:</span>{" "}
                    {u.ban_reason || <span className="italic">(không ghi nhận)</span>}
                  </div>
                  <div className="flex items-center gap-1 text-xs text-muted-foreground mt-1">
                    <Clock className="w-3 h-3" />
                    Chặn lúc:{" "}
                    {u.banned_at ? (
                      <>
                        <span className="font-mono">
                          {new Date(u.banned_at).toLocaleString("vi-VN")}
                        </span>
                        <span>· {timeAgo(u.banned_at)}</span>
                      </>
                    ) : (
                      "—"
                    )}
                    <span className="ml-2 italic">
                      · Vô thời hạn cho đến khi admin bỏ chặn
                    </span>
                  </div>
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setTarget(u)}
                  className="shrink-0"
                >
                  Bỏ chặn
                </Button>
              </div>
            ))}
          </div>
        )}
      </CardContent>

      <AlertDialog open={!!target} onOpenChange={(o) => !o && setTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              Bỏ chặn @{target?.username ?? target?.id.slice(0, 8)}?
            </AlertDialogTitle>
            <AlertDialogDescription>
              Tài khoản sẽ hoạt động trở lại, ví được gỡ khỏi blacklist (nếu có). Hành động được ghi
              audit log.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={busy}>Hủy</AlertDialogCancel>
            <AlertDialogAction onClick={handleUnban} disabled={busy}>
              {busy ? "Đang xử lý…" : "Bỏ chặn"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Card>
  );
}

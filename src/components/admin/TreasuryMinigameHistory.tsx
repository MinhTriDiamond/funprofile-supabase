import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Gamepad2, ChevronLeft, ChevronRight, RefreshCw, ExternalLink } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";

type Order = {
  id: string;
  source: "pet_shop" | "mystery_box";
  user_id: string;
  username: string | null;
  full_name: string | null;
  item_name: string;
  item_code: string | null;
  price_camly: number;
  tx_hash: string | null;
  status: string;
  from_address: string | null;
  created_at: string;
  confirmed_at: string | null;
  expires_at: string | null;
  failure_reason: string | null;
};

type Resp = {
  orders: Order[];
  summary: { total: number; confirmed: number; revenue_camly: number };
  total_count: number;
};

export default function TreasuryMinigameHistory() {
  const [source, setSource] = useState<"all" | "pet_shop" | "mystery_box">("all");
  const [statusFilter, setStatusFilter] = useState("all");
  const [dateRange, setDateRange] = useState("30d");
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState<Resp | null>(null);
  const limit = 30;

  const fetchData = async (p = 1) => {
    setLoading(true);
    try {
      const { data: result, error } = await supabase.functions.invoke("treasury-minigame-history", {
        body: {
          source,
          status_filter: statusFilter === "all" ? "" : statusFilter,
          date_range: dateRange,
          page: p,
          limit,
        },
      });
      if (error) throw error;
      setData(result);
      setPage(p);
    } catch (err: any) {
      toast.error("Lỗi tải: " + (err?.message || "Unknown"));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData(1);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [source, statusFilter, dateRange]);

  const totalPages = data ? Math.max(1, Math.ceil(data.total_count / limit)) : 1;
  const fmtCamly = (n: number) =>
    n.toLocaleString("vi-VN", { maximumFractionDigits: 0 }) + " CAMLY";
  const fmtDate = (d: string | null) =>
    d ? new Date(d).toLocaleString("vi-VN", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" }) : "—";
  const shortHash = (h: string | null) => h ? `${h.slice(0, 6)}…${h.slice(-4)}` : "—";

  const statusBadge = (s: string) => {
    if (s === "confirmed") return <Badge className="bg-green-600">Đã xác nhận</Badge>;
    if (s === "pending") return <Badge variant="secondary">Đang chờ</Badge>;
    if (s === "failed") return <Badge variant="destructive">Thất bại</Badge>;
    if (s === "expired") return <Badge variant="outline">Hết hạn</Badge>;
    return <Badge variant="outline">{s}</Badge>;
  };

  const sourceBadge = (s: string) =>
    s === "pet_shop"
      ? <Badge variant="outline" className="bg-purple-50 text-purple-700 border-purple-300">Pet Shop</Badge>
      : <Badge variant="outline" className="bg-amber-50 text-amber-700 border-amber-300">Mystery Box</Badge>;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Gamepad2 className="w-5 h-5 text-primary" />
          Lịch sử giao dịch mini game
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Filters */}
        <div className="flex flex-col sm:flex-row gap-3 flex-wrap">
          <Tabs value={source} onValueChange={(v) => setSource(v as any)}>
            <TabsList>
              <TabsTrigger value="all">Tất cả</TabsTrigger>
              <TabsTrigger value="pet_shop">Pet Shop</TabsTrigger>
              <TabsTrigger value="mystery_box">Mystery Box</TabsTrigger>
            </TabsList>
          </Tabs>
          <div className="flex gap-2 flex-wrap">
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="w-[150px]"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Mọi trạng thái</SelectItem>
                <SelectItem value="confirmed">Đã xác nhận</SelectItem>
                <SelectItem value="pending">Đang chờ</SelectItem>
                <SelectItem value="failed">Thất bại</SelectItem>
                <SelectItem value="expired">Hết hạn</SelectItem>
              </SelectContent>
            </Select>
            <Select value={dateRange} onValueChange={setDateRange}>
              <SelectTrigger className="w-[130px]"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="7d">7 ngày</SelectItem>
                <SelectItem value="30d">30 ngày</SelectItem>
                <SelectItem value="90d">90 ngày</SelectItem>
                <SelectItem value="all">Tất cả</SelectItem>
              </SelectContent>
            </Select>
            <Button variant="outline" size="icon" onClick={() => fetchData(page)} disabled={loading}>
              <RefreshCw className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} />
            </Button>
          </div>
        </div>

        {/* Summary cards */}
        {data && (
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <Card><CardContent className="py-3">
              <div className="text-xs text-muted-foreground">Tổng đơn</div>
              <div className="text-2xl font-bold">{data.summary.total.toLocaleString("vi-VN")}</div>
            </CardContent></Card>
            <Card><CardContent className="py-3">
              <div className="text-xs text-muted-foreground">Đã xác nhận</div>
              <div className="text-2xl font-bold text-green-600">{data.summary.confirmed.toLocaleString("vi-VN")}</div>
            </CardContent></Card>
            <Card><CardContent className="py-3">
              <div className="text-xs text-muted-foreground">Doanh thu CAMLY</div>
              <div className="text-2xl font-bold text-primary">{fmtCamly(data.summary.revenue_camly)}</div>
            </CardContent></Card>
          </div>
        )}

        {/* Table */}
        {data?.orders && (
          <>
            <div className="max-h-[600px] overflow-auto border rounded-lg">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-10">#</TableHead>
                    <TableHead>Nguồn</TableHead>
                    <TableHead>User</TableHead>
                    <TableHead>Mặt hàng</TableHead>
                    <TableHead className="text-right">Giá</TableHead>
                    <TableHead>TX Hash</TableHead>
                    <TableHead>Trạng thái</TableHead>
                    <TableHead>Thời gian</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {data.orders.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={8} className="text-center text-muted-foreground py-8">
                        Chưa có giao dịch nào trong khoảng này.
                      </TableCell>
                    </TableRow>
                  )}
                  {data.orders.map((o, i) => {
                    const isOverdue = o.status === "pending" && o.expires_at && new Date(o.expires_at) < new Date();
                    const rowCls = o.status === "failed"
                      ? "bg-destructive/5"
                      : isOverdue
                      ? "bg-amber-500/5"
                      : "";
                    return (
                      <TableRow key={`${o.source}-${o.id}`} className={rowCls}>
                        <TableCell className="text-xs">{(page - 1) * limit + i + 1}</TableCell>
                        <TableCell>{sourceBadge(o.source)}</TableCell>
                        <TableCell className="text-xs">
                          {o.username ? (
                            <a href={`/u/${o.username}`} target="_blank" rel="noreferrer" className="hover:underline font-medium">
                              @{o.username}
                            </a>
                          ) : (
                            <span className="text-muted-foreground">{o.user_id.slice(0, 8)}…</span>
                          )}
                          {o.full_name && <div className="text-[10px] text-muted-foreground">{o.full_name}</div>}
                        </TableCell>
                        <TableCell className="text-xs">{o.item_name}</TableCell>
                        <TableCell className="text-xs text-right font-mono">{fmtCamly(o.price_camly)}</TableCell>
                        <TableCell className="text-xs font-mono">
                          {o.tx_hash ? (
                            <a
                              href={`https://bscscan.com/tx/${o.tx_hash}`}
                              target="_blank"
                              rel="noreferrer"
                              className="text-primary hover:underline inline-flex items-center gap-1"
                            >
                              {shortHash(o.tx_hash)}
                              <ExternalLink className="w-3 h-3" />
                            </a>
                          ) : "—"}
                        </TableCell>
                        <TableCell>
                          {statusBadge(o.status)}
                          {o.failure_reason && (
                            <div className="text-[10px] text-destructive mt-1">{o.failure_reason}</div>
                          )}
                        </TableCell>
                        <TableCell className="text-xs whitespace-nowrap">{fmtDate(o.created_at)}</TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>

            <div className="flex items-center justify-between text-sm">
              <span className="text-muted-foreground">
                Trang {page}/{totalPages} ({data.total_count} đơn)
              </span>
              <div className="flex gap-2">
                <Button variant="outline" size="sm" disabled={page <= 1 || loading} onClick={() => fetchData(page - 1)}>
                  <ChevronLeft className="w-4 h-4" />
                </Button>
                <Button variant="outline" size="sm" disabled={page >= totalPages || loading} onClick={() => fetchData(page + 1)}>
                  <ChevronRight className="w-4 h-4" />
                </Button>
              </div>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}

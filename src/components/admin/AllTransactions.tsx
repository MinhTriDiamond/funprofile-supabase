import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { List, ChevronLeft, ChevronRight } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";

const AllTransactions = () => {
  const [loading, setLoading] = useState(false);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- dynamic edge function response
  const [data, setData] = useState<any>(null);
  const [page, setPage] = useState(1);
  const [statusFilter, setStatusFilter] = useState("all");
  const [tokenFilter, setTokenFilter] = useState("all");
  const limit = 30;

  const fetchData = async (p: number = page) => {
    setLoading(true);
    try {
      const { data: result, error } = await supabase.functions.invoke("list-all-transactions", {
        body: { page: p, limit, status_filter: statusFilter === "all" ? "" : statusFilter, token_filter: tokenFilter === "all" ? "" : tokenFilter },
      });
      if (error) throw error;
      setData(result);
      setPage(p);
    } catch (err: unknown) {
      toast.error("Lỗi: " + (err instanceof Error ? err.message : "Unknown"));
    } finally {
      setLoading(false);
    }
  };

  const shortenHash = (h: string) => h ? `${h.slice(0, 6)}...${h.slice(-4)}` : "—";
  const formatDate = (d: string) =>
    d ? new Date(d).toLocaleDateString("vi-VN", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" }) : "—";

  const totalPages = data ? Math.ceil(data.total_count / limit) : 0;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <List className="w-5 h-5 text-purple-500" />
          Toàn bộ Transactions ({data?.total_count ?? "..."})
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex gap-2 flex-wrap items-end">
          <div className="space-y-1">
            <span className="text-xs text-muted-foreground">Trạng thái</span>
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="w-[140px]">
                <SelectValue placeholder="Tất cả" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Tất cả</SelectItem>
                <SelectItem value="confirmed">Confirmed</SelectItem>
                <SelectItem value="pending">Pending</SelectItem>
                <SelectItem value="failed">Failed</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <span className="text-xs text-muted-foreground">Token</span>
            <Select value={tokenFilter} onValueChange={setTokenFilter}>
              <SelectTrigger className="w-[120px]">
                <SelectValue placeholder="Tất cả" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Tất cả</SelectItem>
                <SelectItem value="BNB">BNB</SelectItem>
                <SelectItem value="USDT">USDT</SelectItem>
                <SelectItem value="BTCB">BTCB</SelectItem>
                <SelectItem value="FUN">FUN</SelectItem>
                <SelectItem value="CAMLY">CAMLY</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <Button onClick={() => fetchData(1)} disabled={loading} className="gap-2">
            <List className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} />
            {loading ? "Đang tải..." : "Tải dữ liệu"}
          </Button>
        </div>

        {data?.transactions && (
          <>
            <div className="max-h-[500px] overflow-auto border rounded-lg">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-10">#</TableHead>
                    <TableHead>Người gửi</TableHead>
                    <TableHead>Số tiền</TableHead>
                    <TableHead>Token</TableHead>
                    <TableHead>TX Hash</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Donation</TableHead>
                    <TableHead>Post</TableHead>
                    <TableHead>Thời gian</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {data.transactions.map((tx: any, i: number) => (
                    <TableRow
                      key={tx.id}
                      className={
                        !tx.has_donation
                          ? "bg-destructive/5"
                          : !tx.has_post
                          ? "bg-amber-500/5"
                          : ""
                      }
                    >
                      <TableCell className="text-xs">{(page - 1) * limit + i + 1}</TableCell>
                      <TableCell className="text-xs font-medium">
                        {tx.sender_username ? `@${tx.sender_username}` : tx.from_address?.slice(0, 8) + "..."}
                      </TableCell>
                      <TableCell className="text-xs" title={tx.amount_normalized ? `raw: ${tx.amount}` : undefined}>
                        {tx.amount_normalized ?? tx.amount}
                      </TableCell>
                      <TableCell className="text-xs">{tx.token_symbol}</TableCell>
                      <TableCell className="text-xs font-mono">{shortenHash(tx.tx_hash)}</TableCell>
                      <TableCell className="text-xs">{tx.status}</TableCell>
                      <TableCell className="text-xs">
                        {tx.has_donation ? <span className="text-green-600">✅</span> : <span className="text-destructive">❌</span>}
                      </TableCell>
                      <TableCell className="text-xs">
                        {tx.has_post ? <span className="text-green-600">✅</span> : <span className="text-destructive">❌</span>}
                      </TableCell>
                      <TableCell className="text-xs">{formatDate(tx.created_at)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>

            {/* Pagination */}
            <div className="flex items-center justify-between text-sm">
              <span className="text-muted-foreground">
                Trang {page}/{totalPages} ({data.total_count} giao dịch)
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
};

export default AllTransactions;

import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { RefreshCw, PlayCircle, Loader2 } from "lucide-react";
import SwapFailuresBadge from "@/components/admin/SwapFailuresBadge";


interface Run {
  id: string;
  chain: string;
  trigger: string;
  status: string;
  wallets_scanned: number;
  txs_found: number;
  txs_backfilled: number;
  errors: number;
  started_at: string;
  finished_at: string | null;
}

export default function WalletReconciliationTab() {
  const [runs, setRuns] = useState<Run[]>([]);
  const [loading, setLoading] = useState(false);
  const [running, setRunning] = useState(false);

  const load = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("wallet_reconciliation_runs")
      .select("*")
      .order("started_at", { ascending: false })
      .limit(25);
    if (error) toast.error(error.message);
    else setRuns((data as Run[]) ?? []);
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const runNow = async () => {
    setRunning(true);
    try {
      const { data, error } = await supabase.functions.invoke("wallet-reconciliation-cron", {
        // BTC_FEATURE_FROZEN 03/09/2026 — nhánh BTC đã dừng, chỉ còn USDT/BNB.
        body: { chains: ["bep20_usdt", "bnb"] },
      });

      if (error) throw error;
      toast.success(`Đối soát xong: quét ${data.wallets_scanned} ví, backfill ${data.txs_backfilled} tx, lỗi ${data.errors}`);
      load();
    } catch (e: any) {
      toast.error(e.message ?? "Lỗi khi chạy đối soát");
    } finally {
      setRunning(false);
    }
  };

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0">
        <div>
          <CardTitle>Đối soát ví đa chuỗi</CardTitle>
          <p className="text-sm text-muted-foreground mt-1">
            Cron 30 phút/lần quét Father + toàn user, tự backfill BTC/USDT/BNB thiếu.
          </p>
          <div className="mt-2"><SwapFailuresBadge /></div>
        </div>

        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={load} disabled={loading}>
            <RefreshCw className={`w-4 h-4 mr-2 ${loading ? "animate-spin" : ""}`} />
            Tải lại
          </Button>
          <Button size="sm" onClick={runNow} disabled={running}>
            {running ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <PlayCircle className="w-4 h-4 mr-2" />}
            Chạy ngay
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-left text-muted-foreground">
              <tr className="border-b">
                <th className="py-2 pr-3">Bắt đầu</th>
                <th className="py-2 pr-3">Trigger</th>
                <th className="py-2 pr-3">Trạng thái</th>
                <th className="py-2 pr-3 text-right">Ví quét</th>
                <th className="py-2 pr-3 text-right">Tx tìm</th>
                <th className="py-2 pr-3 text-right">Backfilled</th>
                <th className="py-2 pr-3 text-right">Lỗi</th>
              </tr>
            </thead>
            <tbody>
              {runs.map((r) => (
                <tr key={r.id} className="border-b">
                  <td className="py-2 pr-3 font-mono text-xs">{new Date(r.started_at).toLocaleString("vi-VN")}</td>
                  <td className="py-2 pr-3"><Badge variant="outline">{r.trigger}</Badge></td>
                  <td className="py-2 pr-3">
                    <Badge variant={r.status === "done" ? "default" : r.status === "failed" ? "destructive" : "secondary"}>
                      {r.status}
                    </Badge>
                  </td>
                  <td className="py-2 pr-3 text-right">{r.wallets_scanned}</td>
                  <td className="py-2 pr-3 text-right">{r.txs_found}</td>
                  <td className="py-2 pr-3 text-right text-emerald-600 font-semibold">{r.txs_backfilled}</td>
                  <td className="py-2 pr-3 text-right text-rose-600">{r.errors}</td>
                </tr>
              ))}
              {!runs.length && !loading && (
                <tr><td colSpan={7} className="py-8 text-center text-muted-foreground">Chưa có lần chạy nào.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </CardContent>
    </Card>
  );
}

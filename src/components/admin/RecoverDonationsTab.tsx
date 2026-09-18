import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { ArrowDownLeft, ArrowUpRight, Loader2, Search, ShieldCheck, RefreshCw } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { UsdRepricingCard } from "./UsdRepricingCard";

interface Candidate {
  tx_hash: string;
  amount: string;
  token: string;
  counterparty: string;
  direction: "sent" | "received";
}

interface ScanResult {
  success: boolean;
  user_id: string;
  wallets: string[];
  block_range: { from: number; to: number; days: number };
  on_chain_transfers: number;
  missing_donations?: number;
  missing_transfers?: number;
  candidates_total?: number;
  inserted_count?: number;
  errors_count?: number;
  candidates?: Candidate[];
  inserted?: Candidate[];
  errors?: string[];
}

export function RecoverDonationsTab() {
  const [userIdOrUsername, setUserIdOrUsername] = useState("");
  const [days, setDays] = useState(7);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<ScanResult | null>(null);
  const [resolvedUserId, setResolvedUserId] = useState<string>("");

  const resolveUser = async (input: string): Promise<string | null> => {
    const trimmed = input.trim();
    if (!trimmed) return null;
    // Already a UUID?
    if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(trimmed)) {
      return trimmed;
    }
    // Lookup by username
    const { data } = await supabase
      .from("profiles")
      .select("id")
      .eq("username", trimmed.replace(/^@/, ""))
      .maybeSingle();
    return data?.id ?? null;
  };

  const runScan = async (dryRun: boolean) => {
    setLoading(true);
    setResult(null);
    try {
      const userId = await resolveUser(userIdOrUsername);
      if (!userId) {
        toast.error("Không tìm thấy user. Nhập User ID hoặc username.");
        return;
      }
      setResolvedUserId(userId);

      const { data, error } = await supabase.functions.invoke("recover-donations-from-chain", {
        body: { user_id: userId, days, dry_run: dryRun },
      });
      if (error) {
        toast.error(`Lỗi: ${error.message}`);
        return;
      }
      const res = data as ScanResult;
      setResult(res);

      if (dryRun) {
        const missing = (res.missing_donations ?? 0) + (res.missing_transfers ?? 0);
        if (missing === 0) {
          toast.success(`Quét xong! Không có giao dịch nào bị thiếu.`);
        } else {
          toast.success(`Tìm thấy ${missing} giao dịch chưa được ghi nhận (${res.missing_donations ?? 0} quà + ${res.missing_transfers ?? 0} chuyển ví).`);
        }
      } else {
        toast.success(`Đã hồi phục ${res.inserted_count ?? 0} giao dịch.`);
      }
    } catch (err) {
      toast.error(`Lỗi: ${(err as Error).message}`);
    } finally {
      setLoading(false);
    }
  };

  const candidates = result?.candidates ?? result?.inserted ?? [];

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <ShieldCheck className="w-5 h-5 text-emerald-600" />
          Khôi phục giao dịch bị thiếu
        </CardTitle>
        <p className="text-sm text-muted-foreground">
          Quét trực tiếp trên BSC blockchain để tìm các giao dịch tặng quà đã thực hiện
          on-chain nhưng chưa được ghi vào hệ thống (do mất mạng, đóng app sớm...).
        </p>
      </CardHeader>
      <CardContent className="space-y-4">
        <Alert>
          <AlertDescription className="text-xs">
            <strong>Cách dùng:</strong> Nhập User ID hoặc username → bấm <em>"Quét thử"</em> để
            xem trước → kiểm tra danh sách → bấm <em>"Hồi phục"</em> để ghi vào DB.
            Function chỉ hồi phục các giao dịch có <strong>cả 2 bên đều là user trong hệ thống</strong>.
          </AlertDescription>
        </Alert>

        <div className="grid grid-cols-1 sm:grid-cols-[1fr_120px_auto_auto] gap-2">
          <div>
            <Label className="text-xs">User ID hoặc username</Label>
            <Input
              value={userIdOrUsername}
              onChange={(e) => setUserIdOrUsername(e.target.value)}
              placeholder="tranhai hoặc d2493307-..."
              disabled={loading}
            />
          </div>
          <div>
            <Label className="text-xs">Số ngày quét</Label>
            <Input
              type="number"
              min={1}
              max={365}
              value={days}
              onChange={(e) => setDays(Math.max(1, Math.min(365, Number(e.target.value) || 7)))}
              disabled={loading}
            />
          </div>
          <div className="flex items-end">
            <Button
              variant="outline"
              onClick={() => runScan(true)}
              disabled={loading || !userIdOrUsername.trim()}
              className="w-full sm:w-auto"
            >
              {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Search className="w-4 h-4" />}
              <span className="ml-1">Quét thử</span>
            </Button>
          </div>
          <div className="flex items-end">
            <Button
              onClick={() => runScan(false)}
              disabled={loading || !userIdOrUsername.trim() || !result || ((result.missing_donations ?? 0) + (result.missing_transfers ?? 0)) === 0}
              className="w-full sm:w-auto bg-emerald-600 hover:bg-emerald-700"
            >
              {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
              <span className="ml-1">Hồi phục</span>
            </Button>
          </div>
        </div>

        {result && (
          <div className="space-y-3 mt-4">
            <div className="flex flex-wrap gap-2 text-xs">
              <Badge variant="outline">Ví: {result.wallets.length}</Badge>
              <Badge variant="outline">Khối: {result.block_range.from} → {result.block_range.to}</Badge>
              <Badge variant="outline">Khoảng: {result.block_range.days} ngày</Badge>
              <Badge variant="secondary">Tổng on-chain: {result.on_chain_transfers}</Badge>
              {result.missing_donations !== undefined && (
                <Badge className="bg-amber-500">Quà thiếu: {result.missing_donations}</Badge>
              )}
              {result.missing_transfers !== undefined && (
                <Badge className="bg-amber-500">Chuyển ví thiếu: {result.missing_transfers}</Badge>
              )}
              {result.inserted_count !== undefined && (
                <Badge className="bg-emerald-600">Đã hồi phục: {result.inserted_count}</Badge>
              )}
              {result.errors_count ? (
                <Badge variant="destructive">Lỗi: {result.errors_count}</Badge>
              ) : null}
            </div>

            {candidates.length > 0 && (
              <div className="border rounded-lg overflow-hidden">
                <div className="bg-muted/40 px-3 py-2 text-xs font-semibold">
                  {result.inserted ? "Đã hồi phục" : "Sẽ hồi phục"} ({candidates.length})
                </div>
                <div className="divide-y max-h-[400px] overflow-y-auto">
                  {candidates.map((c, i) => (
                    <div key={i} className="px-3 py-2 flex items-center gap-2 text-xs">
                      {c.direction === "sent" ? (
                        <ArrowUpRight className="w-3.5 h-3.5 text-red-500 flex-shrink-0" />
                      ) : (
                        <ArrowDownLeft className="w-3.5 h-3.5 text-green-500 flex-shrink-0" />
                      )}
                      <span className={c.direction === "sent" ? "text-red-600 font-semibold" : "text-green-600 font-semibold"}>
                        {c.amount} {c.token}
                      </span>
                      <span className="text-muted-foreground">
                        {c.direction === "sent" ? "→" : "←"} {c.counterparty}
                      </span>
                      <a
                        href={`https://bscscan.com/tx/${c.tx_hash}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="ml-auto text-blue-500 hover:underline truncate max-w-[160px]"
                      >
                        {c.tx_hash.slice(0, 10)}...{c.tx_hash.slice(-6)}
                      </a>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {result.errors && result.errors.length > 0 && (
              <Alert variant="destructive">
                <AlertDescription className="text-xs">
                  <strong>Lỗi mẫu:</strong>
                  <ul className="mt-1 list-disc list-inside">
                    {result.errors.map((e, i) => <li key={i}>{e}</li>)}
                  </ul>
                </AlertDescription>
              </Alert>
            )}
          </div>
        )}

        {resolvedUserId && (
          <p className="text-[10px] text-muted-foreground">User ID đã resolve: {resolvedUserId}</p>
        )}
      </CardContent>
      <CardContent className="border-t pt-4">
        <UsdRepricingCard />
      </CardContent>
    </Card>
  );
}

export default RecoverDonationsTab;

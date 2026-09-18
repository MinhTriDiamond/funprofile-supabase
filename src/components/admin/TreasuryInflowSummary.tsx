import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { TrendingUp, AlertTriangle, CheckCircle2, PackageOpen, Sparkles } from "lucide-react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";

interface OverviewData {
  treasury_address: string;
  onchain_camly: number;
  inflows: {
    pet_shop: { d7: { sum: number; count: number }; d30: { sum: number; count: number }; d90: { sum: number; count: number }; all: { sum: number; count: number } };
    mystery_box: { d7: { sum: number; count: number }; d30: { sum: number; count: number }; d90: { sum: number; count: number }; all: { sum: number; count: number } };
    total_all_time: number;
  };
  outflows: { total_all_time: number };
  ledger: { expected_onchain: number; actual_onchain: number; drift: number; drift_pct: number; is_healthy: boolean };
  top_spenders: Array<{ user_id: string; total_camly: number; username?: string; full_name?: string; avatar_url?: string }>;
}

const fmt = (n: number) => Math.round(n).toLocaleString("vi-VN");

export default function TreasuryInflowSummary() {
  const { data, isLoading } = useQuery({
    queryKey: ["treasury-overview"],
    queryFn: async () => {
      const { data, error } = await supabase.functions.invoke("treasury-overview");
      if (error) throw new Error(error.message);
      if (data?.error) throw new Error(data.error);
      return data as OverviewData;
    },
    staleTime: 60_000,
    refetchInterval: 120_000,
  });

  if (isLoading) {
    return (
      <div className="grid gap-4 grid-cols-1 md:grid-cols-3">
        <Skeleton className="h-32" />
        <Skeleton className="h-32" />
        <Skeleton className="h-32" />
      </div>
    );
  }
  if (!data) return null;

  const inflowD30 = data.inflows.pet_shop.d30.sum + data.inflows.mystery_box.d30.sum;
  const inflowD7 = data.inflows.pet_shop.d7.sum + data.inflows.mystery_box.d7.sum;
  const inflowAll = data.inflows.total_all_time;

  return (
    <div className="space-y-4">
      {/* Drift Alert */}
      {!data.ledger.is_healthy && (
        <Card className="border-yellow-300 bg-yellow-50/50">
          <CardContent className="py-4 flex items-start gap-3">
            <AlertTriangle className="w-5 h-5 text-yellow-600 mt-0.5" />
            <div className="text-sm">
              <p className="font-semibold text-yellow-900">Sổ sách lệch so với on-chain</p>
              <p className="text-yellow-800">
                On-chain {fmt(data.ledger.actual_onchain)} CAMLY vs dự kiến {fmt(data.ledger.expected_onchain)} CAMLY
                (lệch {data.ledger.drift > 0 ? "+" : ""}{fmt(data.ledger.drift)} = {data.ledger.drift_pct.toFixed(2)}%).
              </p>
              <p className="text-xs text-yellow-700 mt-1">
                Lệch dương = đã thu nhiều hơn ghi sổ (scanner chưa kịp). Lệch âm = chi tay chưa được ghi outflow.
              </p>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Inflow Cards */}
      <div className="grid gap-4 grid-cols-1 md:grid-cols-3">
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm flex items-center gap-2"><TrendingUp className="w-4 h-4 text-emerald-600" /> Đã thu 7 ngày</CardTitle></CardHeader>
          <CardContent>
            <p className="text-2xl font-bold">{fmt(inflowD7)} <span className="text-sm font-normal text-muted-foreground">CAMLY</span></p>
            <p className="text-xs text-muted-foreground mt-1">
              Pet {fmt(data.inflows.pet_shop.d7.sum)} · Box {fmt(data.inflows.mystery_box.d7.sum)}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm flex items-center gap-2"><TrendingUp className="w-4 h-4 text-emerald-600" /> Đã thu 30 ngày</CardTitle></CardHeader>
          <CardContent>
            <p className="text-2xl font-bold">{fmt(inflowD30)} <span className="text-sm font-normal text-muted-foreground">CAMLY</span></p>
            <p className="text-xs text-muted-foreground mt-1">
              Pet {fmt(data.inflows.pet_shop.d30.sum)} · Box {fmt(data.inflows.mystery_box.d30.sum)}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm flex items-center gap-2"><CheckCircle2 className="w-4 h-4 text-primary" /> Tổng từ trước đến nay</CardTitle></CardHeader>
          <CardContent>
            <p className="text-2xl font-bold">{fmt(inflowAll)} <span className="text-sm font-normal text-muted-foreground">CAMLY</span></p>
            <p className="text-xs text-muted-foreground mt-1">
              {data.inflows.pet_shop.all.count + data.inflows.mystery_box.all.count} đơn ·
              Đã chi {fmt(data.outflows.total_all_time)}
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Source breakdown */}
      <div className="grid gap-4 grid-cols-1 md:grid-cols-2">
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-base flex items-center gap-2"><Sparkles className="w-4 h-4 text-purple-500" /> Mua trang phục Lumi (Pet Shop)</CardTitle></CardHeader>
          <CardContent className="space-y-2 text-sm">
            <Row label="7 ngày" value={`${fmt(data.inflows.pet_shop.d7.sum)} CAMLY · ${data.inflows.pet_shop.d7.count} đơn`} />
            <Row label="30 ngày" value={`${fmt(data.inflows.pet_shop.d30.sum)} CAMLY · ${data.inflows.pet_shop.d30.count} đơn`} />
            <Row label="90 ngày" value={`${fmt(data.inflows.pet_shop.d90.sum)} CAMLY · ${data.inflows.pet_shop.d90.count} đơn`} />
            <Row label="Tất cả" value={`${fmt(data.inflows.pet_shop.all.sum)} CAMLY · ${data.inflows.pet_shop.all.count} đơn`} bold />
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-base flex items-center gap-2"><PackageOpen className="w-4 h-4 text-amber-500" /> Mua hộp bí ẩn (Mystery Box)</CardTitle></CardHeader>
          <CardContent className="space-y-2 text-sm">
            <Row label="7 ngày" value={`${fmt(data.inflows.mystery_box.d7.sum)} CAMLY · ${data.inflows.mystery_box.d7.count} đơn`} />
            <Row label="30 ngày" value={`${fmt(data.inflows.mystery_box.d30.sum)} CAMLY · ${data.inflows.mystery_box.d30.count} đơn`} />
            <Row label="90 ngày" value={`${fmt(data.inflows.mystery_box.d90.sum)} CAMLY · ${data.inflows.mystery_box.d90.count} đơn`} />
            <Row label="Tất cả" value={`${fmt(data.inflows.mystery_box.all.sum)} CAMLY · ${data.inflows.mystery_box.all.count} đơn`} bold />
          </CardContent>
        </Card>
      </div>

      {/* Top spenders */}
      {data.top_spenders.length > 0 && (
        <Card>
          <CardHeader><CardTitle className="text-base">Top 10 chi tiêu (90 ngày)</CardTitle></CardHeader>
          <CardContent className="space-y-2">
            {data.top_spenders.map((u, i) => (
              <div key={u.user_id} className="flex items-center gap-3 text-sm">
                <Badge variant="outline" className="w-6 justify-center">{i + 1}</Badge>
                <Avatar className="h-7 w-7">
                  <AvatarImage src={u.avatar_url} />
                  <AvatarFallback>{(u.full_name || u.username || "?").slice(0, 1)}</AvatarFallback>
                </Avatar>
                <div className="flex-1 min-w-0">
                  {u.username ? (
                    <a href={`/u/${u.username}`} target="_blank" rel="noreferrer" className="font-medium hover:underline truncate block">@{u.username}</a>
                  ) : (
                    <span className="font-medium truncate block">{u.full_name || u.user_id.slice(0, 8) + "…"}</span>
                  )}
                  {u.username && u.full_name && <div className="text-[10px] text-muted-foreground truncate">{u.full_name}</div>}
                </div>
                <span className="font-mono font-semibold">{fmt(u.total_camly)} CAMLY</span>
              </div>
            ))}
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function Row({ label, value, bold }: { label: string; value: string; bold?: boolean }) {
  return (
    <div className="flex justify-between items-center">
      <span className="text-muted-foreground">{label}</span>
      <span className={bold ? "font-bold" : "font-medium"}>{value}</span>
    </div>
  );
}

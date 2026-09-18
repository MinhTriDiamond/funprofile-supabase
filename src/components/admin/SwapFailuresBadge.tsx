import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Badge } from "@/components/ui/badge";
import { AlertTriangle, CheckCircle2 } from "lucide-react";

interface Row {
  stage: string;
  attempts: number;
  last_failed_at: string;
}

/**
 * Badge đếm số lỗi ghi nhận swap trong 7/30 ngày (bảng swap_failures).
 * CHỈ hiển thị (pull-based) — chưa gửi notification chủ động.
 */
export default function SwapFailuresBadge() {
  const { data } = useQuery({
    queryKey: ["swap-failures-count"],
    staleTime: 60_000,
    queryFn: async () => {
      const since30 = new Date(Date.now() - 30 * 86400000).toISOString();
      const { data, error } = await supabase
        .from("swap_failures")
        .select("stage, attempts, last_failed_at")
        .gte("last_failed_at", since30)
        .order("last_failed_at", { ascending: false })
        .limit(500);
      if (error) throw error;
      const rows = (data ?? []) as Row[];
      const since7 = Date.now() - 7 * 86400000;
      return {
        rows30: rows.length,
        rows7: rows.filter((r) => new Date(r.last_failed_at).getTime() >= since7).length,
        attempts30: rows.reduce((s, r) => s + (r.attempts ?? 1), 0),
        lastAt: rows[0]?.last_failed_at ?? null,
        lastStage: rows[0]?.stage ?? null,
      };
    },
  });

  if (!data) return null;

  if (data.rows30 === 0) {
    return (
      <Badge variant="outline" className="gap-1">
        <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
        Swap: 0 lỗi / 30 ngày
      </Badge>
    );
  }

  return (
    <Badge variant="destructive" className="gap-1">
      <AlertTriangle className="w-3.5 h-3.5" />
      Swap lỗi: {data.rows7} (7đ) · {data.rows30} (30đ) · {data.attempts30} lần
      {data.lastStage ? ` · mới nhất: ${data.lastStage}` : ""}
    </Badge>
  );
}

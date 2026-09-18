import { useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { formatDistanceToNow } from "date-fns";
import { vi } from "date-fns/locale";

interface FilterRow {
  token_symbol: string;
  chain: string;
  min_amount: number;
  enabled: boolean;
  notes: string | null;
  updated_at: string;
}

interface LogRow {
  id: string;
  tx_hash: string | null;
  reason: string;
  token_symbol: string | null;
  amount: number | null;
  sender_address: string | null;
  source: string | null;
  created_at: string;
}

const REASON_LABEL: Record<string, string> = {
  below_min_amount: "Dưới ngưỡng",
  sender_blacklisted: "Ví trong danh sách đen",
  unknown_token: "Token lạ",
  token_disabled: "Token bị tắt",
  invalid_amount: "Số lượng không hợp lệ",
  missing_symbol: "Thiếu symbol",
};

export default function ExternalTxFilterTab() {
  const qc = useQueryClient();
  const [drafts, setDrafts] = useState<Record<string, { min_amount?: string; enabled?: boolean }>>({});

  const { data: filters = [], isLoading } = useQuery({
    queryKey: ["token-ingest-filters"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("token_ingest_filters")
        .select("*")
        .order("token_symbol");
      if (error) throw error;
      return (data || []) as FilterRow[];
    },
  });

  const { data: logs = [] } = useQuery({
    queryKey: ["external-tx-filter-log"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("external_tx_filter_log")
        .select("id, tx_hash, reason, token_symbol, amount, sender_address, source, created_at")
        .order("created_at", { ascending: false })
        .limit(100);
      if (error) throw error;
      return (data || []) as LogRow[];
    },
    refetchInterval: 30_000,
  });

  const reasonStats = useMemo(() => {
    const map: Record<string, number> = {};
    for (const l of logs) map[l.reason] = (map[l.reason] || 0) + 1;
    return map;
  }, [logs]);

  const saveMut = useMutation({
    mutationFn: async (row: FilterRow) => {
      const draft = drafts[row.token_symbol] || {};
      const patch = {
        min_amount: draft.min_amount != null ? Number(draft.min_amount) : row.min_amount,
        enabled: draft.enabled != null ? draft.enabled : row.enabled,
        updated_at: new Date().toISOString(),
      };
      const { error } = await supabase
        .from("token_ingest_filters")
        .update(patch)
        .eq("token_symbol", row.token_symbol);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Đã lưu ngưỡng lọc");
      setDrafts({});
      qc.invalidateQueries({ queryKey: ["token-ingest-filters"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Bộ lọc giao dịch ví ngoài</CardTitle>
          <p className="text-sm text-muted-foreground">
            Chặn dust/spam ngay tại scanner. Chỉnh ngưỡng có hiệu lực sau ≤ 60 giây.
          </p>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <p className="text-sm text-muted-foreground">Đang tải…</p>
          ) : (
            <div className="grid gap-3">
              {filters.map((f) => {
                const draft = drafts[f.token_symbol] || {};
                const minVal = draft.min_amount ?? String(f.min_amount);
                const enabledVal = draft.enabled ?? f.enabled;
                const dirty =
                  draft.min_amount !== undefined || draft.enabled !== undefined;
                return (
                  <div
                    key={f.token_symbol}
                    className="flex flex-wrap items-center gap-3 rounded-lg border p-3"
                  >
                    <Badge variant="secondary" className="min-w-[70px] justify-center">
                      {f.token_symbol}
                    </Badge>
                    <span className="text-xs text-muted-foreground">{f.chain}</span>
                    <label className="flex items-center gap-2 text-sm">
                      Ngưỡng tối thiểu
                      <Input
                        type="number"
                        step="any"
                        className="w-32"
                        value={minVal}
                        onChange={(e) =>
                          setDrafts((d) => ({
                            ...d,
                            [f.token_symbol]: { ...d[f.token_symbol], min_amount: e.target.value },
                          }))
                        }
                      />
                    </label>
                    <label className="flex items-center gap-2 text-sm">
                      Bật lọc
                      <Switch
                        checked={enabledVal}
                        onCheckedChange={(v) =>
                          setDrafts((d) => ({
                            ...d,
                            [f.token_symbol]: { ...d[f.token_symbol], enabled: v },
                          }))
                        }
                      />
                    </label>
                    {f.notes && (
                      <span className="text-xs text-muted-foreground">{f.notes}</span>
                    )}
                    <Button
                      size="sm"
                      variant={dirty ? "default" : "outline"}
                      disabled={!dirty || saveMut.isPending}
                      onClick={() => saveMut.mutate(f)}
                    >
                      Lưu
                    </Button>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Log 100 giao dịch bị chặn gần nhất</CardTitle>
          <div className="flex flex-wrap gap-2 pt-2">
            {Object.entries(reasonStats).map(([r, n]) => (
              <Badge key={r} variant="outline">
                {REASON_LABEL[r] || r}: {n}
              </Badge>
            ))}
          </div>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-left text-muted-foreground">
                <tr>
                  <th className="p-2">Thời gian</th>
                  <th className="p-2">Lý do</th>
                  <th className="p-2">Token</th>
                  <th className="p-2">Số lượng</th>
                  <th className="p-2">Người gửi</th>
                  <th className="p-2">Nguồn</th>
                  <th className="p-2">Tx</th>
                </tr>
              </thead>
              <tbody>
                {logs.map((l) => (
                  <tr key={l.id} className="border-t">
                    <td className="p-2 whitespace-nowrap">
                      {formatDistanceToNow(new Date(l.created_at), { addSuffix: true, locale: vi })}
                    </td>
                    <td className="p-2">
                      <Badge variant="destructive" className="font-normal">
                        {REASON_LABEL[l.reason] || l.reason}
                      </Badge>
                    </td>
                    <td className="p-2">{l.token_symbol || "-"}</td>
                    <td className="p-2">{l.amount ?? "-"}</td>
                    <td className="p-2 font-mono text-xs">
                      {l.sender_address ? `${l.sender_address.slice(0, 8)}…${l.sender_address.slice(-6)}` : "-"}
                    </td>
                    <td className="p-2 text-xs text-muted-foreground">{l.source || "-"}</td>
                    <td className="p-2 font-mono text-xs">
                      {l.tx_hash ? (
                        <a
                          className="text-primary hover:underline"
                          href={`https://bscscan.com/tx/${l.tx_hash}`}
                          target="_blank"
                          rel="noreferrer"
                        >
                          {l.tx_hash.slice(0, 10)}…
                        </a>
                      ) : (
                        "-"
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {logs.length === 0 && (
              <p className="p-4 text-sm text-muted-foreground">
                Chưa có giao dịch nào bị chặn.
              </p>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

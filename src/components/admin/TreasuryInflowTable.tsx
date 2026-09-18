import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { ExternalLink, Download, Search } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";

type Source = "all" | "pet" | "mystery";

interface InflowRow {
  id: string;
  source: "pet" | "mystery";
  confirmed_at: string;
  user_id: string;
  username?: string;
  full_name?: string;
  item: string;
  price_camly: number;
  tx_hash: string | null;
}

const fmt = (n: number) => Math.round(n).toLocaleString("vi-VN");

export default function TreasuryInflowTable() {
  const [source, setSource] = useState<Source>("all");
  const [search, setSearch] = useState("");
  const [limit, setLimit] = useState(50);

  const { data, isLoading } = useQuery({
    queryKey: ["treasury-inflows", source, limit],
    queryFn: async () => {
      const rows: InflowRow[] = [];
      if (source !== "mystery") {
        const { data: pet } = await supabase
          .from("pet_shop_orders")
          .select("id, confirmed_at, user_id, item_code, price_camly, tx_hash")
          .eq("status", "confirmed")
          .order("confirmed_at", { ascending: false })
          .limit(limit);
        (pet || []).forEach((r: any) => rows.push({
          id: r.id, source: "pet", confirmed_at: r.confirmed_at,
          user_id: r.user_id, item: r.item_code || "—",
          price_camly: Number(r.price_camly), tx_hash: r.tx_hash,
        }));
      }
      if (source !== "pet") {
        const { data: mb } = await supabase
          .from("mystery_box_orders")
          .select("id, confirmed_at, user_id, box_code, price_camly, tx_hash")
          .eq("status", "confirmed")
          .order("confirmed_at", { ascending: false })
          .limit(limit);
        (mb || []).forEach((r: any) => rows.push({
          id: r.id, source: "mystery", confirmed_at: r.confirmed_at,
          user_id: r.user_id, item: r.box_code || "—",
          price_camly: Number(r.price_camly), tx_hash: r.tx_hash,
        }));
      }

      // Enrich profiles
      const uids: string[] = [...new Set(rows.map((r) => r.user_id))];
      if (uids.length) {
        const { data: profs } = await (supabase as any)
          .from("profiles").select("id, username, full_name").in("id", uids);
        const map = new Map<string, any>((profs || []).map((p: any) => [p.id, p]));
        rows.forEach((r) => {
          const p = map.get(r.user_id);
          if (p) { r.username = p.username; r.full_name = p.full_name; }
        });
      }
      rows.sort((a, b) => (b.confirmed_at || "").localeCompare(a.confirmed_at || ""));
      return rows;
    },
    staleTime: 30_000,
  });

  const filtered = (data || []).filter((r) => {
    if (!search) return true;
    const s = search.toLowerCase();
    return (r.username || "").toLowerCase().includes(s)
      || (r.full_name || "").toLowerCase().includes(s)
      || (r.item || "").toLowerCase().includes(s)
      || (r.tx_hash || "").toLowerCase().includes(s);
  });

  const exportCSV = () => {
    const header = "Thời gian,Nguồn,User,Item,CAMLY,TX Hash\n";
    const body = filtered.map((r) =>
      `${r.confirmed_at},${r.source},${r.full_name || r.username || r.user_id},${r.item},${r.price_camly},${r.tx_hash || ""}`
    ).join("\n");
    const blob = new Blob([header + body], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = `treasury-inflows-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click(); URL.revokeObjectURL(url);
  };

  return (
    <Card>
      <CardHeader>
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <CardTitle className="text-base">Lịch sử dòng tiền vào</CardTitle>
          <div className="flex flex-wrap items-center gap-2">
            <Select value={source} onValueChange={(v) => setSource(v as Source)}>
              <SelectTrigger className="w-[140px]"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Tất cả</SelectItem>
                <SelectItem value="pet">Pet Shop</SelectItem>
                <SelectItem value="mystery">Mystery Box</SelectItem>
              </SelectContent>
            </Select>
            <Select value={String(limit)} onValueChange={(v) => setLimit(Number(v))}>
              <SelectTrigger className="w-[100px]"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="50">50</SelectItem>
                <SelectItem value="200">200</SelectItem>
                <SelectItem value="500">500</SelectItem>
              </SelectContent>
            </Select>
            <div className="relative">
              <Search className="absolute left-2 top-2.5 w-4 h-4 text-muted-foreground" />
              <Input value={search} onChange={(e) => setSearch(e.target.value)}
                placeholder="Tìm user / item / tx..." className="pl-8 w-[200px]" />
            </div>
            <Button variant="outline" size="sm" onClick={exportCSV} className="gap-2">
              <Download className="w-4 h-4" /> CSV
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="space-y-2">{Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-10" />)}</div>
        ) : filtered.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-6">Không có giao dịch.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="border-b text-left text-muted-foreground">
                <tr>
                  <th className="py-2 pr-2">Thời gian</th>
                  <th className="py-2 pr-2">Nguồn</th>
                  <th className="py-2 pr-2">User</th>
                  <th className="py-2 pr-2">Item</th>
                  <th className="py-2 pr-2 text-right">CAMLY</th>
                  <th className="py-2 pr-2">TX</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((r) => (
                  <tr key={`${r.source}-${r.id}`} className="border-b hover:bg-muted/40">
                    <td className="py-2 pr-2 text-xs text-muted-foreground whitespace-nowrap">
                      {new Date(r.confirmed_at).toLocaleString("vi-VN")}
                    </td>
                    <td className="py-2 pr-2">
                      <Badge variant={r.source === "pet" ? "default" : "secondary"} className="text-xs">
                        {r.source === "pet" ? "Pet" : "Box"}
                      </Badge>
                    </td>
                    <td className="py-2 pr-2 truncate max-w-[180px]">
                      {r.username ? (
                        <a href={`/u/${r.username}`} target="_blank" rel="noreferrer" className="font-medium hover:underline">
                          @{r.username}
                        </a>
                      ) : (
                        <span className="text-muted-foreground text-xs">{r.user_id.slice(0, 8)}…</span>
                      )}
                      {r.full_name && <div className="text-[10px] text-muted-foreground truncate">{r.full_name}</div>}
                    </td>
                    <td className="py-2 pr-2 truncate max-w-[120px] font-mono text-xs">{r.item}</td>
                    <td className="py-2 pr-2 text-right font-semibold">{fmt(r.price_camly)}</td>
                    <td className="py-2 pr-2">
                      {r.tx_hash ? (
                        <a href={`https://bscscan.com/tx/${r.tx_hash}`} target="_blank" rel="noreferrer"
                          className="text-primary inline-flex items-center gap-1 hover:underline">
                          <span className="font-mono text-xs">{r.tx_hash.slice(0, 8)}…</span>
                          <ExternalLink className="w-3 h-3" />
                        </a>
                      ) : <span className="text-muted-foreground text-xs">—</span>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

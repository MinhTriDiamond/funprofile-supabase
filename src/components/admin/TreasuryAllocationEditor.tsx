import { useEffect, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { SlidersHorizontal, Loader2 } from "lucide-react";
import { useQuery, useQueryClient } from "@tanstack/react-query";

interface Vault {
  vault_key: string;
  vault_name: string;
  allocation_pct: number;
  token_symbol: string;
}

export default function TreasuryAllocationEditor() {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [edits, setEdits] = useState<Record<string, string>>({});
  const [token, setToken] = useState("FUN");
  const qc = useQueryClient();

  const { data: allVaults } = useQuery({
    queryKey: ["treasury-vaults-edit"],
    queryFn: async () => {
      const { data } = await supabase.from("treasury_vaults")
        .select("vault_key, vault_name, allocation_pct, token_symbol").eq("is_active", true);
      return (data || []) as Vault[];
    },
    enabled: open,
  });

  const tokens = Array.from(new Set((allVaults || []).map((v) => v.token_symbol))).sort();
  const vaults = (allVaults || []).filter((v) => v.token_symbol === token);

  useEffect(() => {
    if (allVaults && open) {
      const init: Record<string, string> = {};
      allVaults
        .filter((v) => v.token_symbol === token)
        .forEach((v) => { init[v.vault_key] = String(Number(v.allocation_pct) * 100); });
      setEdits(init);
    }
  }, [allVaults, open, token]);

  const total = Object.values(edits).reduce((a, v) => a + (Number(v) || 0), 0);
  const isValid = Math.abs(total - 100) < 0.01;

  const handleSave = async () => {
    if (!isValid) {
      toast.error("Tổng tỷ lệ phải = 100%");
      return;
    }
    setLoading(true);
    try {
      for (const [key, val] of Object.entries(edits)) {
        await supabase.from("treasury_vaults")
          .update({ allocation_pct: Number(val) / 100 })
          .eq("vault_key", key)
          .eq("token_symbol", token);
      }
      toast.success("Đã cập nhật tỷ lệ allocation");
      qc.invalidateQueries({ queryKey: ["treasury-vaults"] });
      qc.invalidateQueries({ queryKey: ["treasury-vaults-edit"] });
      setOpen(false);
    } catch (e) {
      toast.error("Lưu thất bại");
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" className="gap-2">
          <SlidersHorizontal className="w-4 h-4" /> Sửa tỷ lệ allocation
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Tỷ lệ phân bổ vault theo token</DialogTitle>
          <DialogDescription>
            Tổng các vault của cùng một token phải đúng 100%. Áp dụng cho mọi lần recycle sau.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div className="flex items-center gap-2 flex-wrap">
            <Label className="text-sm">Token</Label>
            {tokens.map((tk) => (
              <Button
                key={tk}
                type="button"
                size="sm"
                variant={tk === token ? "default" : "outline"}
                onClick={() => setToken(tk)}
              >
                {tk}
              </Button>
            ))}
          </div>
          {(vaults || []).map((v) => (
            <div key={v.vault_key} className="flex items-center gap-3">
              <Label className="flex-1 text-sm">{v.vault_name}</Label>
              <div className="flex items-center gap-1">
                <Input type="number" step="0.1"
                  className="w-24 text-right"
                  value={edits[v.vault_key] || ""}
                  onChange={(e) => setEdits({ ...edits, [v.vault_key]: e.target.value })} />
                <span className="text-sm text-muted-foreground">%</span>
              </div>
            </div>
          ))}
          <div className={`text-sm font-semibold text-right ${isValid ? "text-green-600" : "text-red-600"}`}>
            Tổng {token}: {total.toFixed(2)}% {isValid ? "✓" : "(phải = 100%)"}
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => setOpen(false)}>Hủy</Button>
          <Button onClick={handleSave} disabled={loading || !isValid}>
            {loading && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
            Lưu
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

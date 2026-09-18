import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Recycle, Loader2 } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";

export default function TreasuryRecycleDialog() {
  const [open, setOpen] = useState(false);
  const [amount, setAmount] = useState("");
  const [reason, setReason] = useState("");
  const [loading, setLoading] = useState(false);
  const qc = useQueryClient();

  const handleRecycle = async () => {
    const amt = Number(amount);
    if (!amt || amt <= 0) {
      toast.error("Số CAMLY phải > 0");
      return;
    }
    setLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke("treasury-recycle", {
        body: { amount: amt, token_symbol: "CAMLY", source: "manual_recycle", reason: reason || "Recycle thủ công" },
      });
      if (error) throw new Error(error.message);
      if (data?.error) throw new Error(data.error);
      toast.success(`Đã phân bổ ${amt.toLocaleString("vi-VN")} CAMLY vào ${data.flows?.length || 0} vault`);
      setOpen(false); setAmount(""); setReason("");
      qc.invalidateQueries({ queryKey: ["treasury-vaults"] });
      qc.invalidateQueries({ queryKey: ["treasury-overview"] });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Recycle thất bại");
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" className="gap-2">
          <Recycle className="w-4 h-4" /> Recycle thủ công
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Phân bổ CAMLY vào các vault</DialogTitle>
          <DialogDescription>
            Cha nhập số CAMLY muốn ghi nhận thu — sẽ tự chia theo allocation_pct hiện tại của các vault CAMLY.
            <strong className="block mt-1 text-yellow-700">
              ⚠️ Chỉ ghi sổ nội bộ, KHÔNG động đến on-chain.
            </strong>
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div>
            <Label>Số CAMLY</Label>
            <Input type="number" value={amount} onChange={(e) => setAmount(e.target.value)}
              placeholder="vd: 100000" />
          </div>
          <div>
            <Label>Ghi chú (tùy chọn)</Label>
            <Input value={reason} onChange={(e) => setReason(e.target.value)}
              placeholder="vd: Thu Pet Shop tháng 5" />
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => setOpen(false)}>Hủy</Button>
          <Button onClick={handleRecycle} disabled={loading}>
            {loading && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
            Phân bổ
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { ArrowUpRight, Loader2 } from "lucide-react";
import { useQuery, useQueryClient } from "@tanstack/react-query";

export default function TreasuryOutflowRecorder() {
  const [txHash, setTxHash] = useState("");
  const [vaultKey, setVaultKey] = useState("");
  const [reason, setReason] = useState("");
  const [recipientLabel, setRecipientLabel] = useState("");
  const [loading, setLoading] = useState(false);
  const qc = useQueryClient();

  const { data: vaults } = useQuery({
    queryKey: ["treasury-vaults-for-outflow", "CAMLY"],
    queryFn: async () => {
      const { data } = await supabase.from("treasury_vaults")
        .select("vault_key, vault_name, balance, token_symbol").eq("is_active", true).eq("token_symbol", "CAMLY")
        .order("balance", { ascending: false });
      return data || [];
    },
  });

  const handleRecord = async () => {
    if (!/^0x[a-fA-F0-9]{64}$/.test(txHash)) {
      toast.error("TX hash không hợp lệ");
      return;
    }
    if (!vaultKey) {
      toast.error("Chọn vault để trừ");
      return;
    }
    setLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke("treasury-record-outflow", {
        body: { tx_hash: txHash, vault_key: vaultKey, reason, recipient_label: recipientLabel },
      });
      if (error) throw new Error(error.message);
      if (data?.error) throw new Error(data.error);
      toast.success(`Đã ghi nhận chi ${data.amount.toLocaleString("vi-VN")} CAMLY → ${data.to.slice(0, 10)}…`);
      setTxHash(""); setReason(""); setRecipientLabel(""); setVaultKey("");
      qc.invalidateQueries({ queryKey: ["treasury-vaults"] });
      qc.invalidateQueries({ queryKey: ["treasury-overview"] });
      qc.invalidateQueries({ queryKey: ["treasury-vaults-for-outflow"] });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Ghi nhận thất bại");
    } finally {
      setLoading(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base flex items-center gap-2">
          <ArrowUpRight className="w-4 h-4 text-red-500" /> Ghi nhận chi tay
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <p className="text-xs text-muted-foreground">
          Sau khi Cha chuyển CAMLY ra từ ví treasury bằng MetaMask, paste tx hash ở đây để hệ thống verify on-chain
          và trừ vault tương ứng.
        </p>
        <div>
          <Label>TX Hash (BSC)</Label>
          <Input value={txHash} onChange={(e) => setTxHash(e.target.value.trim())}
            placeholder="0x..." className="font-mono text-xs" />
        </div>
        <div>
          <Label>Trừ từ vault nào (CAMLY)</Label>
          <Select value={vaultKey} onValueChange={setVaultKey}>
            <SelectTrigger><SelectValue placeholder="Chọn vault" /></SelectTrigger>
            <SelectContent>
              {(vaults || []).map((v: any) => (
                <SelectItem key={v.vault_key} value={v.vault_key}>
                  {v.vault_name} — còn {Number(v.balance).toLocaleString("vi-VN")} CAMLY
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div>
          <Label>Người nhận (nhãn)</Label>
          <Input value={recipientLabel} onChange={(e) => setRecipientLabel(e.target.value)}
            placeholder="vd: Đối tác X, Event Y..." />
        </div>
        <div>
          <Label>Lý do</Label>
          <Textarea value={reason} onChange={(e) => setReason(e.target.value)}
            placeholder="vd: Trả thưởng event 30/4, payroll tháng 5..." rows={2} />
        </div>
        <Button onClick={handleRecord} disabled={loading} className="w-full gap-2">
          {loading && <Loader2 className="w-4 h-4 animate-spin" />}
          Verify & Ghi sổ
        </Button>
      </CardContent>
    </Card>
  );
}

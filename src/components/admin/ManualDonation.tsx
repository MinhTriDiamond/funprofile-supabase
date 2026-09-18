import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { PlusCircle } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Textarea } from "@/components/ui/textarea";

const ManualDonation = () => {
  const [loading, setLoading] = useState(false);
  const [form, setForm] = useState({
    tx_hash: "",
    sender_id: "",
    recipient_id: "",
    amount: "",
    token_symbol: "USDT",
    message: "",
  });
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- dynamic edge function response
  const [result, setResult] = useState<any>(null);

  // Simple user search
  interface UserSearchResult { id: string; username: string; display_name: string | null; }
  const [senderSearch, setSenderSearch] = useState("");
  const [recipientSearch, setRecipientSearch] = useState("");
  const [senderResults, setSenderResults] = useState<UserSearchResult[]>([]);
  const [recipientResults, setRecipientResults] = useState<UserSearchResult[]>([]);

  const searchUser = async (query: string, type: "sender" | "recipient") => {
    if (query.length < 2) return;
    const { data } = await supabase
      .from("profiles")
      .select("id, username, display_name")
      .ilike("username", `%${query}%`)
      .limit(5);
    if (type === "sender") setSenderResults(data || []);
    else setRecipientResults(data || []);
  };

  const selectUser = (user: UserSearchResult, type: "sender" | "recipient") => {
    if (type === "sender") {
      setForm(f => ({ ...f, sender_id: user.id }));
      setSenderSearch(`@${user.username}`);
      setSenderResults([]);
    } else {
      setForm(f => ({ ...f, recipient_id: user.id }));
      setRecipientSearch(`@${user.username}`);
      setRecipientResults([]);
    }
  };

  const handleSubmit = async () => {
    if (!form.tx_hash || !form.sender_id || !form.recipient_id || !form.amount) {
      toast.error("Vui lòng điền đầy đủ thông tin");
      return;
    }
    setLoading(true);
    setResult(null);
    try {
      const { data, error } = await supabase.functions.invoke("manual-create-donation", {
        body: form,
      });
      if (error) throw error;
      if (data?.error) {
        toast.error(data.error);
        return;
      }
      setResult(data);
      toast.success(data.message || "Tạo thành công!");
      setForm({ tx_hash: "", sender_id: "", recipient_id: "", amount: "", token_symbol: "USDT", message: "" });
      setSenderSearch("");
      setRecipientSearch("");
    } catch (err: unknown) {
      toast.error("Lỗi: " + (err instanceof Error ? err.message : "Unknown"));
    } finally {
      setLoading(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <PlusCircle className="w-5 h-5 text-green-500" />
          Thêm giao dịch thủ công
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <p className="text-sm text-muted-foreground">
          Tạo bản ghi donation + bài chúc mừng + thông báo cho giao dịch đã xảy ra trên blockchain nhưng chưa được ghi nhận.
        </p>

        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2 sm:col-span-2">
            <Label>TX Hash *</Label>
            <Input
              placeholder="0x..."
              value={form.tx_hash}
              onChange={(e) => setForm(f => ({ ...f, tx_hash: e.target.value }))}
              className="font-mono text-xs"
            />
          </div>

          <div className="space-y-2 relative">
            <Label>Người gửi *</Label>
            <Input
              placeholder="Tìm username..."
              value={senderSearch}
              onChange={(e) => {
                setSenderSearch(e.target.value);
                searchUser(e.target.value, "sender");
              }}
            />
            {senderResults.length > 0 && (
              <div className="absolute z-10 top-full mt-1 w-full bg-popover border rounded-md shadow-md">
                {senderResults.map((u) => (
                  <button
                    key={u.id}
                    className="w-full text-left px-3 py-2 text-sm hover:bg-muted"
                    onClick={() => selectUser(u, "sender")}
                  >
                    @{u.username} {u.display_name ? `(${u.display_name})` : ""}
                  </button>
                ))}
              </div>
            )}
            {form.sender_id && <p className="text-xs text-muted-foreground">ID: {form.sender_id.slice(0, 8)}...</p>}
          </div>

          <div className="space-y-2 relative">
            <Label>Người nhận *</Label>
            <Input
              placeholder="Tìm username..."
              value={recipientSearch}
              onChange={(e) => {
                setRecipientSearch(e.target.value);
                searchUser(e.target.value, "recipient");
              }}
            />
            {recipientResults.length > 0 && (
              <div className="absolute z-10 top-full mt-1 w-full bg-popover border rounded-md shadow-md">
                {recipientResults.map((u) => (
                  <button
                    key={u.id}
                    className="w-full text-left px-3 py-2 text-sm hover:bg-muted"
                    onClick={() => selectUser(u, "recipient")}
                  >
                    @{u.username} {u.display_name ? `(${u.display_name})` : ""}
                  </button>
                ))}
              </div>
            )}
            {form.recipient_id && <p className="text-xs text-muted-foreground">ID: {form.recipient_id.slice(0, 8)}...</p>}
          </div>

          <div className="space-y-2">
            <Label>Số tiền *</Label>
            <Input
              type="number"
              placeholder="0.00"
              value={form.amount}
              onChange={(e) => setForm(f => ({ ...f, amount: e.target.value }))}
            />
          </div>

          <div className="space-y-2">
            <Label>Token *</Label>
            <Select value={form.token_symbol} onValueChange={(v) => setForm(f => ({ ...f, token_symbol: v }))}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="BNB">BNB</SelectItem>
                <SelectItem value="USDT">USDT</SelectItem>
                <SelectItem value="BTCB">BTCB</SelectItem>
                <SelectItem value="FUN">FUN</SelectItem>
                <SelectItem value="CAMLY">CAMLY</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2 sm:col-span-2">
            <Label>Tin nhắn (tuỳ chọn)</Label>
            <Textarea
              placeholder="Lời nhắn kèm theo..."
              value={form.message}
              onChange={(e) => setForm(f => ({ ...f, message: e.target.value }))}
              rows={2}
            />
          </div>
        </div>

        <Button onClick={handleSubmit} disabled={loading} className="gap-2">
          <PlusCircle className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} />
          {loading ? "Đang tạo..." : "Tạo giao dịch"}
        </Button>

        {result?.success && (
          <div className="bg-muted rounded-lg p-4 text-sm space-y-1">
            <p className="text-green-600 font-medium">✅ {result.message}</p>
            <p>Donation ID: <code className="text-xs">{result.donation_id}</code></p>
            {result.post_id && <p>Post ID: <code className="text-xs">{result.post_id}</code></p>}
          </div>
        )}
      </CardContent>
    </Card>
  );
};

export default ManualDonation;

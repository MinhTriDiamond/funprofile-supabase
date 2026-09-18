import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Webhook, Copy, Eye, EyeOff, Trash2, CheckCircle2, XCircle, PlayCircle } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

interface TestResult {
  hmacVerified: boolean;
  status: number;
  elapsedMs: number;
  message: string;
  response: unknown;
  samplePayload: unknown;
}

const StreamWebhookRegisterCard = () => {
  const [loading, setLoading] = useState(false);
  const [secret, setSecret] = useState<string | null>(null);
  const [notificationUrl, setNotificationUrl] = useState<string | null>(null);
  const [revealed, setRevealed] = useState(false);
  const [currentInfo, setCurrentInfo] = useState<unknown>(null);
  const [testResult, setTestResult] = useState<TestResult | null>(null);

  const callFn = async (
    method: "GET" | "POST" | "DELETE",
    body?: Record<string, unknown>,
  ) => {
    setLoading(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error("Cần đăng nhập admin");

      const url = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/stream-webhook-register`;
      const res = await fetch(url, {
        method,
        headers: {
          Authorization: `Bearer ${session.access_token}`,
          "Content-Type": "application/json",
        },
        body: method === "POST" ? JSON.stringify(body ?? {}) : undefined,
      });
      const data = await res.json();
      const isTest = body?.action === "test";
      if (!res.ok && !isTest) throw new Error(data?.error || `HTTP ${res.status}`);

      if (isTest) {
        const result: TestResult = {
          hmacVerified: !!data?.hmacVerified,
          status: data?.status ?? res.status,
          elapsedMs: data?.elapsedMs ?? 0,
          message: data?.message || data?.error || "Không có phản hồi",
          response: data?.response,
          samplePayload: data?.samplePayload,
        };
        setTestResult(result);
        if (result.hmacVerified) toast.success("HMAC hợp lệ ✓");
        else toast.error("HMAC không khớp");
      } else if (method === "POST") {
        setSecret(data.secret || null);
        setNotificationUrl(data.notificationUrl || null);
        setRevealed(false);
        toast.success("Đã đăng ký webhook. Hãy copy secret và cập nhật vào Lovable Cloud.");
      } else if (method === "GET") {
        setCurrentInfo(data?.data?.result || data);
        toast.success("Đã lấy thông tin webhook hiện tại");
      } else {
        setSecret(null);
        setNotificationUrl(null);
        setCurrentInfo(null);
        toast.success("Đã xoá webhook");
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Lỗi không xác định");
    } finally {
      setLoading(false);
    }
  };

  return (
    <Card className="border-primary/30">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <Webhook className="w-5 h-5 text-primary" />
          Cloudflare Stream Webhook
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <p className="text-sm text-muted-foreground">
          Đăng ký webhook để Cloudflare Stream tự cập nhật trạng thái <code>live_replays</code> realtime
          (thay vì đợi cron 1 phút). Sau khi đăng ký, copy secret và cập nhật vào{" "}
          <code>CLOUDFLARE_STREAM_WEBHOOK_SECRET</code>.
        </p>

        <div className="flex flex-wrap gap-2">
          <Button size="sm" onClick={() => callFn("POST")} disabled={loading}>
            Đăng ký / Cập nhật webhook
          </Button>
          <Button size="sm" variant="outline" onClick={() => callFn("GET")} disabled={loading}>
            Xem hiện tại
          </Button>
          <Button size="sm" variant="ghost" onClick={() => callFn("DELETE")} disabled={loading}>
            <Trash2 className="w-4 h-4 mr-1" /> Xoá
          </Button>
        </div>

        {notificationUrl && (
          <div className="text-xs space-y-1">
            <p className="text-muted-foreground">Notification URL:</p>
            <code className="block bg-muted p-2 rounded break-all">{notificationUrl}</code>
          </div>
        )}

        {secret && (
          <div className="space-y-2 p-3 bg-yellow-500/10 border border-yellow-500/40 rounded">
            <div className="flex items-center justify-between">
              <p className="text-xs font-semibold text-yellow-700 dark:text-yellow-400">
                ⚠️ Secret chỉ hiển thị 1 lần — copy ngay!
              </p>
              <div className="flex gap-1">
                <Button size="icon" variant="ghost" onClick={() => setRevealed(!revealed)}>
                  {revealed ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </Button>
                <Button
                  size="icon"
                  variant="ghost"
                  onClick={() => {
                    navigator.clipboard.writeText(secret);
                    toast.success("Đã copy secret");
                  }}
                >
                  <Copy className="w-4 h-4" />
                </Button>
              </div>
            </div>
            <code className="block bg-background p-2 rounded text-xs break-all">
              {revealed ? secret : "•".repeat(Math.min(secret.length, 48))}
            </code>
            <p className="text-xs text-muted-foreground">
              Vào <strong>Lovable Cloud → Secrets → CLOUDFLARE_STREAM_WEBHOOK_SECRET</strong> và dán giá trị này.
            </p>
          </div>
        )}

        {currentInfo !== null && (
          <details className="text-xs">
            <summary className="cursor-pointer text-muted-foreground">Thông tin hiện tại</summary>
            <pre className="bg-muted p-2 rounded mt-1 overflow-x-auto">{JSON.stringify(currentInfo, null, 2)}</pre>
          </details>
        )}
      </CardContent>
    </Card>
  );
};

export default StreamWebhookRegisterCard;

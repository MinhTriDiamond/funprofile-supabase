import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useCurrentUser } from "@/hooks/useCurrentUser";
import { useMyConnector } from "@/hooks/useConnector";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Sparkles, Clock, Hourglass, ExternalLink, ArrowRight } from "lucide-react";
import { FacebookNavbar } from "@/components/layout/FacebookNavbar";
import { MobileBottomNav } from "@/components/layout/MobileBottomNav";
import { BackToHomeBar, BackToHomeCTA } from "@/components/layout/BackToHome";

function formatCountdown(ms: number) {
  if (ms <= 0) return "00:00:00";
  const h = Math.floor(ms / 3600000);
  const m = Math.floor((ms % 3600000) / 60000);
  const s = Math.floor((ms % 60000) / 1000);
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

export default function ConnectorPage() {
  const { userId } = useCurrentUser();
  const navigate = useNavigate();
  const { data, isLoading } = useMyConnector(userId ?? undefined);
  const [now, setNow] = useState(Date.now());

  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);

  if (!userId) {
    return (
      <div className="min-h-screen overflow-hidden">
        <FacebookNavbar />
        <main data-app-scroll className="app-main app-pb-nav">
          <div className="container max-w-2xl py-6 px-4 space-y-4 pb-32">
            <BackToHomeBar />
            <p className="text-muted-foreground text-center py-10">Vui lòng đăng nhập để xem Connector của bạn.</p>
            <BackToHomeCTA />
          </div>
        </main>
        <MobileBottomNav />
      </div>
    );
  }

  const win = data?.window;
  const link = data?.link;
  const connector = data?.connectorProfile;

  const expiresAt = win?.expires_at ? new Date(win.expires_at).getTime() : 0;
  const remaining = expiresAt - now;

  return (
    <div className="min-h-screen overflow-hidden">
      <FacebookNavbar />
      <main data-app-scroll className="app-main app-pb-nav">
        <div className="container max-w-2xl py-4 px-4 pb-32 space-y-4">
          <BackToHomeBar />
          <header className="text-center space-y-2">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-primary/10 text-primary text-sm">
              <Sparkles className="w-4 h-4" />
              Connector of Light
            </div>
            <h1 className="text-2xl font-bold">Người Dẫn Sáng của bạn</h1>
            <p className="text-sm text-muted-foreground">
              Connector chính thức là thành viên FUN.Rich đầu tiên gửi token hợp lệ vào ví của bạn trong vòng 48 giờ.
            </p>
          </header>

      {isLoading && (
        <Card className="p-6 text-center text-muted-foreground">Đang tải…</Card>
      )}

      {!isLoading && link && connector && (
        <Card className="p-6 space-y-4 border-primary/30 bg-gradient-to-br from-primary/5 to-transparent">
          <div className="flex items-center gap-4">
            <Avatar className="w-16 h-16">
              <AvatarImage src={connector.avatar_url ?? undefined} />
              <AvatarFallback>{(connector.display_name ?? connector.username ?? "?").slice(0, 1)}</AvatarFallback>
            </Avatar>
            <div className="flex-1">
              <div className="font-semibold text-lg">
                {connector.display_name || connector.full_name || connector.username}
              </div>
              <div className="text-xs text-muted-foreground">
                @{connector.username} · Soul L{connector.soul_level ?? 0}
              </div>
              <Badge className="mt-1" variant="secondary">First Giver – {link.token_symbol}</Badge>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3 text-sm">
            <div>
              <div className="text-muted-foreground">Số lượng</div>
              <div className="font-semibold">{Number(link.amount).toLocaleString()} {link.token_symbol}</div>
            </div>
            <div>
              <div className="text-muted-foreground">Thời điểm</div>
              <div className="font-semibold">{new Date(link.matched_at).toLocaleString("vi-VN")}</div>
            </div>
          </div>
          <div className="text-xs text-muted-foreground break-all flex items-center gap-1">
            <ExternalLink className="w-3 h-3 shrink-0" />
            tx: {link.tx_hash}
          </div>
          <p className="text-sm text-center italic text-primary">
            "Your Connector of Light is now recorded."
          </p>
        </Card>
      )}

      {!isLoading && !link && win?.status === "open" && (
        <Card className="p-6 space-y-4 border-amber-500/30">
          <div className="flex items-center gap-3 text-amber-600 dark:text-amber-400">
            <Hourglass className="w-6 h-6" />
            <div>
              <div className="font-semibold">Cửa sổ 48 giờ đang mở</div>
              <div className="text-xs text-muted-foreground">
                Hãy nhận giao dịch FUN/USDT/CAMLY/BNB/BTC đầu tiên từ một thành viên FUN.Rich.
              </div>
            </div>
          </div>
          <div className="text-center">
            <div className="text-xs text-muted-foreground mb-1 flex items-center justify-center gap-1">
              <Clock className="w-3 h-3" /> Còn lại
            </div>
            <div className="text-3xl font-mono font-bold tabular-nums text-primary">
              {formatCountdown(remaining)}
            </div>
          </div>
          <p className="text-xs text-muted-foreground text-center">
            Mức tối thiểu: 9 FUN · 1 USDT · 1.000 CAMLY · 0,001 BNB · 0,00001 BTC
          </p>
        </Card>
      )}

      {!isLoading && !link && win?.status === "expired" && (
        <Card className="p-6 text-center space-y-2 border-muted">
          <p className="font-semibold text-muted-foreground">
            Connector chưa được ghi nhận do quá 48 giờ.
          </p>
          <p className="text-xs text-muted-foreground">
            Bạn vẫn có thể tham gia và đóng góp cho cộng đồng để nhận Light Score nhé.
          </p>
        </Card>
      )}

      {!isLoading && !win && (
        <Card className="p-6 text-center text-muted-foreground">
          Chưa có cửa sổ Connector. Vui lòng liên kết ví để mở.
        </Card>
      )}

          <div className="flex justify-between items-center pt-4">
            <Button variant="ghost" size="sm" onClick={() => navigate("/connector/given")}>
              User mà tôi là Connector <ArrowRight className="w-4 h-4 ml-1" />
            </Button>
            <Button variant="ghost" size="sm" onClick={() => navigate("/docs/connector-spec")}>
              Tài liệu spec
            </Button>
          </div>

          <BackToHomeCTA />
        </div>
      </main>
      <MobileBottomNav />
    </div>
  );
}

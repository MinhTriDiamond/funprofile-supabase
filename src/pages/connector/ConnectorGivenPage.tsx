import { Link } from "react-router-dom";
import { useCurrentUser } from "@/hooks/useCurrentUser";
import { useUsersIConnect } from "@/hooks/useConnector";
import { Card } from "@/components/ui/card";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Sparkles } from "lucide-react";
import { FacebookNavbar } from "@/components/layout/FacebookNavbar";
import { MobileBottomNav } from "@/components/layout/MobileBottomNav";
import { BackToHomeBar, BackToHomeCTA } from "@/components/layout/BackToHome";

const milestoneVi: Record<string, string> = {
  profile_complete: "Hoàn thiện hồ sơ",
  first_contribution: "Đóng góp đầu tiên",
  level_1: "Đạt Level 1",
  active_30d: "Active 30 ngày",
};

export default function ConnectorGivenPage() {
  const { userId } = useCurrentUser();
  const { data: items = [], isLoading } = useUsersIConnect(userId ?? undefined);

  if (!userId) {
    return (
      <div className="min-h-screen overflow-hidden">
        <FacebookNavbar />
        <main data-app-scroll className="app-main app-pb-nav">
          <div className="container max-w-2xl py-6 px-4 space-y-4 pb-32">
            <BackToHomeBar />
            <p className="text-muted-foreground text-center py-10">Vui lòng đăng nhập.</p>
            <BackToHomeCTA />
          </div>
        </main>
        <MobileBottomNav />
      </div>
    );
  }

  const totalBase = items.length * 10;
  const totalGrowth = items.reduce(
    (s, it) => s + (it.growth_events ?? []).reduce((a: number, e: any) => a + (e.score_delta ?? 0), 0),
    0
  );

  return (
    <div className="min-h-screen overflow-hidden">
      <FacebookNavbar />
      <main data-app-scroll className="app-main app-pb-nav">
        <div className="container max-w-2xl py-4 px-4 pb-32 space-y-4">
          <BackToHomeBar />
          <header className="text-center space-y-2">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-primary/10 text-primary text-sm">
              <Sparkles className="w-4 h-4" />
              Connector Hall
            </div>
            <h1 className="text-2xl font-bold">User mà tôi là Connector</h1>
            <p className="text-sm text-muted-foreground">
          Tổng: <span className="font-semibold text-foreground">{items.length}</span> · Light Score đã nhận:{" "}
          <span className="font-semibold text-primary">+{totalBase + totalGrowth}</span>
        </p>
      </header>

      {isLoading && <Card className="p-6 text-center text-muted-foreground">Đang tải…</Card>}

      {!isLoading && items.length === 0 && (
        <Card className="p-6 text-center space-y-2">
          <p className="text-muted-foreground">
            Bạn chưa là Connector của ai. Hãy gửi token đầu tiên cho một thành viên mới (trong 48h từ khi họ tạo
            account) để được ghi nhận.
          </p>
          <Link to="/donations" className="text-primary text-sm underline">Đi tới Donations</Link>
        </Card>
      )}

      <div className="space-y-3">
        {items.map((it: any) => (
          <Card key={it.id} className="p-4 space-y-3">
            <div className="flex items-center gap-3">
              <Avatar className="w-12 h-12">
                <AvatarImage src={it.new_user?.avatar_url ?? undefined} />
                <AvatarFallback>{(it.new_user?.display_name ?? it.new_user?.username ?? "?").slice(0, 1)}</AvatarFallback>
              </Avatar>
              <div className="flex-1 min-w-0">
                <div className="font-semibold truncate">
                  {it.new_user?.display_name || it.new_user?.full_name || it.new_user?.username || "User"}
                </div>
                <div className="text-xs text-muted-foreground truncate">
                  @{it.new_user?.username} · {new Date(it.matched_at).toLocaleDateString("vi-VN")}
                </div>
              </div>
              <Badge variant="secondary">+10 base</Badge>
            </div>

            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              First gift: {Number(it.amount).toLocaleString()} {it.token_symbol}
            </div>

            {(it.growth_events ?? []).length > 0 && (
              <div className="flex flex-wrap gap-1">
                {it.growth_events.map((e: any) => (
                  <Badge key={e.milestone} variant="outline" className="text-xs">
                    {milestoneVi[e.milestone] ?? e.milestone} +{e.score_delta}
                  </Badge>
                ))}
              </div>
            )}
          </Card>
        ))}
          </div>

          <BackToHomeCTA />
        </div>
      </main>
      <MobileBottomNav />
    </div>
  );
}

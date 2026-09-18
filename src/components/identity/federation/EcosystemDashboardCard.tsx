/**
 * EcosystemDashboardCard — Phase 6D.
 * Hiển thị 5 chỉ số thống nhất từ FUN Core: Trust / Light Score / PPLP / Rewards / Badges.
 * Tên hiển thị cho người dùng thường (không dùng thuật ngữ projection/consumer/trace).
 */
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { Shield, Sparkles, TrendingUp, Gift, Award, Loader2 } from "lucide-react";
import { useEcosystemDashboard } from "@/hooks/useEcosystemDashboard";

function fmt(n: number | null | undefined): string {
  if (n === null || n === undefined || Number.isNaN(n)) return "—";
  return new Intl.NumberFormat("vi-VN").format(n);
}

interface StatCellProps {
  icon: React.ReactNode;
  label: string;
  value: string;
  sub?: string | null;
}
function StatCell({ icon, label, value, sub }: StatCellProps) {
  return (
    <div className="rounded-xl border border-border/60 bg-card/40 p-3">
      <div className="flex items-center gap-2 text-xs text-muted-foreground">
        {icon}
        <span>{label}</span>
      </div>
      <div className="mt-1 text-2xl font-semibold leading-none">{value}</div>
      {sub && <div className="mt-1 text-[11px] text-muted-foreground">{sub}</div>}
    </div>
  );
}

export function EcosystemDashboardCard({ targetUserId }: { targetUserId?: string | null }) {
  const { data, isLoading, notReady, notFound, isError, errorMessage } =
    useEcosystemDashboard(targetUserId);

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <Sparkles className="h-4 w-4 text-primary" />
          Bảng tổng hợp Hệ sinh thái
        </CardTitle>
        <p className="text-[11px] text-muted-foreground">
          Tất cả chỉ số được tính tại <span className="font-medium">FUN Core</span> và dùng chung
          cho mọi nền tảng trong hệ sinh thái. FUN Profile chỉ hiển thị, không tự tính.
        </p>
      </CardHeader>
      <CardContent className="space-y-3">
        {isLoading && (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
            {Array.from({ length: 5 }).map((_, i) => (
              <Skeleton key={i} className="h-20 rounded-xl" />
            ))}
          </div>
        )}

        {!isLoading && notReady && (
          <div className="rounded-lg border border-dashed border-border bg-muted/30 p-4 text-center">
            <Loader2 className="mx-auto mb-2 h-4 w-4 animate-spin text-muted-foreground" />
            <p className="text-sm font-medium">FUN Core đang chuẩn bị bảng điểm hệ sinh thái</p>
            <p className="mt-1 text-xs text-muted-foreground">
              Tính năng sẽ tự bật khi máy chủ chính sẵn sàng. Bạn không cần làm gì thêm.
            </p>
          </div>
        )}

        {!isLoading && notFound && (
          <div className="rounded-lg border border-dashed border-border bg-muted/30 p-4 text-center text-sm text-muted-foreground">
            Chưa có Hệ sinh thái cho tài khoản này. Hãy hoạt động trên FUN Profile hoặc LoveHUB để
            bắt đầu tích điểm.
          </div>
        )}

        {!isLoading && isError && (
          <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-xs text-destructive">
            Không tải được bảng tổng hợp: {errorMessage ?? "lỗi không xác định"}
          </div>
        )}

        {!isLoading && data && (
          <>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
              <StatCell
                icon={<Shield className="h-3.5 w-3.5" />}
                label="Mức độ tin cậy"
                value={fmt(data.trust?.score ?? null)}
                sub={data.trust?.band ? `Hạng ${data.trust.band}` : null}
              />
              <StatCell
                icon={<Sparkles className="h-3.5 w-3.5" />}
                label="Điểm ánh sáng"
                value={fmt(data.light_score?.score ?? null)}
                sub={data.light_score?.band ?? null}
              />
              <StatCell
                icon={<TrendingUp className="h-3.5 w-3.5" />}
                label="Hành trình phát triển"
                value={
                  data.pplp?.level !== null && data.pplp?.level !== undefined
                    ? `Lv ${data.pplp.level}`
                    : "—"
                }
                sub={
                  data.pplp?.xp !== null && data.pplp?.xp !== undefined
                    ? `${fmt(data.pplp.xp)} XP${data.pplp?.band ? ` · ${data.pplp.band}` : ""}`
                    : data.pplp?.band ?? null
                }
              />
              <StatCell
                icon={<Gift className="h-3.5 w-3.5" />}
                label="Điểm ghi nhận"
                value={fmt(data.rewards?.points ?? null)}
                sub={data.rewards?.last_reason ?? null}
              />
              <StatCell
                icon={<Award className="h-3.5 w-3.5" />}
                label="Huy hiệu"
                value={fmt(data.badges?.length ?? 0)}
                sub={
                  data.badges && data.badges.length > 0
                    ? data.badges.slice(0, 2).map((b) => b.name).join(", ")
                    : null
                }
              />
            </div>

            {data.badges && data.badges.length > 0 && (
              <div className="flex flex-wrap gap-1.5 pt-1">
                {data.badges.slice(0, 8).map((b) => (
                  <Badge key={b.id} variant="secondary" className="text-[10px]">
                    {b.name}
                  </Badge>
                ))}
                {data.badges.length > 8 && (
                  <Badge variant="outline" className="text-[10px]">
                    +{data.badges.length - 8}
                  </Badge>
                )}
              </div>
            )}

            {data.updated_at && (
              <p className="text-[10px] text-muted-foreground">
                Cập nhật: {new Date(data.updated_at).toLocaleString("vi-VN")}
              </p>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}

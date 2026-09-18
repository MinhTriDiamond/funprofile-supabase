import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ShieldCheck, BadgeCheck, Hourglass, AlertCircle, FlaskConical, Snowflake } from "lucide-react";
import { useKycAccess, useIdentityVerification } from "@/hooks/useIdentityVerification";
import { SumsubVerifyDialog } from "./SumsubVerifyDialog";

const STATUS_META: Record<string, { label: string; color: string; icon: any }> = {
  pending: { label: "Chờ bắt đầu", color: "bg-muted text-muted-foreground", icon: Hourglass },
  in_review: { label: "Đang xét duyệt", color: "bg-amber-500/15 text-amber-700 dark:text-amber-300", icon: Hourglass },
  approved: { label: "Đã xác minh", color: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300", icon: BadgeCheck },
  rejected: { label: "Bị từ chối", color: "bg-destructive/15 text-destructive", icon: AlertCircle },
  expired: { label: "Hết hạn", color: "bg-muted text-muted-foreground", icon: AlertCircle },
};

export function IdentityVerificationCard() {
  const { data: access, isLoading: accessLoading } = useKycAccess();
  const { data: status } = useIdentityVerification({
    pollMs: access?.ctaVisible ? 30_000 : undefined,
  });
  const [open, setOpen] = useState(false);

  if (accessLoading) return null;
  if (!access?.ctaVisible) return null;

  const verification = status?.verification ?? null;
  const meta = verification ? STATUS_META[verification.status] : null;
  const Icon = meta?.icon ?? ShieldCheck;
  const frozen = access.frozen;

  return (
    <>
      <Card className="border-primary/20 bg-gradient-to-br from-primary/5 via-background to-accent/5">
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <ShieldCheck className="w-5 h-5 text-primary" /> Xác minh danh tính (KYC)
            {access.isTest && (
              <Badge variant="outline" className="gap-1 text-[10px]">
                <FlaskConical className="w-3 h-3" /> Test channel
              </Badge>
            )}
            {verification?.verification_environment === "sandbox" && (
              <Badge variant="outline" className="text-[10px]">Sandbox</Badge>
            )}
            {frozen && (
              <Badge variant="outline" className="gap-1 text-[10px] text-blue-700 dark:text-blue-300">
                <Snowflake className="w-3 h-3" /> Tạm dừng
              </Badge>
            )}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {verification ? (
            <div className="space-y-2">
              <div className="flex items-center gap-2 flex-wrap">
                <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-medium ${meta?.color}`}>
                  <Icon className="w-3.5 h-3.5" /> {meta?.label}
                </span>
                {verification.level_name && (
                  <Badge variant="secondary" className="text-[10px]">{verification.level_name}</Badge>
                )}
              </div>
              {verification.status === "approved" && verification.verified_at && (
                <p className="text-xs text-muted-foreground">
                  Đã xác minh lúc {new Date(verification.verified_at).toLocaleString("vi-VN")}
                </p>
              )}
              {verification.status === "rejected" && verification.rejected_reason && (
                <p className="text-xs text-destructive">Lý do: {verification.rejected_reason}</p>
              )}
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">
              Hoàn tất KYC để mở khoá các quyền cao hơn trong hệ sinh thái. FUN Profile chỉ lưu kết quả xác minh, không lưu giấy tờ hay selfie của bạn.
            </p>
          )}

          {verification?.status !== "approved" && (
            <Button
              onClick={() => setOpen(true)}
              disabled={frozen}
              className="gap-2"
              title={frozen ? "Đang tạm dừng nhận hồ sơ mới" : undefined}
            >
              <ShieldCheck className="w-4 h-4" />
              {verification?.status === "in_review" ? "Mở lại phiên KYC" : "Bắt đầu xác minh"}
            </Button>
          )}
        </CardContent>
      </Card>

      <SumsubVerifyDialog open={open} onOpenChange={setOpen} />
    </>
  );
}

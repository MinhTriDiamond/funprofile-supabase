import { useNavigate } from "react-router-dom";
import {
  Activity,
  AlertTriangle,
  BadgeCheck,
  Coins,
  GitMerge,
  Heart,
  Lock,
  Sparkles,
  UserCheck,
  Users,
  Vault,
} from "lucide-react";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useAdminUsers } from "@/hooks/useAdminUsers";
import StatusPill, { type StatusLevel } from "../shell/StatusPill";
import { useAdminGroupStatus } from "../shell/useAdminGroupStatus";
import { cn } from "@/lib/utils";

/**
 * Executive Dashboard — Phase 2.
 *
 * KPI cốt lõi đọc từ `useAdminUsers` (hook đã có, không gọi API mới).
 * Các card "Health" và "Activity/Alerts" hiện ở dạng mock có nhãn rõ ràng.
 */
export function AdminExecutiveOverview() {
  const navigate = useNavigate();
  const { data: users = [], isLoading } = useAdminUsers();
  const status = useAdminGroupStatus();

  const totalUsers = users.filter((u) => !u.is_banned).length;
  const profiles = users.filter(
    (u) => !u.is_banned && !!u.avatar_url && !!u.full_name,
  ).length;
  const pendingClaims = users.filter((u) => u.pending_reward > 0).length;
  const approvedClaims = users.filter((u) => u.approved_reward > 0).length;

  return (
    <div className="space-y-6">
      {/* Hàng 1 — KPI cốt lõi (dữ liệu thật) */}
      <section>
        <SectionTitle title="Chỉ số cốt lõi" subtitle="Dữ liệu trực tiếp từ hệ thống" />
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          <KpiCard
            icon={Users}
            label="Users"
            value={isLoading ? "—" : totalUsers.toLocaleString()}
            tint="blue"
            onClick={() => navigate("/admin/users")}
          />
          <KpiCard
            icon={UserCheck}
            label="Profiles hoàn thiện"
            value={isLoading ? "—" : profiles.toLocaleString()}
            tint="emerald"
            onClick={() => navigate("/admin/users")}
          />
          <KpiCard
            icon={Sparkles}
            label="PPLP — Pending Claim"
            value={isLoading ? "—" : pendingClaims.toLocaleString()}
            tint="amber"
            onClick={() => navigate("/admin/claims")}
          />
          <KpiCard
            icon={Vault}
            label="Approved Claim"
            value={isLoading ? "—" : approvedClaims.toLocaleString()}
            tint="violet"
            onClick={() => navigate("/admin/treasury")}
          />
        </div>
      </section>

      {/* Hàng 2 — Sức khỏe hệ thống (mock) */}
      <section>
        <SectionTitle
          title="Sức khỏe hệ thống"
          subtitle="Phase 2: dữ liệu mock, sẽ nối nguồn thật ở Phase 3"
          mock
        />
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          <HealthCard
            icon={GitMerge}
            label="Federation Health"
            value="Degraded"
            level={status.groups.federation}
            onClick={() => navigate("/admin/federation")}
          />
          <HealthCard
            icon={Lock}
            label="Wallet Security"
            value="Stable"
            level={status.groups.security}
            onClick={() => navigate("/admin/wallet-security")}
          />
          <HealthCard
            icon={BadgeCheck}
            label="KYC Queue"
            value="0 chờ"
            level="ok"
            onClick={() => navigate("/admin/identity-kyc")}
          />
          <HealthCard
            icon={AlertTriangle}
            label="Failed Sync Queue"
            value="0 lỗi"
            level={status.topBar.failedQueue.count > 0 ? "warn" : "ok"}
            onClick={() => navigate("/admin/federation-failed")}
          />
        </div>
      </section>

      {/* Hàng 3 — Activity / Alerts / System Health */}
      <section className="grid gap-3 md:grid-cols-3">
        <PanelCard
          icon={AlertTriangle}
          title="Cảnh báo gần đây"
          tone="amber"
        >
          <EmptyHint>Không có cảnh báo nào.</EmptyHint>
        </PanelCard>

        <PanelCard icon={Activity} title="Hoạt động gần đây" tone="emerald">
          <EmptyHint>Chưa có hoạt động nào gần đây.</EmptyHint>
        </PanelCard>

        <PanelCard icon={Heart} title="System Health" tone="rose" mock>
          <div className="space-y-2 text-sm">
            <ServiceRow name="Auth" level="ok" />
            <ServiceRow name="Database" level="ok" />
            <ServiceRow name="Storage" level="ok" />
            <ServiceRow name="Edge Functions" level="ok" />
          </div>
        </PanelCard>
      </section>
    </div>
  );
}

/* ─────────────── sub-components ─────────────── */

function SectionTitle({
  title,
  subtitle,
  mock,
}: {
  title: string;
  subtitle?: string;
  mock?: boolean;
}) {
  return (
    <div className="mb-2 flex items-center gap-2">
      <h2 className="text-sm font-semibold text-foreground">{title}</h2>
      {mock && (
        <Badge
          variant="outline"
          className="h-4 px-1.5 text-[9px] font-normal uppercase tracking-wide text-muted-foreground"
        >
          Mock
        </Badge>
      )}
      {subtitle && (
        <span className="truncate text-xs text-muted-foreground">{subtitle}</span>
      )}
    </div>
  );
}

const TINT: Record<string, string> = {
  blue: "bg-blue-500/10 text-blue-500",
  emerald: "bg-emerald-500/10 text-emerald-500",
  amber: "bg-amber-500/10 text-amber-600",
  violet: "bg-violet-500/10 text-violet-500",
  rose: "bg-rose-500/10 text-rose-500",
};

function KpiCard({
  icon: Icon,
  label,
  value,
  tint = "blue",
  onClick,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: string;
  tint?: keyof typeof TINT;
  onClick?: () => void;
}) {
  return (
    <Card
      onClick={onClick}
      className={cn(
        "transition-all",
        onClick && "cursor-pointer hover:shadow-md hover:-translate-y-0.5",
      )}
    >
      <CardContent className="flex items-center gap-3 py-4">
        <div className={cn("rounded-md p-2", TINT[tint])}>
          <Icon className="h-5 w-5" />
        </div>
        <div className="min-w-0">
          <p className="truncate text-xs text-muted-foreground">{label}</p>
          <p className="text-xl font-semibold">{value}</p>
        </div>
      </CardContent>
    </Card>
  );
}

function HealthCard({
  icon: Icon,
  label,
  value,
  level,
  onClick,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: string;
  level: StatusLevel;
  onClick?: () => void;
}) {
  return (
    <Card
      onClick={onClick}
      className={cn(
        "transition-all",
        onClick && "cursor-pointer hover:shadow-md hover:-translate-y-0.5",
      )}
    >
      <CardContent className="flex items-center justify-between py-4">
        <div className="flex items-center gap-3">
          <div className="rounded-md bg-muted p-2">
            <Icon className="h-4 w-4 text-muted-foreground" />
          </div>
          <div>
            <p className="text-xs text-muted-foreground">{label}</p>
            <p className="text-sm font-semibold">{value}</p>
          </div>
        </div>
        <StatusPill level={level} mock />
      </CardContent>
    </Card>
  );
}

function PanelCard({
  icon: Icon,
  title,
  tone = "emerald",
  mock,
  children,
}: {
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  tone?: keyof typeof TINT;
  mock?: boolean;
  children: React.ReactNode;
}) {
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center gap-2 text-sm font-semibold">
          <span className={cn("rounded-md p-1.5", TINT[tone])}>
            <Icon className="h-4 w-4" />
          </span>
          <span>{title}</span>
          {mock && (
            <Badge
              variant="outline"
              className="ml-1 h-4 px-1.5 text-[9px] font-normal uppercase tracking-wide text-muted-foreground"
            >
              Mock
            </Badge>
          )}
        </CardTitle>
      </CardHeader>
      <CardContent>{children}</CardContent>
    </Card>
  );
}

function EmptyHint({ children }: { children: React.ReactNode }) {
  return <p className="text-sm text-muted-foreground">{children}</p>;
}

function ServiceRow({ name, level }: { name: string; level: StatusLevel }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-muted-foreground">{name}</span>
      <StatusPill level={level} showLabel mock />
    </div>
  );
}

export default AdminExecutiveOverview;

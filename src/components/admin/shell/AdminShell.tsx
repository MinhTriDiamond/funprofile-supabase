import { useEffect, useMemo } from "react";
import { Outlet, useLocation, useNavigate, useSearchParams } from "react-router-dom";
import { toast } from "sonner";

import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar";
import { FacebookNavbar } from "@/components/layout/FacebookNavbar";
import { useAdminRole } from "@/hooks/useAdminRole";
import { useLanguage } from "@/i18n/LanguageContext";
import {
  ADMIN_SLUGS,
  LEGACY_TAB_TO_SLUG,
  findAdminItem,
} from "@/config/adminNav";
import AdminSidebar from "./AdminSidebar";
import AdminTopHeader from "./AdminTopHeader";
import AdminStatusBar from "./AdminStatusBar";
import ComingSoonPanel from "./ComingSoonPanel";
import AdminExecutiveOverview from "@/components/admin/overview/AdminExecutiveOverview";
import PplpMintTab from "@/components/admin/PplpMintTab";
import FinanceDonationsTab from "@/components/admin/FinanceDonationsTab";
import RewardApprovalTab from "@/components/admin/RewardApprovalTab";
import UserManagementTab from "@/components/admin/UserManagementTab";
import FraudTab from "@/components/admin/FraudTab";
import PostModerationTab from "@/components/admin/PostModerationTab";
import SystemTab from "@/components/admin/SystemTab";
import LivestreamHealthTab from "@/components/admin/LivestreamHealthTab";
import PPLPv2AdminAudit from "@/components/admin/PPLPv2AdminAudit";
import ConnectorAdminTab from "@/components/admin/ConnectorAdminTab";
import QuestAdminTab from "@/components/admin/QuestAdminTab";
import MysteryBoxAdminTab from "@/components/admin/MysteryBoxAdminTab";
import TreasuryManagementTab from "@/components/admin/TreasuryManagementTab";
import WalletSecurityTab from "@/components/admin/WalletSecurityTab";
import FederationBackfillPage from "@/pages/admin/FederationBackfillPage";
import BackfillTab from "@/components/admin/BackfillTab";
import AdminSecretsPage from "@/pages/admin/AdminSecretsPage";
import TransactionsTrustPage from "@/pages/admin/TransactionsTrustPage";
import TransactionValidationPage from "@/pages/admin/TransactionValidationPage";
import { useAdminUsers, invalidateAdminData } from "@/hooks/useAdminUsers";
import { useCurrentUser } from "@/hooks/useCurrentUser";

// 240px desktop, 64px (~4rem) collapsed icon — theo yêu cầu Cha.
const ADMIN_SIDEBAR_STYLE = {
  "--sidebar-width": "15rem",
  "--sidebar-width-icon": "4rem",
} as React.CSSProperties;

/**
 * AdminShell — layout-route cho /admin.
 *  - Guard role admin (server-side vẫn enforce qua RPC).
 *  - Redirect URL cũ `/admin?tab=<x>` → `/admin/<slug>` tương ứng.
 *  - Nếu vào `/admin` (không slug) → /admin/overview.
 *  - Hỗ trợ nested slug có dấu `/`, ví dụ `federation/backfill`.
 */
export const AdminShell = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { isAdmin, isLoading: adminLoading } = useAdminRole();
  const { t } = useLanguage();

  // Guard role
  useEffect(() => {
    if (!adminLoading && !isAdmin) {
      toast.error(t("adminNoAccess"));
      navigate("/feed", { replace: true });
    }
  }, [isAdmin, adminLoading, navigate, t]);

  // Legacy `?tab=` redirect
  useEffect(() => {
    const legacyTab = searchParams.get("tab");
    if (legacyTab) {
      const slug = LEGACY_TAB_TO_SLUG[legacyTab] ?? "overview";
      navigate(`/admin/${slug}`, { replace: true });
    }
  }, [searchParams, navigate]);

  if (adminLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <div className="flex flex-col items-center gap-3">
          <div className="h-10 w-10 animate-spin rounded-full border-4 border-primary border-t-transparent" />
          <p className="text-sm text-muted-foreground">{t("adminCheckingAccess")}</p>
        </div>
      </div>
    );
  }

  if (!isAdmin) return null;

  return (
    <div className="min-h-screen bg-background">
      <FacebookNavbar />
      <div className="pt-14">
        <SidebarProvider defaultOpen style={ADMIN_SIDEBAR_STYLE}>
          <AdminSidebar />
          <SidebarInset className="min-w-0">
            <AdminTopHeader />
            <AdminStatusBar />
            <main
              data-app-scroll
              className="flex-1 overflow-x-hidden px-3 py-4 sm:px-6 sm:py-6"
            >
              <Outlet />
            </main>
          </SidebarInset>
        </SidebarProvider>
      </div>
    </div>
  );
};

/** Trang con — render tab tương ứng với slug (hỗ trợ nested). */
export const AdminSection = () => {
  const { pathname } = useLocation();
  const slug = useMemo(() => {
    const rest = pathname.replace(/^\/admin\/?/, "").replace(/\/$/, "");
    return rest || "overview";
  }, [pathname]);

  const { userId } = useCurrentUser();
  const { data: users = [] } = useAdminUsers();

  if (!ADMIN_SLUGS.includes(slug)) {
    return (
      <ComingSoonPanel
        title="Không tìm thấy module"
        description={`Đường dẫn /admin/${slug} không tồn tại.`}
      />
    );
  }

  const found = findAdminItem(slug);
  if (!found) return null;

  // Federation children chưa live → Roadmap card thay vì placeholder rỗng
  if (found.item.status === "coming-soon" && slug.startsWith("federation/")) {
    return (
      <ComingSoonPanel
        title={found.item.label}
        description="Phần của Federation Center. Đang chờ FUN Core mở API để productize."
        roadmap={{
          status: "Planned",
          completed: [
            { label: "FP-2A Complete" },
            { label: "Identity Backbone Connected" },
            { label: "Batch 100 PASS" },
          ],
          next: [
            { label: "Production Backfill (FP-2B)" },
            { label: "Sync Monitoring (FP-3)" },
            { label: "Realtime Events (FP-3)" },
            { label: "Federation Dashboard (FP-8)" },
          ],
        }}
      />
    );
  }

  if (found.item.status === "coming-soon") {
    return <ComingSoonPanel title={found.item.label} />;
  }

  if (!userId) return null;

  switch (slug) {
    case "overview":
      return <AdminExecutiveOverview />;
    case "federation":
      return (
        <ComingSoonPanel
          title="Federation Center"
          description="Trung tâm điều khiển Identity Federation của FUN Profile."
          roadmap={{
            status: "Live · FP-2A",
            completed: [
              { label: "FUN Profile ↔ FUN Core PASS end-to-end" },
              { label: "LoveHUB ↔ FUN Core PASS end-to-end" },
              { label: "Batch 10 / 50 / 100 PASS" },
              { label: "Identity Backbone hoạt động thực tế" },
            ],
            next: [
              { label: "Production Backfill (đang mở)" },
              { label: "Sync Monitoring" },
              { label: "Realtime Events" },
              { label: "Federation Dashboard tổng" },
            ],
          }}
        />
      );
    case "federation/backfill":
      return <FederationBackfillPage />;
    case "pplp-mint":
      return <PplpMintTab adminId={userId} />;
    case "finance":
      return <FinanceDonationsTab />;
    case "claims":
      return <RewardApprovalTab adminId={userId} onRefresh={invalidateAdminData} />;
    case "users":
      return <UserManagementTab users={users} adminId={userId} onRefresh={invalidateAdminData} />;
    case "fraud":
      return <FraudTab users={users} adminId={userId} onRefresh={invalidateAdminData} />;
    case "moderation":
      return <PostModerationTab />;
    case "livestream":
      return <LivestreamHealthTab />;
    case "pplp-approvals":
      return <PPLPv2AdminAudit adminId={userId} />;
    case "connector":
      return <ConnectorAdminTab adminId={userId} />;
    case "quests":
      return <QuestAdminTab />;
    case "mystery-box":
      return <MysteryBoxAdminTab />;
    case "treasury":
      return <TreasuryManagementTab />;
    case "wallet-security":
      return <WalletSecurityTab />;
    case "transactions-trust":
      return <TransactionsTrustPage />;
    case "transaction-validation":
      return <TransactionValidationPage />;
    case "secrets":
      return <AdminSecretsPage />;
    case "backfill":
      return <BackfillTab />;
    case "system":
      return <SystemTab adminId={userId} />;
    default:
      return <ComingSoonPanel title={found.item.label} />;
  }
};

export default AdminShell;

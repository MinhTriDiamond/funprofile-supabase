import { useEffect } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "sonner";
import { Shield, BarChart3, Gift, Users, DollarSign, Sparkles, FileText, ShieldAlert, Settings, LogOut, Radio, ClipboardCheck, Link2, Trophy, PackageOpen, Vault, Lock, Scale, Ban, DatabaseZap } from "lucide-react";
import { FacebookNavbar } from "@/components/layout/FacebookNavbar";
import { MobileBottomNav } from "@/components/layout/MobileBottomNav";
import { useAdminUsers, invalidateAdminData } from "@/hooks/useAdminUsers";
import { useAdminRole } from "@/hooks/useAdminRole";
import { useCurrentUser } from "@/hooks/useCurrentUser";
import { useLanguage } from "@/i18n/LanguageContext";
import { usePersistedTab } from "@/hooks/usePersistedTab";

import OverviewTab from "@/components/admin/OverviewTab";
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
import WalletReconciliationTab from "@/components/admin/WalletReconciliationTab";
import BannedUsersTab from "@/components/admin/BannedUsersTab";
import ExternalTxFilterTab from "@/components/admin/ExternalTxFilterTab";
import BackfillTab from "@/components/admin/BackfillTab";

const Admin = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { isAdmin, isLoading: adminLoading } = useAdminRole();
  const { userId: currentUserId } = useCurrentUser();
  const { t } = useLanguage();
  const validTabs = ["overview", "pplp", "finance", "rewards", "users", "banned", "fraud", "moderation", "livestream", "audit", "connector", "quests", "mystery-box", "treasury", "wallet-security", "external-filter", "reconciliation", "backfill", "system"] as const;
  const tabParam = searchParams.get("tab");
  const [activeTab, setActiveTab] = usePersistedTab(
    'admin-tab',
    tabParam && (validTabs as readonly string[]).includes(tabParam) ? tabParam : "overview",
    validTabs,
  );

  const { data: users = [], isLoading: usersLoading } = useAdminUsers();

  // Redirect non-admin users
  useEffect(() => {
    if (!adminLoading && !isAdmin) {
      toast.error(t('adminNoAccess'));
      navigate("/feed");
    }
  }, [isAdmin, adminLoading, navigate]);

  const stats = {
    totalUsers: users.filter(u => !u.is_banned).length,
    pendingRewards: users.filter(u => u.pending_reward > 0).length,
    approvedRewards: users.filter(u => u.approved_reward > 0).length,
    onChainClaims: 0,
    bannedUsers: users.filter(u => u.is_banned).length,
    suspiciousUsers: users.filter(u => !u.is_banned && (!u.avatar_url || !u.full_name)).length
  };

  if (adminLoading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="flex flex-col items-center gap-4">
          <div className="w-12 h-12 border-4 border-primary border-t-transparent rounded-full animate-spin" />
          <p className="text-muted-foreground">{t('adminCheckingAccess')}</p>
        </div>
      </div>
    );
  }

  if (!isAdmin) return null;

  return (
    <div className="min-h-screen bg-background overflow-hidden">
      <FacebookNavbar />
      <main data-app-scroll className="app-main app-pb-nav">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
          {/* Header */}
          <div className="flex items-center justify-between mb-6">
            <div className="flex items-center gap-3">
              <div className="p-3 bg-gradient-to-br from-yellow-400 to-orange-500 rounded-xl shadow-lg">
                <Shield className="w-8 h-8 text-white" />
              </div>
              <div>
                <h1 className="text-2xl font-bold text-foreground">{t('adminDashboardTitle')}</h1>
                <p className="text-muted-foreground">{t('adminDashboardSubtitle')}</p>
              </div>
            </div>
            <Button variant="outline" onClick={() => navigate("/")} className="gap-2">
              <LogOut className="w-4 h-4" />
              {t('adminExit')}
            </Button>
          </div>

          {/* 8 Tabs */}
          <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-6">
            <TabsList className="grid w-full grid-cols-4 lg:grid-cols-[repeat(16,minmax(0,1fr))] h-auto">
              <TabsTrigger value="overview" className="gap-2 py-3">
                <BarChart3 className="w-4 h-4" />
                <span className="hidden sm:inline">{t('adminTabOverview')}</span>
              </TabsTrigger>
              <TabsTrigger value="pplp" className="gap-2 py-3">
                <Sparkles className="w-4 h-4" />
                <span className="hidden sm:inline">{t('adminTabPplp')}</span>
              </TabsTrigger>
              <TabsTrigger value="finance" className="gap-2 py-3">
                <DollarSign className="w-4 h-4" />
                <span className="hidden sm:inline">{t('adminTabFinance')}</span>
              </TabsTrigger>
              <TabsTrigger value="rewards" className="gap-2 py-3">
                <Gift className="w-4 h-4" />
                <span className="hidden sm:inline">{t('adminTabRewards')}</span>
              </TabsTrigger>
              <TabsTrigger value="users" className="gap-2 py-3">
                <Users className="w-4 h-4" />
                <span className="hidden sm:inline">{t('adminTabUsers')}</span>
              </TabsTrigger>
              <TabsTrigger value="banned" className="gap-2 py-3">
                <Ban className="w-4 h-4" />
                <span className="hidden sm:inline">{t('admBlocked')}</span>
              </TabsTrigger>
              <TabsTrigger value="fraud" className="gap-2 py-3">
                <ShieldAlert className="w-4 h-4" />
                <span className="hidden sm:inline">{t('adminTabFraud')}</span>
              </TabsTrigger>
              <TabsTrigger value="moderation" className="gap-2 py-3">
                <FileText className="w-4 h-4" />
                <span className="hidden sm:inline">{t('adminTabModeration')}</span>
              </TabsTrigger>
              <TabsTrigger value="livestream" className="gap-2 py-3">
                <Radio className="w-4 h-4" />
                <span className="hidden sm:inline">{t('adminTabLivestream')}</span>
              </TabsTrigger>
              <TabsTrigger value="audit" className="gap-2 py-3">
                <ClipboardCheck className="w-4 h-4" />
                <span className="hidden sm:inline">{t('adminTabAudit')}</span>
              </TabsTrigger>
              <TabsTrigger value="connector" className="gap-2 py-3">
                <Link2 className="w-4 h-4" />
                <span className="hidden sm:inline">Connector</span>
              </TabsTrigger>
              <TabsTrigger value="quests" className="gap-2 py-3">
                <Trophy className="w-4 h-4" />
                <span className="hidden sm:inline">{t('adminTabQuests')}</span>
              </TabsTrigger>
              <TabsTrigger value="mystery-box" className="gap-2 py-3">
                <PackageOpen className="w-4 h-4" />
                <span className="hidden sm:inline">{t('admMysteryBox')}</span>
              </TabsTrigger>
              <TabsTrigger value="treasury" className="gap-2 py-3">
                <Vault className="w-4 h-4" />
                <span className="hidden sm:inline">Treasury</span>
              </TabsTrigger>
              <TabsTrigger value="wallet-security" className="gap-2 py-3">
                <Lock className="w-4 h-4" />
                <span className="hidden sm:inline">{t('admWalletGuard')}</span>
              </TabsTrigger>
              <TabsTrigger value="external-filter" className="gap-2 py-3">
                <ShieldAlert className="w-4 h-4" />
                <span className="hidden sm:inline">{t('admExternalWalletFilter')}</span>
              </TabsTrigger>
              <TabsTrigger value="reconciliation" className="gap-2 py-3">
                <Scale className="w-4 h-4" />
                <span className="hidden sm:inline">{t('admWalletReconcile')}</span>
              </TabsTrigger>
              <TabsTrigger value="backfill" className="gap-2 py-3">
                <DatabaseZap className="w-4 h-4" />
                <span className="hidden sm:inline">Backfill</span>
              </TabsTrigger>
              <TabsTrigger value="system" className="gap-2 py-3">
                <Settings className="w-4 h-4" />
                <span className="hidden sm:inline">{t('adminTabSystem')}</span>
              </TabsTrigger>
            </TabsList>


            <TabsContent value="overview">
              <OverviewTab stats={stats} onNavigate={setActiveTab} />
            </TabsContent>
            <TabsContent value="pplp">
              <PplpMintTab adminId={currentUserId!} />
            </TabsContent>
            <TabsContent value="finance">
              <FinanceDonationsTab />
            </TabsContent>
            <TabsContent value="rewards">
              <RewardApprovalTab adminId={currentUserId!} onRefresh={invalidateAdminData} />
            </TabsContent>
            <TabsContent value="users">
              <UserManagementTab users={users} adminId={currentUserId!} onRefresh={invalidateAdminData} />
            </TabsContent>
            <TabsContent value="banned">
              <BannedUsersTab />
            </TabsContent>
            <TabsContent value="fraud">
              <FraudTab users={users} adminId={currentUserId!} onRefresh={invalidateAdminData} />
            </TabsContent>
            <TabsContent value="moderation">
              <PostModerationTab />
            </TabsContent>
            <TabsContent value="livestream">
              <LivestreamHealthTab />
            </TabsContent>
            <TabsContent value="audit">
              <PPLPv2AdminAudit adminId={currentUserId!} />
            </TabsContent>
            <TabsContent value="connector">
              <ConnectorAdminTab adminId={currentUserId!} />
            </TabsContent>
            <TabsContent value="quests">
              <QuestAdminTab />
            </TabsContent>
            <TabsContent value="mystery-box">
              <MysteryBoxAdminTab />
            </TabsContent>
            <TabsContent value="treasury">
              <TreasuryManagementTab />
            </TabsContent>
            <TabsContent value="wallet-security">
              <WalletSecurityTab />
            </TabsContent>
            <TabsContent value="external-filter">
              <ExternalTxFilterTab />
            </TabsContent>
            <TabsContent value="reconciliation">
              <WalletReconciliationTab />
            </TabsContent>

            <TabsContent value="backfill">
              <BackfillTab />
            </TabsContent>

            <TabsContent value="system">
              <SystemTab adminId={currentUserId!} />
            </TabsContent>
          </Tabs>
        </div>
      </main>
      <MobileBottomNav />
    </div>
  );
};

export default Admin;

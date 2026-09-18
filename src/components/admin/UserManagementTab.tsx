import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Users, Ghost, Trash2, Share2, Trophy } from "lucide-react";
import { useLanguage } from "@/i18n/LanguageContext";
import { usePersistedTab } from "@/hooks/usePersistedTab";
import UserReviewTab from "./UserReviewTab";
import GhostCleanupTab from "./GhostCleanupTab";
import QuickDeleteTab from "./QuickDeleteTab";
import SocialLinksTab from "./SocialLinksTab";
import QualifiedUsersTab from "./QualifiedUsersTab";
import type { AdminUserData } from "@/hooks/useAdminUsers";

interface UserManagementTabProps {
  users: AdminUserData[];
  adminId: string;
  onRefresh: () => void;
}

const UserManagementTab = ({ users, adminId, onRefresh }: UserManagementTabProps) => {
  const { t } = useLanguage();
  const [activeTab, setActiveTab] = usePersistedTab('admin-users-tab', 'review', ['review', 'qualified', 'ghost', 'delete', 'social'] as const);

  return (
    <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-4">
      <TabsList className="grid w-full grid-cols-5 h-auto">
        <TabsTrigger value="review" className="gap-2 py-2">
          <Users className="w-4 h-4" />
          <span className="hidden sm:inline">{t('adminReview')}</span>
        </TabsTrigger>
        <TabsTrigger value="qualified" className="gap-2 py-2">
          <Trophy className="w-4 h-4" />
          <span className="hidden sm:inline">{t('adminQualified')}</span>
        </TabsTrigger>
        <TabsTrigger value="ghost" className="gap-2 py-2">
          <Ghost className="w-4 h-4" />
          <span className="hidden sm:inline">{t('adminGhostUsers')}</span>
        </TabsTrigger>
        <TabsTrigger value="delete" className="gap-2 py-2">
          <Trash2 className="w-4 h-4" />
          <span className="hidden sm:inline">{t('adminQuickDelete')}</span>
        </TabsTrigger>
        <TabsTrigger value="social" className="gap-2 py-2">
          <Share2 className="w-4 h-4" />
          <span className="hidden sm:inline">{t('adminSocialLinks')}</span>
        </TabsTrigger>
      </TabsList>

      <TabsContent value="review">
        <UserReviewTab users={users} adminId={adminId} onRefresh={onRefresh} />
      </TabsContent>
      <TabsContent value="qualified">
        <QualifiedUsersTab adminId={adminId} />
      </TabsContent>
      <TabsContent value="ghost">
        <GhostCleanupTab adminId={adminId} onNavigate={() => {}} />
      </TabsContent>
      <TabsContent value="delete">
        <QuickDeleteTab users={users} adminId={adminId} onRefresh={onRefresh} />
      </TabsContent>
      <TabsContent value="social">
        <SocialLinksTab />
      </TabsContent>
    </Tabs>
  );
};

export default UserManagementTab;

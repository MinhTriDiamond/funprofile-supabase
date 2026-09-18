import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Users, Clock, CheckCircle, Coins, AlertTriangle, ShieldOff } from "lucide-react";
import { useLanguage } from "@/i18n/LanguageContext";

interface OverviewStats {
  totalUsers: number;
  pendingRewards: number;
  approvedRewards: number;
  onChainClaims: number;
  bannedUsers: number;
  suspiciousUsers: number;
}

interface OverviewTabProps {
  stats: OverviewStats;
  onNavigate?: (tab: string) => void;
}

const OverviewTab = ({ stats, onNavigate }: OverviewTabProps) => {
  const { t } = useLanguage();

  const statCards = [
    { title: t('adminTotalUsers'), value: stats.totalUsers, icon: Users, color: "text-blue-500", bgColor: "bg-blue-500/10", navigateTo: undefined as string | undefined },
    { title: t('adminPendingRewards'), value: stats.pendingRewards, icon: Clock, color: "text-yellow-500", bgColor: "bg-yellow-500/10", navigateTo: undefined },
    { title: t('adminApprovedRewards'), value: stats.approvedRewards, icon: CheckCircle, color: "text-green-500", bgColor: "bg-green-500/10", navigateTo: undefined },
    { title: t('adminOnChainClaims'), value: stats.onChainClaims, icon: Coins, color: "text-purple-500", bgColor: "bg-purple-500/10", navigateTo: undefined },
    { title: t('adminBannedUsers'), value: stats.bannedUsers, icon: ShieldOff, color: "text-red-500", bgColor: "bg-red-500/10", navigateTo: "fraud" },
    { title: t('adminSuspiciousUsers'), value: stats.suspiciousUsers, icon: AlertTriangle, color: "text-orange-500", bgColor: "bg-orange-500/10", navigateTo: "fraud" },
  ];

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
        {statCards.map((stat, index) => (
          <Card
            key={index}
            className={`relative overflow-hidden transition-all ${stat.navigateTo ? "cursor-pointer hover:border-red-400 hover:shadow-md hover:scale-[1.02]" : ""}`}
            onClick={() => stat.navigateTo && onNavigate?.(stat.navigateTo)}
            title={stat.navigateTo ? t('adminClickToView') : undefined}
          >
            <CardHeader className="pb-2">
              <div className={`p-2 rounded-lg ${stat.bgColor} w-fit`}>
                <stat.icon className={`w-5 h-5 ${stat.color}`} />
              </div>
            </CardHeader>
            <CardContent>
              <p className="text-2xl font-bold">{stat.value.toLocaleString()}</p>
              <p className="text-xs text-muted-foreground">{stat.title}</p>
              {stat.navigateTo && <p className="text-xs text-red-400 mt-1">{t('adminViewList')}</p>}
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="grid md:grid-cols-2 gap-6">
        <Card>
          <CardHeader>
             <CardTitle className="text-lg flex items-center gap-2 text-primary">
              <Clock className="w-5 h-5 text-yellow-500" />
              {t('adminRecentActivity')}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-muted-foreground text-sm">{t('adminNoRecentActivity')}</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2 text-primary">
              <AlertTriangle className="w-5 h-5 text-orange-500" />
              {t('adminSystemAlerts')}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-muted-foreground text-sm">{t('adminNoAlerts')}</p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

export default OverviewTab;

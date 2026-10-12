import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAdminRole } from '@/hooks/useAdminRole';
import { FacebookNavbar } from '@/components/layout/FacebookNavbar';
import { MobileBottomNav } from '@/components/layout/MobileBottomNav';
import { Loader2, Crown } from 'lucide-react';
import { toast } from 'sonner';
import FounderOverviewPanel from '@/components/founder/FounderOverviewPanel';
import FounderUserInsightsPanel from '@/components/founder/FounderUserInsightsPanel';
import FounderPPLPAnalyticsPanel from '@/components/founder/FounderPPLPAnalyticsPanel';
import FounderEconomyPanel from '@/components/founder/FounderEconomyPanel';
import FounderEventPanel from '@/components/founder/FounderEventPanel';
import FounderAntiFakePanel from '@/components/founder/FounderAntiFakePanel';
import FounderAlertsPanel from '@/components/founder/FounderAlertsPanel';
import FounderMonetaryHealthPanel from '@/components/founder/FounderMonetaryHealthPanel';
import FounderIdentityPanel from '@/components/founder/FounderIdentityPanel';
import FunCorePilotPanel from '@/components/founder/FunCorePilotPanel';
import { ExportAllButton } from '@/components/founder/ExportAllButton';
import { useLanguage } from '@/i18n/LanguageContext';

/**
 * Guard kép:
 *  - Client: useAdminRole gọi RPC has_role (chặn render UI).
 *  - Server: mọi RPC get_founder_* là SECURITY DEFINER và tự verify
 *    has_role(auth.uid(),'admin') — non-admin nhận lỗi từ DB,
 *    không có data leak dù bypass client.
 */
const FounderDashboard = () => {
  const { t } = useLanguage();
  const { isAdmin, isLoading } = useAdminRole();
  const navigate = useNavigate();

  useEffect(() => {
    if (!isLoading && !isAdmin) {
      toast.error(t('fdNoAccess'));
      navigate('/');
    }
  }, [isAdmin, isLoading, navigate, t]);

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="animate-spin h-8 w-8 text-primary" />
      </div>
    );
  }

  if (!isAdmin) return null;

  return (
    <div className="min-h-screen bg-background">
      <FacebookNavbar />
      <div className="max-w-7xl mx-auto px-4 pt-20 pb-24">
        <div className="flex items-center gap-3 mb-6">
          <Crown className="h-7 w-7 text-gold" />
          <div className="flex-1">
            <h1 className="text-2xl font-bold">Founder Dashboard</h1>
            <p className="text-sm text-muted-foreground">{t('fdSubtitle')}</p>
          </div>
          <ExportAllButton />
        </div>


        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div className="lg:col-span-2">
            <FounderOverviewPanel />
          </div>
          <FounderMonetaryHealthPanel />
          <FounderIdentityPanel />
          <FounderUserInsightsPanel />
          <FounderPPLPAnalyticsPanel />
          <FounderEconomyPanel />
          <FounderEventPanel />
          <FounderAntiFakePanel />
          <FounderAlertsPanel />
          <FunCorePilotPanel />
        </div>
      </div>
      <MobileBottomNav />
    </div>
  );
};

export default FounderDashboard;

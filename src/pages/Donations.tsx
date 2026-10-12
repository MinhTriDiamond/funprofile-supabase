import { useEffect, useState, useCallback } from 'react';
import { Loader2 } from 'lucide-react';
import { FacebookNavbar } from '@/components/layout/FacebookNavbar';
import { MobileBottomNav } from '@/components/layout/MobileBottomNav';
import { PullToRefreshContainer } from '@/components/common/PullToRefreshContainer';
import { supabase } from '@/integrations/supabase/client';
import { useQueryClient } from '@tanstack/react-query';
import { TransactionHistoryPage } from '@/components/transactions/TransactionHistoryPage';
import { useLanguage } from '@/i18n/LanguageContext';

export default function Donations() {
  const { t } = useLanguage();
  const queryClient = useQueryClient();
  const [isAuthenticated, setIsAuthenticated] = useState<boolean | null>(null);

  useEffect(() => {
    const checkAuth = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      setIsAuthenticated(!!session);
    };
    checkAuth();
  }, []);

  const handlePullRefresh = useCallback(async () => {
    await queryClient.invalidateQueries({ queryKey: ['unified-tx'] });
  }, [queryClient]);

  if (isAuthenticated === null) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <FacebookNavbar />
      <main data-app-scroll className="app-main app-pb-nav">
        <PullToRefreshContainer onRefresh={handlePullRefresh}>
          <div className="container max-w-5xl mx-auto px-4 py-6">
            <TransactionHistoryPage
              scope="global"
              userDisplayName={t('donCommunity')}
              presetFilters={{ type: 'gift' }}
              title={t('donTitle')}
              subtitle={t('donSubtitle')}
            />
          </div>
        </PullToRefreshContainer>
      </main>
      <MobileBottomNav />
    </div>
  );
}

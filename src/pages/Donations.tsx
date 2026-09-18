import { useEffect, useState, useCallback } from 'react';
import { Loader2 } from 'lucide-react';
import { FacebookNavbar } from '@/components/layout/FacebookNavbar';
import { MobileBottomNav } from '@/components/layout/MobileBottomNav';
import { PullToRefreshContainer } from '@/components/common/PullToRefreshContainer';
import { supabase } from '@/integrations/supabase/client';
import { useQueryClient } from '@tanstack/react-query';
import { TransactionHistoryPage } from '@/components/transactions/TransactionHistoryPage';

export default function Donations() {
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
              userDisplayName="Cộng đồng"
              presetFilters={{ type: 'gift' }}
              title="Lịch sử giao dịch quà tặng toàn hệ thống"
              subtitle="Toàn bộ giao dịch quà tặng công khai trên FUN Profile được hợp nhất từ một nguồn dữ liệu duy nhất."
            />
          </div>
        </PullToRefreshContainer>
      </main>
      <MobileBottomNav />
    </div>
  );
}

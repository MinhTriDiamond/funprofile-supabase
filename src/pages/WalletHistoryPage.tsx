/**
 * /wallet/history — full page Unified Transaction History cho owner.
 */
import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { FacebookNavbar } from '@/components/layout/FacebookNavbar';
import { MobileBottomNav } from '@/components/layout/MobileBottomNav';
import { useCurrentUser } from '@/hooks/useCurrentUser';
import { TransactionHistoryPage } from '@/components/transactions/TransactionHistoryPage';
import { Loader2 } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useQuery } from '@tanstack/react-query';
import { BackToHomeBar } from '@/components/layout/BackToHome';

export default function WalletHistoryPage() {
  const navigate = useNavigate();
  const { userId, isLoading, isAuthenticated } = useCurrentUser();

  useEffect(() => {
    if (!isLoading && !isAuthenticated) navigate('/auth');
  }, [isLoading, isAuthenticated, navigate]);

  const { data: profile } = useQuery({
    queryKey: ['profile-mini', userId],
    enabled: !!userId,
    staleTime: 5 * 60_000,
    queryFn: async () => {
      const { data } = await supabase
        .from('profiles')
        .select('username, display_name, public_wallet_address')
        .eq('id', userId!)
        .maybeSingle();
      return data;
    },
  });

  if (isLoading || !userId) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <FacebookNavbar />
      <main data-app-scroll className="app-main app-pb-nav">
        <div className="container mx-auto max-w-5xl px-4 py-6">
          <BackToHomeBar inline fallback="/wallet" className="mb-3" />
          <TransactionHistoryPage
            scope="self"
            targetUserId={userId}
            userDisplayName={profile?.display_name || profile?.username || 'Tôi'}
            userWalletAddress={profile?.public_wallet_address ?? null}
            title="Lịch sử giao dịch ví"
            subtitle="Tất cả giao dịch của bạn (gift, transfer, on-chain) tại một nơi duy nhất."
          />
        </div>
      </main>
      <MobileBottomNav />
    </div>
  );
}

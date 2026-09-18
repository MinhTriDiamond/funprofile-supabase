/**
 * /profile/:username/history — full page Unified Transaction History (public + owner + admin).
 */
import { useParams, useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { FacebookNavbar } from '@/components/layout/FacebookNavbar';
import { MobileBottomNav } from '@/components/layout/MobileBottomNav';
import { supabase } from '@/integrations/supabase/client';
import { TransactionHistoryPage } from '@/components/transactions/TransactionHistoryPage';
import { Loader2, ArrowLeft } from 'lucide-react';
import { Button } from '@/components/ui/button';

export default function ProfileHistoryPage() {
  const { username } = useParams<{ username: string }>();
  const navigate = useNavigate();

  const { data: profile, isLoading } = useQuery({
    queryKey: ['public-profile', username],
    enabled: !!username,
    staleTime: 60_000,
    queryFn: async () => {
      const { data } = await supabase
        .from('public_profiles')
        .select('id, username, display_name, avatar_url, public_wallet_address')
        .eq('username', username!)
        .maybeSingle();
      return data;
    },
  });

  if (isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!profile) {
    return (
      <div className="min-h-screen bg-background">
        <FacebookNavbar />
        <div className="container mx-auto max-w-2xl px-4 py-12 text-center">
          <p className="text-muted-foreground">Không tìm thấy người dùng @{username}.</p>
          <Button variant="outline" className="mt-4" onClick={() => navigate(-1)}>Quay lại</Button>
        </div>
        <MobileBottomNav />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <FacebookNavbar />
      <main data-app-scroll className="app-main app-pb-nav">
        <div className="container mx-auto max-w-5xl px-4 py-6">
          <Button variant="ghost" size="sm" onClick={() => navigate(-1)} className="mb-3">
            <ArrowLeft className="mr-1 h-4 w-4" /> Quay lại profile
          </Button>
          <TransactionHistoryPage
            scope="profile"
            targetUserId={profile.id}
            userDisplayName={profile.display_name || profile.username || username || ''}
            userWalletAddress={profile.public_wallet_address ?? null}
            title={`Lịch sử của @${profile.username}`}
            subtitle="Lịch sử giao dịch công khai — mọi người đều xem được đầy đủ."
          />
        </div>
      </main>
      <MobileBottomNav />
    </div>
  );
}

import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

/**
 * Hook lấy địa chỉ ví đã liên kết từ backend (profile).
 * Đây là source of truth cross-device: nếu user đã liên kết ví trên desktop,
 * mobile cũng sẽ nhận biết qua hook này.
 */
export function useLinkedWallet() {
  const { data, isLoading } = useQuery({
    queryKey: ['linked-wallet'],
    queryFn: async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.user) return null;

      const { data: profile } = await supabase
        .from('profiles')
        .select('public_wallet_address, external_wallet_address, login_wallet_address, wallet_address')
        .eq('id', session.user.id)
        .single();

      if (!profile) return null;

      // Ưu tiên: external > public > login > wallet
      const linkedAddress = (
        profile.external_wallet_address ||
        profile.public_wallet_address ||
        profile.login_wallet_address ||
        profile.wallet_address
      ) as string | null;

      return linkedAddress?.toLowerCase() || null;
    },
    staleTime: 30_000,
  });

  return {
    linkedWalletAddress: data ?? null,
    isLoading,
  };
}

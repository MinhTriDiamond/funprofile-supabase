import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

export interface WalletSecurityStatus {
  walletRiskStatus: string;
  claimFreezeUntil: string | null;
  lastWalletChangeAt: string | null;
  walletChangeCount30d: number;
  isFrozen: boolean;
  isBlocked: boolean;
  freezeHoursLeft: number;
  walletChangeDisabled: boolean;
  walletChangeMessage: string;
}

export function useWalletSecurity(userId: string | null) {
  return useQuery({
    queryKey: ['wallet-security', userId],
    queryFn: async (): Promise<WalletSecurityStatus> => {
      if (!userId) throw new Error('No user');

      const [profileRes, configRes] = await Promise.all([
        supabase
          .from('my_profile_moderation')
          .select('wallet_risk_status, claim_freeze_until, last_wallet_change_at, wallet_change_count_30d')
          .eq('id', userId)
          .single(),
        supabase
          .from('system_config')
          .select('value')
          .eq('key', 'WALLET_CHANGE_DISABLED')
          .single(),
      ]);

      const profile = profileRes.data;
      const config = configRes.data;

      const freezeUntil = profile?.claim_freeze_until;
      const now = new Date();
      const isFrozen = freezeUntil ? new Date(freezeUntil) > now : false;
      const freezeHoursLeft = freezeUntil 
        ? Math.max(0, Math.ceil((new Date(freezeUntil).getTime() - now.getTime()) / (1000 * 60 * 60)))
        : 0;

      const configValue = config?.value as Record<string, unknown> | null;

      return {
        walletRiskStatus: profile?.wallet_risk_status || 'normal',
        claimFreezeUntil: freezeUntil || null,
        lastWalletChangeAt: profile?.last_wallet_change_at || null,
        walletChangeCount30d: profile?.wallet_change_count_30d || 0,
        isFrozen,
        isBlocked: profile?.wallet_risk_status === 'blocked',
        freezeHoursLeft,
        walletChangeDisabled: configValue?.enabled === true,
        walletChangeMessage: (configValue?.message as string) || 'Tạm khóa đổi ví để nâng cấp bảo mật.',
      };
    },
    enabled: !!userId,
    staleTime: 60 * 1000,
    refetchOnWindowFocus: false,
  });
}

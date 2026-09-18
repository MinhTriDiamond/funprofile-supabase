import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useCurrentUser } from '@/hooks/useCurrentUser';

export type WatchedWalletChain = 'bsc' | 'btc';
export type WatchedWalletSource = 'linked_main' | 'btc_aux' | 'user_added';

export interface WatchedWallet {
  address: string;
  chain: WatchedWalletChain;
  label: string;
  source: WatchedWalletSource;
  id?: string; // chỉ có khi source = user_added
  enabled?: boolean;
}

/**
 * Gộp toàn bộ địa chỉ ví ngoài user đang theo dõi:
 * 1. Ví liên kết chính (profiles.external_wallet_address / public_wallet_address)
 * 2. Địa chỉ BTC phụ (profile_btc_aux_addresses)
 * 3. Ví user tự thêm (user_watched_wallets)
 */
export function useWatchedWallets() {
  const { userId } = useCurrentUser();

  return useQuery({
    queryKey: ['watched-wallets', userId],
    enabled: !!userId,
    staleTime: 30_000,
    refetchOnWindowFocus: false,
    queryFn: async (): Promise<WatchedWallet[]> => {
      if (!userId) return [];
      const [profileRes, btcAuxRes, watchedRes] = await Promise.all([
        supabase
          .from('profiles')
          .select('external_wallet_address, public_wallet_address, btc_address')
          .eq('id', userId)
          .maybeSingle(),
        supabase
          .from('profile_btc_aux_addresses')
          .select('address')
          .eq('user_id', userId),
        supabase
          .from('user_watched_wallets')
          .select('id, address, chain, label, enabled')
          .eq('user_id', userId)
          .eq('enabled', true),
      ]);

      const out: WatchedWallet[] = [];
      const seen = new Set<string>();

      const push = (w: WatchedWallet) => {
        // BTC legacy (1.../3...) case-SENSITIVE ⇒ không lowercase; chỉ bech32/EVM mới hạ hoa.
        const norm =
          w.chain === 'btc' && !/^bc1[a-z0-9]+$/i.test(w.address.trim())
            ? w.address.trim()
            : w.address.toLowerCase();
        const k = `${w.chain}:${norm}`;

        if (seen.has(k)) return;
        seen.add(k);
        out.push(w);
      };

      const p = profileRes.data as any;
      if (p) {
        const evmAddr = (p.external_wallet_address || p.public_wallet_address || '').toLowerCase();
        if (evmAddr && evmAddr.startsWith('0x')) {
          push({ address: evmAddr, chain: 'bsc', label: 'Ví liên kết', source: 'linked_main' });
        }
        if (p.btc_address) {
          push({ address: p.btc_address, chain: 'btc', label: 'Ví BTC chính', source: 'linked_main' });
        }
      }

      for (const r of btcAuxRes.data || []) {
        push({ address: (r as any).address, chain: 'btc', label: 'Ví BTC phụ', source: 'btc_aux' });
      }

      for (const r of (watchedRes.data || []) as any[]) {
        push({
          id: r.id,
          address: r.address,
          chain: r.chain as WatchedWalletChain,
          label: r.label || 'Ví theo dõi',
          source: 'user_added',
          enabled: r.enabled,
        });
      }

      return out;
    },
  });
}

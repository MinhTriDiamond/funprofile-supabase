import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import type { WatchedWallet } from '@/hooks/useWatchedWallets';

export interface ExternalTx {
  chain: 'bsc' | 'bsc_testnet' | 'btc';
  category: 'native' | 'token' | 'swap' | 'nft';
  hash: string;
  timestamp: string;
  from: string;
  to: string;
  amount: string;
  tokenSymbol: string;
  tokenDecimal?: string;
  tokenName?: string;
  status: 'success' | 'pending' | 'failed';
  watchedAddress: string;
  watchedLabel?: string;
  _chainId?: number;
}

export interface ExternalSourceError {
  source: string;
  address: string;
  message: string;
}

export interface ExternalWalletActivityResult {
  result: ExternalTx[];
  errors: ExternalSourceError[];
  lastSyncAt: string;
  scanned: number;
  suspiciousCount: number;
  verifiedCount: number;
  registrySize: number;
}

// Tối ưu quota Moralis (18/08/2026): 20s → 120s. Mỗi tab mở trước đây tạo
// ~13.000 call/ngày; 120s giảm còn ~2.100. Người dùng vẫn có nút "Quét giao dịch"
// để làm mới ngay khi cần.
const REFRESH_MS = 120_000;


/**
 * Auto-import giao dịch on-chain từ tất cả ví đang theo dõi.
 * READ-ONLY: chỉ hiển thị, không tạo donation/gift/light_action.
 */
export function useExternalWalletActivity(wallets: WatchedWallet[] | undefined, limit = 30) {
  const enabled = !!wallets && wallets.length > 0;
  const key = (wallets || [])
    .map((w) => `${w.chain}:${w.address.toLowerCase()}`)
    .sort()
    .join(',');

  return useQuery<ExternalWalletActivityResult>({
    queryKey: ['external-wallet-activity', key, limit],
    enabled,
    staleTime: 60_000,
    refetchInterval: REFRESH_MS,
    refetchIntervalInBackground: false,

    retry: 2,
    queryFn: async () => {
      const payload = {
        wallets: (wallets || []).map((w) => ({
          address: w.address,
          chain: w.chain,
          label: w.label,
        })),
        limit,
        network: 'mainnet' as const,
      };
      const { data, error } = await supabase.functions.invoke('fetch-wallet-history', {
        body: payload,
      });
      if (error) throw error;
      return {
        result: (data?.result || []) as ExternalTx[],
        errors: (data?.errors || []) as ExternalSourceError[],
        lastSyncAt: data?.lastSyncAt || new Date().toISOString(),
        scanned: data?.scanned || 0,
        suspiciousCount: Number(data?.suspicious_count || 0),
        verifiedCount: Number(data?.verified_count || 0),
        registrySize: Number(data?.registry_size || 0),
      };
    },
  });
}

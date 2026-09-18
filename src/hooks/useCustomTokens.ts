import { useMemo } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { usePublicClient } from 'wagmi';
import { getAddress, isAddress } from 'viem';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { ERC20_ABI } from '@/lib/erc20';
import { WALLET_TOKENS } from '@/lib/tokens';

export const CUSTOM_TOKEN_CHAIN_ID = 56;

export interface CustomWalletToken {
  id: string;
  user_id: string;
  chain_id: number;
  address: `0x${string}`;
  symbol: string;
  name: string;
  decimals: number;
  logo_url: string | null;
  is_hidden: boolean;
  created_at: string;
  updated_at: string;
}

export interface CustomTokenMetadata {
  address: `0x${string}`;
  symbol: string;
  name: string;
  decimals: number;
}

const defaultTokenAddresses = new Set(
  WALLET_TOKENS
    .filter((token) => token.chainIds?.includes(CUSTOM_TOKEN_CHAIN_ID) && token.address)
    .map((token) => token.address!.toLowerCase()),
);
const defaultTokenSymbols = new Set(
  WALLET_TOKENS
    .filter((token) => token.chainIds?.includes(CUSTOM_TOKEN_CHAIN_ID))
    .map((token) => token.symbol.toUpperCase()),
);

function cleanText(value: unknown, fallback: string) {
  const text = String(value || '').trim();
  return text.length > 0 ? text.slice(0, 64) : fallback;
}

export function useCustomTokens(chainId = CUSTOM_TOKEN_CHAIN_ID) {
  return useQuery({
    queryKey: ['wallet-custom-tokens', chainId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('wallet_custom_tokens')
        .select('*')
        .eq('chain_id', chainId)
        .eq('is_hidden', false)
        .order('created_at', { ascending: true });

      if (error) throw error;
      return (data || []).map((token) => ({
        ...token,
        address: getAddress(token.address) as `0x${string}`,
      })) as CustomWalletToken[];
    },
    enabled: chainId === CUSTOM_TOKEN_CHAIN_ID,
    staleTime: 60_000,
  });
}

export function useCustomTokenActions() {
  const queryClient = useQueryClient();
  const publicClient = usePublicClient({ chainId: CUSTOM_TOKEN_CHAIN_ID });

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ['wallet-custom-tokens', CUSTOM_TOKEN_CHAIN_ID] });
  };

  const readMetadata = async (rawAddress: string): Promise<CustomTokenMetadata> => {
    const trimmed = rawAddress.trim();
    if (!isAddress(trimmed)) {
      throw new Error('Địa chỉ token chưa hợp lệ.');
    }

    const address = getAddress(trimmed) as `0x${string}`;
    if (defaultTokenAddresses.has(address.toLowerCase())) {
      throw new Error('Token này đã có sẵn trong ví FUN Profile.');
    }
    if (!publicClient) {
      throw new Error('Chưa kết nối được BNB Smart Chain. Vui lòng thử lại.');
    }

    try {
      const [symbol, name, decimals] = await Promise.all([
        publicClient.readContract({ address, abi: ERC20_ABI, functionName: 'symbol' } as any),
        publicClient.readContract({ address, abi: ERC20_ABI, functionName: 'name' } as any),
        publicClient.readContract({ address, abi: ERC20_ABI, functionName: 'decimals' } as any),
      ]);

      const parsedDecimals = Number(decimals);
      if (!Number.isInteger(parsedDecimals) || parsedDecimals < 0 || parsedDecimals > 36) {
        throw new Error('DECIMALS_INVALID');
      }

      const cleanSymbol = cleanText(symbol, 'TOKEN');
      if (defaultTokenSymbols.has(cleanSymbol.toUpperCase())) {
        throw new Error('DEFAULT_TOKEN_SYMBOL');
      }

      return {
        address,
        symbol: cleanSymbol,
        name: cleanText(name, cleanSymbol),
        decimals: parsedDecimals,
      };
    } catch (err) {
      if (err instanceof Error && err.message === 'DEFAULT_TOKEN_SYMBOL') {
        throw new Error('Token này đã có sẵn trong ví FUN Profile.');
      }
      throw new Error('Token không hợp lệ trên BNB Smart Chain.');
    }
  };

  const addToken = useMutation({
    mutationFn: async (metadata: CustomTokenMetadata) => {
      const { data: auth } = await supabase.auth.getUser();
      const userId = auth.user?.id;
      if (!userId) throw new Error('Vui lòng đăng nhập trước khi thêm token.');

      const { data: existing, error: existingError } = await supabase
        .from('wallet_custom_tokens')
        .select('id, is_hidden')
        .eq('user_id', userId)
        .eq('chain_id', CUSTOM_TOKEN_CHAIN_ID)
        .ilike('address', metadata.address)
        .maybeSingle();

      if (existingError) throw existingError;

      if (existing?.id) {
        if (existing.is_hidden) {
          const { error } = await supabase
            .from('wallet_custom_tokens')
            .update({ is_hidden: false })
            .eq('id', existing.id);
          if (error) throw error;
          return;
        }
        throw new Error('Token này đã được thêm vào ví của bạn.');
      }

      const { error } = await supabase.from('wallet_custom_tokens').insert({
        user_id: userId,
        chain_id: CUSTOM_TOKEN_CHAIN_ID,
        address: metadata.address,
        symbol: metadata.symbol,
        name: metadata.name,
        decimals: metadata.decimals,
      });

      if (error) throw error;
    },
    onSuccess: () => {
      invalidate();
      toast.success('Đã thêm token vào ví.');
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const hideToken = useMutation({
    mutationFn: async (tokenId: string) => {
      const { error } = await supabase
        .from('wallet_custom_tokens')
        .update({ is_hidden: true })
        .eq('id', tokenId);
      if (error) throw error;
    },
    onSuccess: () => {
      invalidate();
      toast.success('Đã ẩn token khỏi ví.');
    },
    onError: (error: Error) => toast.error(error.message),
  });

  return useMemo(() => ({
    readMetadata,
    addToken,
    hideToken,
  }), [addToken, hideToken, publicClient]);
}

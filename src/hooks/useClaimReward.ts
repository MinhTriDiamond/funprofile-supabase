import { useState, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';

interface ClaimResult {
  success: boolean;
  pending?: boolean;
  pending_claim_id?: string;
  tx_hash?: string;
  amount: number;
  wallet_address: string;
  block_number?: string;
  message: string;
  bscscan_url?: string;
  daily_claimed: number;
  daily_remaining: number;
}

interface ClaimError {
  error: string;
  message: string;
}

export const useClaimReward = () => {
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [txHash, setTxHash] = useState<string | null>(null);
  const [result, setResult] = useState<ClaimResult | null>(null);
  const queryClient = useQueryClient();

  const claimReward = useCallback(async (amount: number, walletAddress: string): Promise<ClaimResult | null> => {
    setIsLoading(true);
    setError(null);
    setTxHash(null);
    setResult(null);

    try {
      const { data: { session } } = await supabase.auth.getSession();
      
      if (!session?.access_token) {
        throw new Error('Vui lòng đăng nhập để tiếp tục');
      }

      const response = await supabase.functions.invoke('claim-reward', {
        body: {
          wallet_address: walletAddress,
          amount: amount,
        },
      });

      if (response.error) {
        let errorMsg = response.error.message || 'Lỗi không xác định';
        try {
          const errorBody = await response.error.context?.json();
          if (errorBody?.message) {
            errorMsg = errorBody.message;
          }
        } catch { /* response body parse — safe to ignore */ }
        setError(errorMsg);
        toast.error(errorMsg);
        return null;
      }

      const data = response.data as ClaimResult | ClaimError;

      if ('error' in data) {
        setError(data.message);
        toast.error(data.message);
        return null;
      }

      // Success (pending or completed)
      if (data.tx_hash) {
        setTxHash(data.tx_hash);
      }
      setResult(data);
      
      // Invalidate caches to refresh UI
      queryClient.invalidateQueries({ queryKey: ['reward-stats'] });
      queryClient.invalidateQueries({ queryKey: ['transaction-history'] });
      queryClient.invalidateQueries({ queryKey: ['notifications'] });
      queryClient.invalidateQueries({ queryKey: ['pending-claims'] });
      
      return data;

    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Lỗi khi claim reward';
      setError(message);
      toast.error(message);
      return null;
    } finally {
      setIsLoading(false);
    }
  }, [queryClient]);

  const reset = useCallback(() => {
    setIsLoading(false);
    setError(null);
    setTxHash(null);
    setResult(null);
  }, []);

  return {
    claimReward,
    isLoading,
    error,
    txHash,
    result,
    reset,
  };
};

export default useClaimReward;

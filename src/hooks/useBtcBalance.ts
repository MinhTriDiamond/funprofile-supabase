import { useState, useEffect, useCallback, useRef } from 'react';
import { toast } from 'sonner';

interface BtcBalanceDetails {
  balance: number;
  totalReceived: number;
  totalSent: number;
  txCount: number;
}

interface UseBtcBalanceResult {
  balance: number;
  totalReceived: number;
  totalSent: number;
  txCount: number;
  isLoading: boolean;
  error: Error | null;
  refetch: () => void;
}

const parseDetailsFromData = (data: any): BtcBalanceDetails => {
  const funded = data.chain_stats?.funded_txo_sum ?? 0;
  const spent = data.chain_stats?.spent_txo_sum ?? 0;
  const mempoolFunded = data.mempool_stats?.funded_txo_sum ?? 0;
  const mempoolSpent = data.mempool_stats?.spent_txo_sum ?? 0;
  const chainTx = data.chain_stats?.tx_count ?? 0;
  const mempoolTx = data.mempool_stats?.tx_count ?? 0;

  return {
    balance: ((funded - spent) + (mempoolFunded - mempoolSpent)) / 1e8,
    totalReceived: (funded + mempoolFunded) / 1e8,
    totalSent: (spent + mempoolSpent) / 1e8,
    txCount: chainTx + mempoolTx,
  };
};

const fetchWithRetry = async (addr: string, retries = 2): Promise<BtcBalanceDetails> => {
  for (let i = 0; i <= retries; i++) {
    try {
      const res = await fetch(`https://mempool.space/api/address/${addr}`);
      if (!res.ok) throw new Error(`Mempool API error: ${res.status}`);
      const data = await res.json();
      return parseDetailsFromData(data);
    } catch (err) {
      if (i === retries) {
        try {
          const res2 = await fetch(`https://blockstream.info/api/address/${addr}`);
          if (!res2.ok) throw new Error(`Blockstream API error: ${res2.status}`);
          const data2 = await res2.json();
          return parseDetailsFromData(data2);
        } catch {
          throw new Error('All BTC APIs failed');
        }
      }
      await new Promise(r => setTimeout(r, 2000));
    }
  }
  return { balance: 0, totalReceived: 0, totalSent: 0, txCount: 0 };
};

export function useBtcBalance(btcAddress: string | null | undefined): UseBtcBalanceResult {
  const [details, setDetails] = useState<BtcBalanceDetails>({ balance: 0, totalReceived: 0, totalSent: 0, txCount: 0 });
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const prevBalanceRef = useRef<number | null>(null);
  const lastFetchAtRef = useRef<number>(0);

  const fetchBalance = useCallback(async () => {
    if (!btcAddress) {
      setDetails({ balance: 0, totalReceived: 0, totalSent: 0, txCount: 0 });
      setError(null);
      return;
    }

    setIsLoading(true);
    setError(null);
    try {
      const result = await fetchWithRetry(btcAddress);
      
      // Toast khi phát hiện nhận BTC mới
      if (prevBalanceRef.current !== null && result.balance > prevBalanceRef.current) {
        const diff = result.balance - prevBalanceRef.current;
        toast.success(`📥 Nhận ${diff.toFixed(8)} BTC mới!`);
      }
      prevBalanceRef.current = result.balance;
      
      setDetails(result);
      lastFetchAtRef.current = Date.now();
    } catch (err) {
      console.error('[useBtcBalance] Error:', err);
      setError(err instanceof Error ? err : new Error('Unknown error'));
    } finally {
      setIsLoading(false);
    }
  }, [btcAddress]);

  useEffect(() => {
    prevBalanceRef.current = null;
    fetchBalance();
    if (btcAddress) {
      intervalRef.current = setInterval(fetchBalance, 60000);
    }
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [fetchBalance, btcAddress]);

  useEffect(() => {
    const handleVisibility = () => {
      if (document.visibilityState === 'visible' && btcAddress) {
        // Debounce: only refetch if last fetch was > 60s ago
        if (Date.now() - lastFetchAtRef.current > 60000) {
          fetchBalance();
        }
      }
    };
    document.addEventListener('visibilitychange', handleVisibility);
    return () => document.removeEventListener('visibilitychange', handleVisibility);
  }, [fetchBalance, btcAddress]);

  return {
    balance: details.balance,
    totalReceived: details.totalReceived,
    totalSent: details.totalSent,
    txCount: details.txCount,
    isLoading,
    error,
    refetch: fetchBalance,
  };
}

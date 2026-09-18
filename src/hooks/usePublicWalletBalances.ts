import { useState, useEffect, useCallback } from 'react';
import { TOKEN_CONTRACTS } from './useTokenBalances';

export interface PublicBalances {
  [symbol: string]: number;
}

const BSC_RPC = 'https://bsc-dataseed1.binance.org';

// balanceOf(address) selector = 0x70a08231
function encodeBalanceOf(addr: string): string {
  return '0x70a08231' + addr.slice(2).toLowerCase().padStart(64, '0');
}

async function ethCall(to: string, data: string): Promise<bigint> {
  const res = await fetch(BSC_RPC, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'eth_call', params: [{ to, data }, 'latest'] }),
  });
  const json = await res.json();
  if (json.error) throw new Error(json.error.message);
  return BigInt(normalizeRpcQuantity(json.result));
}

async function getEthBalance(addr: string): Promise<bigint> {
  const res = await fetch(BSC_RPC, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'eth_getBalance', params: [addr, 'latest'] }),
  });
  const json = await res.json();
  if (json.error) throw new Error(json.error.message);
  return BigInt(normalizeRpcQuantity(json.result));
}

function normalizeRpcQuantity(value: unknown): `0x${string}` {
  if (typeof value !== 'string') return '0x0';
  const trimmed = value.trim().toLowerCase();
  if (!trimmed || trimmed === '0x') return '0x0';
  if (!/^0x[0-9a-f]+$/i.test(trimmed)) return '0x0';
  return trimmed as `0x${string}`;
}

function fromWei(val: bigint, decimals = 18): number {
  return Number(val) / Math.pow(10, decimals);
}

export function usePublicWalletBalances(walletAddress: string | undefined) {
  const [balances, setBalances] = useState<PublicBalances>({});
  const [loading, setLoading] = useState(false);

  const fetchBalances = useCallback(async () => {
    if (!walletAddress || !walletAddress.startsWith('0x')) return;
    setLoading(true);
    try {
      const data = encodeBalanceOf(walletAddress);
      const [bnb, usdt, btcb, camly, fun] = await Promise.all([
        getEthBalance(walletAddress),
        ethCall(TOKEN_CONTRACTS.USDT, data),
        ethCall(TOKEN_CONTRACTS.BTCB, data),
        ethCall(TOKEN_CONTRACTS.CAMLY, data),
        ethCall(TOKEN_CONTRACTS.FUN, data),
      ]);

      setBalances({
        BNB: fromWei(bnb),
        USDT: fromWei(usdt),
        BTCB: fromWei(btcb),
        CAMLY: fromWei(camly),
        FUN: fromWei(fun),
      });
    } catch (err) {
      console.error('Failed to fetch on-chain balances:', err);
    } finally {
      setLoading(false);
    }
  }, [walletAddress]);

  useEffect(() => {
    fetchBalances();
  }, [fetchBalances]);

  return { balances, loading, refetch: fetchBalances };
}

import { useReadContract } from 'wagmi';
import { FUN_MONEY_MINTER_V2, FUN_MONEY_MINTER_V2_ABI } from '@/config/pplp';

export interface LockedGrant {
  amount: bigint;
  releaseAt: bigint;
  claimed: boolean;
}

export function useLockedGrants(userAddress?: `0x${string}`) {
  const isConfigured = FUN_MONEY_MINTER_V2.address !== '0x0000000000000000000000000000000000000000';

  const { data, isLoading, refetch } = useReadContract({
    address: FUN_MONEY_MINTER_V2.address,
    abi: FUN_MONEY_MINTER_V2_ABI,
    functionName: 'getLockedGrants',
    args: userAddress ? [userAddress] : undefined,
    chainId: FUN_MONEY_MINTER_V2.chainId,
    query: {
      enabled: !!userAddress && isConfigured,
    },
  });

  const grants: LockedGrant[] = (data as any[] || []).map((g: any) => ({
    amount: BigInt(g.amount || 0),
    releaseAt: BigInt(g.releaseAt || 0),
    claimed: Boolean(g.claimed),
  }));

  const releasableGrants = grants.filter(
    (g) => !g.claimed && BigInt(Math.floor(Date.now() / 1000)) >= g.releaseAt,
  );

  const totalLocked = grants
    .filter((g) => !g.claimed)
    .reduce((sum, g) => sum + g.amount, 0n);

  return {
    grants,
    releasableGrants,
    totalLocked,
    isLoading,
    isConfigured,
    refetch,
  };
}

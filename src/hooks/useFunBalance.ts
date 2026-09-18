import { useState, useEffect, useCallback } from 'react';
import { useAccount, useReadContract } from 'wagmi';
import { FUN_MONEY_CONTRACT, FUN_MONEY_ABI, fromWei } from '@/config/pplp';

export interface FunBalances {
  total: number;
  locked: number;
  activated: number;
  isLoading: boolean;
  error: Error | null;
  refetch: () => void;
}

export const useFunBalance = (customAddress?: `0x${string}`): FunBalances => {
  const { address: connectedAddress } = useAccount();
  const address = customAddress || connectedAddress;
  
  const [balances, setBalances] = useState<Omit<FunBalances, 'isLoading' | 'error' | 'refetch'>>({
    total: 0,
    locked: 0,
    activated: 0,
  });

  // Read total balance
  const { 
    data: totalWei, 
    isLoading: isLoadingTotal, 
    error: errorTotal,
    refetch: refetchTotal 
  } = useReadContract({
    address: FUN_MONEY_CONTRACT.address,
    abi: FUN_MONEY_ABI,
    functionName: 'balanceOf',
    args: address ? [address] : undefined,
    chainId: FUN_MONEY_CONTRACT.chainId,
    query: {
      enabled: !!address,
      refetchInterval: 30000,
      refetchIntervalInBackground: false,
    },
  });

  // Read allocation (locked + activated) from contract v1.2.1
  // alloc(address) returns (uint256 locked, uint256 activated)
  const { 
    data: allocData, 
    isLoading: isLoadingAlloc, 
    error: errorAlloc,
    refetch: refetchAlloc 
  } = useReadContract({
    address: FUN_MONEY_CONTRACT.address,
    abi: FUN_MONEY_ABI,
    functionName: 'alloc',
    args: address ? [address] : undefined,
    chainId: FUN_MONEY_CONTRACT.chainId,
    query: {
      enabled: !!address,
      refetchInterval: 30000,
      refetchIntervalInBackground: false,
    },
  });

  useEffect(() => {
    // balanceOf returns claimable tokens (after claim() is called)
    // alloc returns { locked, activated } - tokens still in contract
    const claimableTotal = totalWei ? fromWei(totalWei as bigint) : 0;
    
    // allocData is [locked, activated] tuple
    let locked = 0;
    let activated = 0;
    if (allocData && Array.isArray(allocData) && allocData.length >= 2) {
      locked = fromWei(allocData[0] as bigint);
      activated = fromWei(allocData[1] as bigint);
    }
    
    // Total = claimable (in wallet) + locked + activated (in contract)
    const total = claimableTotal + locked + activated;
    
    setBalances({ total, locked, activated });
  }, [totalWei, allocData]);

  const handleRefetch = useCallback(() => {
    refetchTotal();
    refetchAlloc();
  }, [refetchTotal, refetchAlloc]);

  const isLoading = isLoadingTotal || isLoadingAlloc;
  const error = errorTotal || errorAlloc;

  return {
    ...balances,
    isLoading,
    error: error as Error | null,
    refetch: handleRefetch,
  };
};

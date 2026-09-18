import { useMemo, useCallback } from 'react';
import { useAccount, useBalance, useReadContracts } from 'wagmi';
import { formatUnits } from 'viem';
import { bsc, mainnet, polygon } from 'wagmi/chains';
import { useReadContract } from 'wagmi';
import { useTokenPrices, type PriceData } from './useTokenPrices';
import { useCustomTokens, CUSTOM_TOKEN_CHAIN_ID } from './useCustomTokens';

// Token logos
import bnbLogo from '@/assets/tokens/bnb-logo.webp';
import usdtLogo from '@/assets/tokens/usdt-logo.webp';
import btcbLogo from '@/assets/tokens/btcb-logo.png';
import camlyLogo from '@/assets/tokens/camly-logo.webp';
import funLogo from '@/assets/tokens/fun-logo.png';
import ethLogo from '@/assets/tokens/eth-logo.png';
import maticLogo from '@/assets/tokens/matic-logo.png';

// Token contract addresses on BSC
export const TOKEN_CONTRACTS = {
  USDT: '0x55d398326f99059fF775485246999027B3197955' as `0x${string}`,
  BTCB: '0x7130d2A12B9BCbFAe4f2634d864A1Ee1Ce3Ead9c' as `0x${string}`,
  CAMLY: '0x0910320181889feFDE0BB1Ca63962b0A8882e413' as `0x${string}`,
  FUN: '0x39A1b047D5d143f8874888cfa1d30Fb2AE6F0CD6' as `0x${string}`,
};

// ERC20 ABI for balanceOf
const ERC20_BALANCE_ABI = [
  {
    name: 'balanceOf',
    type: 'function',
    stateMutability: 'view',
    inputs: [{ name: 'account', type: 'address' }],
    outputs: [{ name: '', type: 'uint256' }],
  },
] as const;

export interface TokenBalance {
  symbol: string;
  name: string;
  icon: string;
  balance: number;
  price: number;
  usdValue: number;
  change24h: number;
  isLoading: boolean;
  contractAddress?: string;
  decimals: number;
  isCustomToken?: boolean;
  customTokenId?: string;
}

interface UseTokenBalancesOptions {
  customAddress?: `0x${string}` | null;
}

export const useTokenBalances = (options?: UseTokenBalancesOptions) => {
  const { address: connectedAddress, isConnected, chainId } = useAccount();
  const { data: prices, isLoading: isPriceLoading } = useTokenPrices();
  // Chỉ dùng giá thị trường thật. Không có giá → 0 và cờ pricesUnavailable (không bịa giá).
  const priceOf = (...symbols: string[]): number => {
    for (const sym of symbols) {
      const p = prices?.[sym]?.usd;
      if (typeof p === 'number') return p;
    }
    return 0;
  };
  const changeOf = (...symbols: string[]): number => {
    for (const sym of symbols) {
      const c = prices?.[sym]?.usd_24h_change;
      if (typeof c === 'number') return c;
    }
    return 0;
  };
  const pricesUnavailable = !isPriceLoading && (!prices || Object.keys(prices).length === 0);

  const address = options?.customAddress || connectedAddress;
  const activeChainId = chainId || bsc.id;
  const { data: customTokens = [], refetch: refetchCustomTokens, isLoading: isCustomTokensLoading } = useCustomTokens(activeChainId);

  const isBsc = activeChainId === bsc.id || activeChainId === 97;
  const isMainnet = activeChainId === mainnet.id;
  const isPolygon = activeChainId === polygon.id;

  // ── Native balances ──
  const { data: nativeBalance, refetch: refetchNative, isLoading: isNativeLoading } = useBalance({
    address,
    chainId: activeChainId,
  });

  // ── BSC ERC-20 balances ──
  const { data: usdtBalance, refetch: refetchUsdt, isLoading: isUsdtLoading } = useReadContract({
    address: TOKEN_CONTRACTS.USDT,
    abi: ERC20_BALANCE_ABI,
    functionName: 'balanceOf',
    args: address ? [address] : undefined,
    chainId: activeChainId,
    query: { enabled: isBsc },
  });

  const { data: btcbBalance, refetch: refetchBtcb, isLoading: isBtcbLoading } = useReadContract({
    address: TOKEN_CONTRACTS.BTCB,
    abi: ERC20_BALANCE_ABI,
    functionName: 'balanceOf',
    args: address ? [address] : undefined,
    chainId: activeChainId,
    query: { enabled: isBsc },
  });

  const { data: camlyBalance, refetch: refetchCamly, isLoading: isCamlyLoading } = useReadContract({
    address: TOKEN_CONTRACTS.CAMLY,
    abi: ERC20_BALANCE_ABI,
    functionName: 'balanceOf',
    args: address ? [address] : undefined,
    chainId: activeChainId,
    query: { enabled: isBsc },
  });

  const { data: funBalance, refetch: refetchFun, isLoading: isFunLoading } = useReadContract({
    address: TOKEN_CONTRACTS.FUN,
    abi: ERC20_BALANCE_ABI,
    functionName: 'balanceOf',
    args: address ? [address] : undefined,
    chainId: activeChainId,
    query: { enabled: isBsc },
  });

  const customBalanceContracts = useMemo(() => {
    if (!address || activeChainId !== CUSTOM_TOKEN_CHAIN_ID) return [];
    return customTokens.map((token) => ({
      address: token.address,
      abi: ERC20_BALANCE_ABI,
      functionName: 'balanceOf',
      args: [address],
      chainId: CUSTOM_TOKEN_CHAIN_ID,
    })) as any;
  }, [address, activeChainId, customTokens]);

  const {
    data: customBalanceResults,
    refetch: refetchCustomBalances,
    isLoading: isCustomBalancesLoading,
  } = useReadContracts({
    contracts: customBalanceContracts,
    query: {
      enabled: customBalanceContracts.length > 0,
    },
  });

  // ── Parse balances ──
  const parseBalance = (value: bigint | undefined, decimals: number): number => {
    if (!value) return 0;
    return parseFloat(formatUnits(value, decimals));
  };

  const nativeAmount = nativeBalance ? parseFloat(nativeBalance.formatted) : 0;
  const usdtAmount = parseBalance(usdtBalance as bigint | undefined, 18);
  const btcbAmount = parseBalance(btcbBalance as bigint | undefined, 18);
  const camlyAmount = parseBalance(camlyBalance as bigint | undefined, 3);
  const funAmount = parseBalance(funBalance as bigint | undefined, 18);

  // ── Build chain-aware tokens array ──
  const tokens: TokenBalance[] = useMemo(() => {
    const result: TokenBalance[] = [];

    if (isMainnet) {
      result.push({
        symbol: 'ETH', name: 'Ethereum', icon: ethLogo, balance: nativeAmount,
        price: priceOf('ETH'), usdValue: nativeAmount * priceOf('ETH'),
        change24h: changeOf('ETH'), isLoading: isNativeLoading || isPriceLoading, decimals: 18,
      });
    } else if (isPolygon) {
      result.push({
        symbol: 'POL', name: 'Polygon', icon: maticLogo, balance: nativeAmount,
        price: priceOf('POL', 'MATIC'),
        usdValue: nativeAmount * priceOf('POL', 'MATIC'),
        change24h: changeOf('POL', 'MATIC'),
        isLoading: isNativeLoading || isPriceLoading, decimals: 18,
      });
    } else {
      // BSC (default)
      result.push(
        { symbol: 'BNB', name: 'BNB', icon: bnbLogo, balance: nativeAmount, price: priceOf('BNB'), usdValue: nativeAmount * priceOf('BNB'), change24h: changeOf('BNB'), isLoading: isNativeLoading || isPriceLoading, decimals: 18 },
        { symbol: 'USDT', name: 'Tether USD', icon: usdtLogo, balance: usdtAmount, price: priceOf('USDT'), usdValue: usdtAmount * priceOf('USDT'), change24h: changeOf('USDT'), isLoading: isUsdtLoading || isPriceLoading, contractAddress: TOKEN_CONTRACTS.USDT, decimals: 18 },
        { symbol: 'BTCB', name: 'Bitcoin BEP20', icon: btcbLogo, balance: btcbAmount, price: priceOf('BTCB', 'BTC'), usdValue: btcbAmount * priceOf('BTCB', 'BTC'), change24h: changeOf('BTCB', 'BTC'), isLoading: isBtcbLoading || isPriceLoading, contractAddress: TOKEN_CONTRACTS.BTCB, decimals: 18 },
        { symbol: 'CAMLY', name: 'Camly Coin', icon: camlyLogo, balance: camlyAmount, price: priceOf('CAMLY'), usdValue: camlyAmount * priceOf('CAMLY'), change24h: changeOf('CAMLY'), isLoading: isCamlyLoading || isPriceLoading, contractAddress: TOKEN_CONTRACTS.CAMLY, decimals: 3 },
        { symbol: 'FUN', name: 'FUN Money', icon: funLogo, balance: funAmount, price: 0, usdValue: 0, change24h: 0, isLoading: isFunLoading || isPriceLoading, contractAddress: TOKEN_CONTRACTS.FUN, decimals: 18 },
      );

      if (activeChainId === CUSTOM_TOKEN_CHAIN_ID) {
        customTokens.forEach((token, index) => {
          const rawBalance = customBalanceResults?.[index]?.status === 'success'
            ? customBalanceResults[index].result as bigint
            : undefined;
          const amount = parseBalance(rawBalance, token.decimals);

          result.push({
            symbol: token.symbol,
            name: token.name,
            icon: token.logo_url || bnbLogo,
            balance: amount,
            price: 0,
            usdValue: 0,
            change24h: 0,
            isLoading: isCustomBalancesLoading || isCustomTokensLoading,
            contractAddress: token.address,
            decimals: token.decimals,
            isCustomToken: true,
            customTokenId: token.id,
          });
        });
      }
    }

    return result;
  }, [isMainnet, isPolygon, activeChainId, nativeAmount, usdtAmount, btcbAmount, camlyAmount, funAmount, prices, isNativeLoading, isUsdtLoading, isBtcbLoading, isCamlyLoading, isFunLoading, isPriceLoading, customTokens, customBalanceResults, isCustomBalancesLoading, isCustomTokensLoading]);

  const totalUsdValue = tokens.reduce((sum, token) => sum + token.usdValue, 0);
  const isLoading = isNativeLoading || (isBsc && (isUsdtLoading || isBtcbLoading || isCamlyLoading || isFunLoading || isCustomBalancesLoading || isCustomTokensLoading)) || isPriceLoading;

  const refetch = useCallback(() => {
    refetchNative();
    if (isBsc) {
      refetchUsdt();
      refetchBtcb();
      refetchCamly();
      refetchFun();
      refetchCustomTokens();
      refetchCustomBalances();
    }
  }, [refetchNative, refetchUsdt, refetchBtcb, refetchCamly, refetchFun, refetchCustomTokens, refetchCustomBalances, isBsc]);

  return {
    tokens,
    totalUsdValue,
    pricesUnavailable,
    isLoading,
    refetch,
    prices,
    isConnected,
  };
};

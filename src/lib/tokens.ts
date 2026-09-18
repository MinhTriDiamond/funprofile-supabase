/**
 * Centralized token metadata for multi-chain wallet operations.
 */

import bnbLogo from '@/assets/tokens/bnb-logo.webp';
import usdtLogo from '@/assets/tokens/usdt-logo.webp';
import btcbLogo from '@/assets/tokens/btcb-logo.png';
import camlyLogo from '@/assets/tokens/camly-logo.webp';
import funLogo from '@/assets/tokens/fun-logo.png';
import btcLogo from '@/assets/tokens/btc-logo.png';
import ethLogo from '@/assets/tokens/eth-logo.png';
import maticLogo from '@/assets/tokens/matic-logo.png';

export interface WalletToken {
  symbol: string;
  name: string;
  address: `0x${string}` | null; // null for native coins
  decimals: number;
  logo: string;
  color: string;
  chainFamily?: 'evm' | 'bitcoin';
  /** Chain IDs where this token is relevant (undefined = all EVM) */
  chainIds?: number[];
}

export const WALLET_TOKENS: WalletToken[] = [
  // === Multi-chain native coins ===
  {
    symbol: 'ETH',
    name: 'Ethereum',
    address: null,
    decimals: 18,
    logo: ethLogo,
    color: 'from-blue-500 to-indigo-400',
    chainIds: [1],
  },
  {
    symbol: 'BNB',
    name: 'BNB',
    address: null,
    decimals: 18,
    logo: bnbLogo,
    color: 'from-amber-400 to-yellow-300',
    chainIds: [56, 97],
  },
  {
    symbol: 'POL',
    name: 'Polygon',
    address: null,
    decimals: 18,
    logo: maticLogo,
    color: 'from-purple-500 to-violet-400',
    chainIds: [137],
  },
  // === BSC tokens ===
  {
    symbol: 'USDT',
    name: 'Tether USD',
    address: '0x55d398326f99059fF775485246999027B3197955',
    decimals: 18,
    logo: usdtLogo,
    color: 'from-emerald-500 to-green-400',
    chainIds: [56, 97],
  },
  {
    symbol: 'BTCB',
    name: 'Bitcoin BEP20',
    address: '0x7130d2A12B9BCbFAe4f2634d864A1Ee1Ce3Ead9c',
    decimals: 18,
    logo: btcbLogo,
    color: 'from-orange-500 to-amber-400',
    chainIds: [56],
  },
  {
    symbol: 'FUN',
    name: 'FUN Money',
    address: '0x39A1b047D5d143f8874888cfa1d30Fb2AE6F0CD6',
    decimals: 18,
    logo: funLogo,
    color: 'from-primary to-green-400',
    chainIds: [56, 97],
  },
  {
    symbol: 'CAMLY',
    name: 'Camly Coin',
    address: '0x0910320181889feFDE0BB1Ca63962b0A8882e413',
    decimals: 3,
    logo: camlyLogo,
    color: 'from-purple-500 to-pink-400',
    chainIds: [56],
  },
  // === Bitcoin native ===
  {
    symbol: 'BTC',
    name: 'Bitcoin',
    address: null,
    decimals: 8,
    logo: btcLogo,
    color: 'from-orange-500 to-yellow-400',
    chainFamily: 'bitcoin',
  },
];

/** BNB gas buffer fallback when real-time gas price is unavailable */
export const BNB_GAS_BUFFER = 0.0005;

/** Find a token by symbol */
export const findToken = (symbol: string): WalletToken | undefined =>
  WALLET_TOKENS.find(t => t.symbol === symbol);

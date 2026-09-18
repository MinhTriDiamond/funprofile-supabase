/**
 * Chain & Token Address Mapping
 * Quản lý tập trung token addresses theo chain (BSC Mainnet / Testnet)
 */

export const BSC_MAINNET = 56;
export const BSC_TESTNET = 97;
export const BTC_MAINNET = 0;

export const CHAIN_INFO: Record<number, { name: string; shortName: string; explorerUrl: string; family: 'evm' | 'bitcoin' }> = {
  [BSC_MAINNET]: {
    name: 'BNB Smart Chain',
    shortName: 'BNB Mainnet',
    explorerUrl: 'https://bscscan.com',
    family: 'evm',
  },
  [BSC_TESTNET]: {
    name: 'BNB Smart Chain Testnet',
    shortName: 'BNB Testnet',
    explorerUrl: 'https://testnet.bscscan.com',
    family: 'evm',
  },
  [BTC_MAINNET]: {
    name: 'Bitcoin Network',
    shortName: 'Bitcoin',
    explorerUrl: 'https://mempool.space',
    family: 'bitcoin',
  },
};

/**
 * Token addresses theo chain.
 * - BNB native = null
 * - Token chưa deploy trên testnet = undefined → disabled trong UI
 */
export const TOKEN_ADDRESS_BY_CHAIN: Record<number, Record<string, string | null | undefined>> = {
  [BSC_MAINNET]: {
    BNB: null,
    FUN: '0x39A1b047D5d143f8874888cfa1d30Fb2AE6F0CD6',
    CAMLY: '0x0910320181889feFDE0BB1Ca63962b0A8882e413',
    USDT: '0x55d398326f99059fF775485246999027B3197955',
    BTCB: '0x7130d2A12B9BCbFAe4f2634d864A1Ee1Ce3Ead9c',
  },
  [BSC_TESTNET]: {
    BNB: null,
    FUN: '0x39A1b047D5d143f8874888cfa1d30Fb2AE6F0CD6',
    CAMLY: undefined, // chưa deploy
    USDT: undefined,  // chưa deploy
    BTCB: undefined,  // chưa deploy
  },
};

/** Lấy token address theo chain. Returns undefined nếu token chưa deploy trên chain đó */
export function getTokenAddress(symbol: string, chainId: number): string | null | undefined {
  const chainMap = TOKEN_ADDRESS_BY_CHAIN[chainId];
  if (!chainMap) return undefined;
  return chainMap[symbol];
}

/** Token có sẵn trên chain không? (BNB native luôn available, undefined = chưa deploy) */
export function isTokenAvailableOnChain(symbol: string, chainId: number): boolean {
  const chainMap = TOKEN_ADDRESS_BY_CHAIN[chainId];
  if (!chainMap) return false;
  // BNB (null) luôn available; undefined = chưa deploy
  return symbol in chainMap && chainMap[symbol] !== undefined;
}

/** BscScan base URL theo chainId */
export function getBscScanBaseUrl(chainId: number): string {
  return CHAIN_INFO[chainId]?.explorerUrl || CHAIN_INFO[BSC_MAINNET].explorerUrl;
}

/** BscScan TX URL theo chainId */
export function getBscScanTxUrlByChain(txHash: string, chainId: number): string {
  return `${getBscScanBaseUrl(chainId)}/tx/${txHash}`;
}

/** Chain name cho hiển thị */
export function getChainDisplayName(chainId: number): string {
  return CHAIN_INFO[chainId]?.shortName || `Chain ${chainId}`;
}

/** Danh sách symbols bị disabled trên 1 chain */
export function getDisabledTokens(chainId: number): string[] {
  const chainMap = TOKEN_ADDRESS_BY_CHAIN[chainId];
  if (!chainMap) return [];
  return Object.entries(chainMap)
    .filter(([, addr]) => addr === undefined)
    .map(([symbol]) => symbol);
}

/** Get chain family from chainId */
export function getChainFamily(chainId: number): 'evm' | 'bitcoin' {
  return CHAIN_INFO[chainId]?.family || 'evm';
}

/** Get explorer TX URL supporting both BSC and Bitcoin */
export function getExplorerTxUrl(txHash: string, chainId: number): string {
  const info = CHAIN_INFO[chainId];
  if (!info) return `https://bscscan.com/tx/${txHash}`;
  if (info.family === 'bitcoin') {
    return `https://mempool.space/tx/${txHash}`;
  }
  return `${info.explorerUrl}/tx/${txHash}`;
}

/** Get explorer address URL supporting both BSC and Bitcoin */
export function getExplorerAddressUrl(address: string, chainId: number): string {
  const info = CHAIN_INFO[chainId];
  if (!info) return `https://bscscan.com/address/${address}`;
  if (info.family === 'bitcoin') {
    return `https://mempool.space/address/${address}`;
  }
  return `${info.explorerUrl}/address/${address}`;
}

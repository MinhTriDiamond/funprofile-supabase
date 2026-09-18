/**
 * Gift Token Label — phân biệt token native trùng symbol trên nhiều chain.
 * Hiện tại chỉ áp dụng cho BNB (BSC Mainnet 56 vs Testnet 97).
 */

export const BNB_MAINNET_LABEL = 'BNB (BSC Chain)';
export const BNB_TESTNET_LABEL = 'BNB (BSC Testnet)';

export type GiftTokenDisplayLabel = string;

export function getGiftTokenLabel(symbol: string, chainId?: number | null): string {
  if (!symbol) return 'UNKNOWN';
  if (symbol === BNB_MAINNET_LABEL || symbol === BNB_TESTNET_LABEL) return symbol;
  const s = symbol.toUpperCase();
  if (s === 'BNB') {
    if (chainId === 97) return BNB_TESTNET_LABEL;
    return BNB_MAINNET_LABEL; // 56 hoặc null/undefined → mặc định mainnet
  }
  return s;
}

export function getGiftTokenBaseSymbol(labelOrSymbol: string | null | undefined): string {
  if (!labelOrSymbol) return 'UNKNOWN';
  const s = labelOrSymbol.toUpperCase();
  if (s.startsWith('BNB')) return 'BNB';
  return s;
}

export function getGiftTokenChainFilter(labelOrSymbol: string | null | undefined): string | undefined {
  if (!labelOrSymbol) return undefined;
  if (labelOrSymbol === BNB_TESTNET_LABEL) return 'bsc_testnet';
  if (labelOrSymbol === BNB_MAINNET_LABEL) return 'bsc';
  return undefined;
}

export function getGiftTokenChainIdFromLabel(labelOrSymbol: string | null | undefined): number | undefined {
  if (!labelOrSymbol) return undefined;
  if (labelOrSymbol === BNB_TESTNET_LABEL) return 97;
  if (labelOrSymbol === BNB_MAINNET_LABEL) return 56;
  return undefined;
}

/** Thứ tự ưu tiên hiển thị trong tooltip / breakdown */
export const GIFT_TOKEN_DISPLAY_ORDER = [
  'USDT',
  BNB_MAINNET_LABEL,
  BNB_TESTNET_LABEL,
  'CAMLY',
  'FUN',
  'BTC',
  'BTCB',
];

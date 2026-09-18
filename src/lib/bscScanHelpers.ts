/**
 * BscScan URL Helper Functions
 * 
 * Logic động để xác định URL BscScan phù hợp:
 * - FUN Money → Testnet (testnet.bscscan.com)
 * - Các token khác (BNB, CAMLY, USDT...) → Mainnet (bscscan.com)
 * 
 * Cũng hỗ trợ overload theo chainId trực tiếp via getBscScanTxUrlByChain()
 */

import { getBscScanTxUrlByChain as _getBscScanTxUrlByChain, getBscScanBaseUrl } from '@/lib/chainTokenMapping';

const MAINNET_URL = 'https://bscscan.com';
const TESTNET_URL = 'https://testnet.bscscan.com';

// Re-export chainId-based helpers
export { _getBscScanTxUrlByChain as getBscScanTxUrlByChain, getBscScanBaseUrl };

/**
 * Kiểm tra xem token có phải FUN Money không
 */
const isFunMoney = (tokenSymbol?: string): boolean => {
  return tokenSymbol?.toUpperCase() === 'FUN';
};

/**
 * Kiểm tra xem token có phải Bitcoin không
 */
const isBitcoin = (tokenSymbol?: string): boolean => {
  return tokenSymbol?.toUpperCase() === 'BTC';
};

/**
 * Lấy URL giao dịch BscScan dựa trên loại token
 * @param txHash - Hash của giao dịch
 * @param tokenSymbol - Symbol của token (FUN, CAMLY, BNB, etc.)
 * @returns URL đầy đủ đến trang giao dịch trên BscScan
 */
export const getBscScanTxUrl = (txHash: string, tokenSymbol?: string): string => {
  if (isBitcoin(tokenSymbol)) return `https://mempool.space/tx/${txHash}`;
  const baseUrl = isFunMoney(tokenSymbol) ? TESTNET_URL : MAINNET_URL;
  return `${baseUrl}/tx/${txHash}`;
};

/**
 * Lấy URL địa chỉ ví BscScan dựa trên loại token
 * @param address - Địa chỉ ví
 * @param tokenSymbol - Symbol của token (FUN, CAMLY, BNB, etc.)
 * @returns URL đầy đủ đến trang địa chỉ trên BscScan
 */
export const getBscScanAddressUrl = (address: string, tokenSymbol?: string): string => {
  if (isBitcoin(tokenSymbol)) return `https://mempool.space/address/${address}`;
  const baseUrl = isFunMoney(tokenSymbol) ? TESTNET_URL : MAINNET_URL;
  return `${baseUrl}/address/${address}`;
};

/**
 * Lấy URL token contract BscScan dựa trên loại token
 * @param contractAddress - Địa chỉ contract của token
 * @param tokenSymbol - Symbol của token (FUN, CAMLY, BNB, etc.)
 * @returns URL đầy đủ đến trang token trên BscScan
 */
export const getBscScanTokenUrl = (contractAddress: string, tokenSymbol?: string): string => {
  if (isBitcoin(tokenSymbol)) return `https://mempool.space/address/${contractAddress}`;
  const baseUrl = isFunMoney(tokenSymbol) ? TESTNET_URL : MAINNET_URL;
  return `${baseUrl}/token/${contractAddress}`;
};

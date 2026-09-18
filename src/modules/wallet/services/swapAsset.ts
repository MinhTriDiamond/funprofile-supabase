/**
 * Swap service: PancakeSwap Router V2 for ALL pairs on BSC.
 * Supports dynamic routing and fee-on-transfer tokens (e.g. CAMLY).
 */

import { readContract, writeContract, waitForTransactionReceipt } from '@wagmi/core';
import { parseUnits, formatUnits } from 'viem';
import { bsc } from 'wagmi/chains';
import { WALLET_TOKENS, type WalletToken } from '@/lib/tokens';
import {
  SWAP_CONFIG,
  PANCAKE_ROUTER_ABI,
  PANCAKE_FACTORY_ABI,
  ERC20_ABI,
  type SwappableSymbol,
} from '@/config/swap';

/* ─── Token helpers ─── */

const findToken = (symbol: SwappableSymbol): WalletToken => {
  const t = WALLET_TOKENS.find(tk => tk.symbol === symbol);
  if (!t) throw new Error(`Token ${symbol} not found`);
  return t;
};

const tokenAddress = (token: WalletToken): `0x${string}` =>
  token.address ?? SWAP_CONFIG.WBNB;

const isNativeBnb = (token: WalletToken) => token.address === null;

const ZERO_ADDRESS = '0x0000000000000000000000000000000000000000' as `0x${string}`;

/* ─── Quote types ─── */

export interface SwapQuote {
  fromSymbol: SwappableSymbol;
  toSymbol: SwappableSymbol;
  amountIn: string;
  amountOut: string;
  amountOutMin: string;
  /** Raw BigInt values for precision */
  amountInWei: string;   // bigint as string
  amountOutWei: string;  // bigint as string
  amountOutMinWei: string; // bigint as string
  route: 'pancakeswap';
  path: `0x${string}`[];
  /** Human-readable route e.g. ['CAMLY','USDT'] or ['CAMLY','WBNB','USDT'] */
  routeSymbols: string[];
  /** Whether fee-on-transfer method should be used */
  useFeeOnTransfer: boolean;
  expiresAt: number;
}

/* ─── Check if pair exists on PancakeSwap factory ─── */

async function pairExists(
  tokenA: `0x${string}`,
  tokenB: `0x${string}`,
  wagmiConfig: any,
): Promise<boolean> {
  try {
    const pair = await readContract(wagmiConfig, {
      address: SWAP_CONFIG.PANCAKE_FACTORY,
      abi: PANCAKE_FACTORY_ABI,
      functionName: 'getPair',
      args: [tokenA, tokenB],
    } as any) as `0x${string}`;
    return pair !== ZERO_ADDRESS;
  } catch {
    return false;
  }
}

/* ─── Try getAmountsOut for a given path ─── */

async function tryGetAmountsOut(
  amountIn: bigint,
  path: `0x${string}`[],
  wagmiConfig: any,
): Promise<bigint | null> {
  try {
    const amounts = await readContract(wagmiConfig, {
      address: SWAP_CONFIG.PANCAKE_ROUTER_V2,
      abi: PANCAKE_ROUTER_ABI,
      functionName: 'getAmountsOut',
      args: [amountIn, path],
    } as any) as bigint[];
    const out = amounts[amounts.length - 1];
    return out > 0n ? out : null;
  } catch {
    return null;
  }
}

/* ─── Build best path for PancakeSwap ─── */

async function buildBestPath(
  from: WalletToken,
  to: WalletToken,
  amountIn: bigint,
  wagmiConfig: any,
): Promise<{ path: `0x${string}`[]; amountOut: bigint }> {
  const a = tokenAddress(from);
  const b = tokenAddress(to);

  // If either side is native BNB (WBNB), direct path is the only option
  if (a === SWAP_CONFIG.WBNB || b === SWAP_CONFIG.WBNB) {
    const directOut = await tryGetAmountsOut(amountIn, [a, b], wagmiConfig);
    if (directOut) return { path: [a, b], amountOut: directOut };
    throw new Error('Không tìm thấy thanh khoản cho cặp này');
  }

  // Token-to-token: try direct pair first, then WBNB route
  const directPath: `0x${string}`[] = [a, b];
  const wbnbPath: `0x${string}`[] = [a, SWAP_CONFIG.WBNB, b];

  // Check direct pair existence and quote in parallel
  const [directExists, directOut, wbnbOut] = await Promise.all([
    pairExists(a, b, wagmiConfig),
    tryGetAmountsOut(amountIn, directPath, wagmiConfig),
    tryGetAmountsOut(amountIn, wbnbPath, wagmiConfig),
  ]);

  console.log('[Swap] Route analysis:', {
    from: from.symbol,
    to: to.symbol,
    directPairExists: directExists,
    directAmountOut: directOut?.toString() ?? 'null',
    wbnbAmountOut: wbnbOut?.toString() ?? 'null',
  });

  // Pick the best route: prefer whichever gives more output
  if (directOut && wbnbOut) {
    return directOut >= wbnbOut
      ? { path: directPath, amountOut: directOut }
      : { path: wbnbPath, amountOut: wbnbOut };
  }
  if (directOut) return { path: directPath, amountOut: directOut };
  if (wbnbOut) return { path: wbnbPath, amountOut: wbnbOut };

  throw new Error('Không tìm thấy thanh khoản. Vui lòng thử số lượng khác hoặc cặp token khác.');
}

/* ─── Determine route symbols from path ─── */

function pathToSymbols(path: `0x${string}`[]): string[] {
  return path.map(addr => {
    if (addr.toLowerCase() === SWAP_CONFIG.WBNB.toLowerCase()) return 'WBNB';
    const token = WALLET_TOKENS.find(t => t.address?.toLowerCase() === addr.toLowerCase());
    return token?.symbol ?? addr.slice(0, 8);
  });
}

/* ─── Detect if fee-on-transfer method should be used ─── */

function shouldUseFeeOnTransfer(from: WalletToken, to: WalletToken): boolean {
  // CAMLY and any non-standard tokens should use fee-on-transfer safe methods
  const feeTokens = ['CAMLY'];
  return feeTokens.includes(from.symbol) || feeTokens.includes(to.symbol);
}

/* ─── Get quote (always PancakeSwap) ─── */

export async function getSwapQuote(
  fromSymbol: SwappableSymbol,
  toSymbol: SwappableSymbol,
  amount: string,
  wagmiConfig: any,
): Promise<SwapQuote> {
  const fromToken = findToken(fromSymbol);
  const toToken = findToken(toSymbol);
  const amountIn = parseUnits(amount, fromToken.decimals);

  if (amountIn <= 0n) throw new Error('Số lượng phải lớn hơn 0');

  const { path, amountOut } = await buildBestPath(fromToken, toToken, amountIn, wagmiConfig);

  const slippageFactor = BigInt(10000 - SWAP_CONFIG.DEFAULT_SLIPPAGE);
  const amountOutMin = (amountOut * slippageFactor) / 10000n;

  console.log('[Swap] Quote:', {
    from: fromSymbol,
    to: toSymbol,
    amountInWei: amountIn.toString(),
    amountOutWei: amountOut.toString(),
    amountOutMinWei: amountOutMin.toString(),
    path,
    useFeeOnTransfer: shouldUseFeeOnTransfer(fromToken, toToken),
  });

  return {
    fromSymbol,
    toSymbol,
    amountIn: amount,
    amountOut: formatUnits(amountOut, toToken.decimals),
    amountOutMin: formatUnits(amountOutMin, toToken.decimals),
    amountInWei: amountIn.toString(),
    amountOutWei: amountOut.toString(),
    amountOutMinWei: amountOutMin.toString(),
    route: 'pancakeswap',
    path,
    routeSymbols: pathToSymbols(path),
    useFeeOnTransfer: shouldUseFeeOnTransfer(fromToken, toToken),
    expiresAt: Date.now() + SWAP_CONFIG.QUOTE_TTL_MS,
  };
}

/* ─── Approval ─── */

export async function requiresApproval(
  symbol: SwappableSymbol,
  amount: string,
  owner: `0x${string}`,
  spender: `0x${string}`,
  wagmiConfig: any,
): Promise<boolean> {
  const token = findToken(symbol);
  if (isNativeBnb(token)) return false;

  const allowance = await readContract(wagmiConfig, {
    address: token.address!,
    abi: ERC20_ABI,
    functionName: 'allowance',
    args: [owner, spender],
  } as any) as bigint;

  const needed = parseUnits(amount, token.decimals);
  console.log('[Swap] Allowance check:', {
    token: symbol,
    allowance: allowance.toString(),
    needed: needed.toString(),
    needsApproval: allowance < needed,
  });

  return allowance < needed;
}

export async function approveToken(
  symbol: SwappableSymbol,
  spender: `0x${string}`,
  wagmiConfig: any,
): Promise<`0x${string}`> {
  const token = findToken(symbol);
  if (isNativeBnb(token)) throw new Error('BNB không cần approve');

  const hash = await writeContract(wagmiConfig, {
    address: token.address!,
    abi: ERC20_ABI,
    functionName: 'approve',
    args: [spender, SWAP_CONFIG.MAX_APPROVAL],
    chain: bsc,
  } as any);

  await waitForTransactionReceipt(wagmiConfig, { hash });
  return hash;
}

/* ─── Execute swap (always PancakeSwap) ─── */

export async function executeSwap(
  quote: SwapQuote,
  account: `0x${string}`,
  wagmiConfig: any,
): Promise<`0x${string}`> {
  const fromToken = findToken(quote.fromSymbol);
  const toToken = findToken(quote.toSymbol);

  // Use raw BigInt values from quote for precision
  const amountIn = BigInt(quote.amountInWei);
  const amountOutMin = BigInt(quote.amountOutMinWei);
  const deadline = BigInt(Math.floor(Date.now() / 1000) + SWAP_CONFIG.DEADLINE_SECONDS);
  const path = quote.path;

  // Pre-flight validation: verify the route still works
  const preflight = await tryGetAmountsOut(amountIn, path, wagmiConfig);
  if (!preflight) {
    throw new Error('Thanh khoản không khả dụng. Vui lòng thử lại.');
  }

  console.log('[Swap] Executing:', {
    from: quote.fromSymbol,
    to: quote.toSymbol,
    amountIn: amountIn.toString(),
    amountOutMin: amountOutMin.toString(),
    path,
    useFeeOnTransfer: quote.useFeeOnTransfer,
  });

  let hash: `0x${string}`;

  if (isNativeBnb(fromToken)) {
    // BNB → Token: use fee-on-transfer version if needed
    const fn = quote.useFeeOnTransfer
      ? 'swapExactETHForTokensSupportingFeeOnTransferTokens'
      : 'swapExactETHForTokens';
    hash = await writeContract(wagmiConfig, {
      address: SWAP_CONFIG.PANCAKE_ROUTER_V2,
      abi: PANCAKE_ROUTER_ABI,
      functionName: fn,
      args: [amountOutMin, path, account, deadline],
      value: amountIn,
      chain: bsc,
    } as any);
  } else if (isNativeBnb(toToken)) {
    // Token → BNB: use fee-on-transfer version if needed
    const fn = quote.useFeeOnTransfer
      ? 'swapExactTokensForETHSupportingFeeOnTransferTokens'
      : 'swapExactTokensForETH';
    hash = await writeContract(wagmiConfig, {
      address: SWAP_CONFIG.PANCAKE_ROUTER_V2,
      abi: PANCAKE_ROUTER_ABI,
      functionName: fn,
      args: [amountIn, amountOutMin, path, account, deadline],
      chain: bsc,
    } as any);
  } else {
    // Token → Token: use fee-on-transfer version if needed
    const fn = quote.useFeeOnTransfer
      ? 'swapExactTokensForTokensSupportingFeeOnTransferTokens'
      : 'swapExactTokensForTokens';
    hash = await writeContract(wagmiConfig, {
      address: SWAP_CONFIG.PANCAKE_ROUTER_V2,
      abi: PANCAKE_ROUTER_ABI,
      functionName: fn,
      args: [amountIn, amountOutMin, path, account, deadline],
      chain: bsc,
    } as any);
  }

  await waitForTransactionReceipt(wagmiConfig, { hash });
  return hash;
}

/* ─── Helpers ─── */

export function quoteExpired(quote: SwapQuote): boolean {
  return Date.now() > quote.expiresAt;
}

export function getSpender(_quote: SwapQuote): `0x${string}` {
  return SWAP_CONFIG.PANCAKE_ROUTER_V2;
}

export function mapSwapError(err: any): string {
  const msg = err?.message || err?.toString() || '';
  if (msg.includes('user rejected') || msg.includes('User denied')) return 'Bạn đã huỷ giao dịch';
  if (msg.includes('insufficient funds') || msg.includes('INSUFFICIENT')) return 'Số dư không đủ';
  if (msg.includes('EXPIRED') || msg.includes('deadline')) return 'Báo giá đã hết hạn, vui lòng thử lại';
  if (msg.includes('-32002') || msg.includes('pending')) return 'Có giao dịch đang chờ xử lý trong ví';
  if (msg.includes('TRANSFER_FAILED')) return 'Giao dịch thất bại, có thể do slippage quá thấp';
  if (msg.includes('INSUFFICIENT_OUTPUT_AMOUNT')) return 'Trượt giá quá cao, vui lòng thử lại';
  if (msg.includes('INSUFFICIENT_LIQUIDITY') || msg.includes('thanh khoản')) return 'Không đủ thanh khoản cho cặp này';
  if (msg.includes('Không tìm thấy')) return msg;
  if (msg.includes('Thanh khoản không khả dụng')) return msg;
  if (msg.includes('execution reverted')) return 'Giao dịch bị revert. Thử tăng slippage hoặc giảm số lượng.';
  return `Lỗi swap: ${msg.slice(0, 120)}`;
}

/**
 * Validate + chuẩn hoá input của edge function `record-swap`.
 *
 * Theo AGENTS.md §6: mọi số lượng token đi qua BigInt string-based
 * (KHÔNG parseFloat/Number cho số tiền). Module không phụ thuộc thư viện ngoài
 * để chạy được cả Deno (edge) và Vitest (guard test).
 */

export const SUPPORTED_CHAINS = [56, 97] as const;
export const TOKEN_DECIMALS: Record<string, number> = {
  FUN: 18,
  CAMLY: 3,
  USDT: 18,
  BNB: 18,
  BUSD: 18,
  WBNB: 18,
  BTCB: 18,
};
export const DEFAULT_DECIMALS = 18;
/** Trần an toàn: 1e12 token / 1 lệnh swap. */
export const MAX_SWAP_TOKENS = 1_000_000_000_000n;
/** Trần USD khai báo: 1e9 USD, tối đa 2 số thập phân. */
export const MAX_USD = 1_000_000_000;
export const USD_DECIMALS = 2;

export const TX_HASH_RE = /^0x[0-9a-f]{64}$/;
export const SYMBOL_RE = /^[A-Z0-9]{2,12}$/;

export interface SwapInputOk {
  ok: true;
  txHash: string;
  chainId: number;
  fromSymbol: string;
  toSymbol: string;
  /** Chuỗi thập phân đã chuẩn hoá. */
  fromAmount: string;
  toAmount: string;
  /** Đơn vị nhỏ nhất theo decimals của token (BigInt). */
  fromAmountUnits: bigint;
  toAmountUnits: bigint;
  fromAmountUsd: number | null;
  toAmountUsd: number | null;
  dexProvider: string;
  quoteId: string | null;
}

export interface SwapInputErr {
  ok: false;
  field: string;
  message: string;
}

export type SwapInputResult = SwapInputOk | SwapInputErr;

export function decimalsFor(symbol: string): number {
  return TOKEN_DECIMALS[symbol] ?? DEFAULT_DECIMALS;
}

/** Chuỗi thập phân → BigInt đơn vị nhỏ nhất. null nếu không hợp lệ. */
export function toUnits(input: string, decimals: number): bigint | null {
  if (!/^\d+(\.\d+)?$/.test(input)) return null;
  const [intPart, fracRaw = ''] = input.split('.');
  if (fracRaw.length > decimals) return null;
  try {
    return BigInt(intPart + fracRaw.padEnd(decimals, '0'));
  } catch {
    return null;
  }
}

export function unitsToDecimal(units: bigint, decimals: number): string {
  const base = 10n ** BigInt(decimals);
  const frac = (units % base).toString().padStart(decimals, '0').replace(/0+$/, '');
  return frac ? `${units / base}.${frac}` : (units / base).toString();
}

function normalizeAmount(raw: unknown): string | null {
  if (typeof raw === 'string') return raw.trim();
  if (typeof raw === 'number') {
    if (!Number.isFinite(raw)) return null;
    const s = raw.toString();
    if (s.includes('e') || s.includes('E')) return null;
    return s;
  }
  return null;
}

function validateAmountField(
  raw: unknown,
  symbol: string,
  field: string,
): { units: bigint; decimal: string } | SwapInputErr {
  const str = normalizeAmount(raw);
  if (str === null || str === '') {
    return { ok: false, field, message: 'Số lượng không hợp lệ' };
  }
  if (str.length > 60) {
    return { ok: false, field, message: 'Số lượng không hợp lệ' };
  }
  const decimals = decimalsFor(symbol);
  const units = toUnits(str, decimals);
  if (units === null) {
    return {
      ok: false,
      field,
      message: `Số lượng không hợp lệ (tối đa ${decimals} số thập phân cho ${symbol})`,
    };
  }
  if (units <= 0n) return { ok: false, field, message: 'Số lượng phải lớn hơn 0' };
  if (units > MAX_SWAP_TOKENS * 10n ** BigInt(decimals)) {
    return { ok: false, field, message: 'Số lượng vượt mức cho phép' };
  }
  return { units, decimal: unitsToDecimal(units, decimals) };
}

function validateUsdField(raw: unknown, field: string): number | null | SwapInputErr {
  if (raw === null || raw === undefined || raw === '') return null;
  const str = normalizeAmount(raw);
  if (str === null) return { ok: false, field, message: 'Giá trị USD không hợp lệ' };
  const units = toUnits(str, USD_DECIMALS);
  if (units === null) {
    return { ok: false, field, message: `Giá trị USD tối đa ${USD_DECIMALS} số thập phân` };
  }
  if (units < 0n) return { ok: false, field, message: 'Giá trị USD không được âm' };
  const value = Number(unitsToDecimal(units, USD_DECIMALS));
  if (value > MAX_USD) return { ok: false, field, message: 'Giá trị USD vượt mức cho phép' };
  return value;
}

function isErr(v: unknown): v is SwapInputErr {
  return !!v && typeof v === 'object' && (v as SwapInputErr).ok === false;
}

export function validateSwapInput(body: unknown): SwapInputResult {
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    return { ok: false, field: 'body', message: 'Dữ liệu yêu cầu không hợp lệ' };
  }
  const raw = body as Record<string, unknown>;

  const txHash = String(raw.tx_hash ?? '').trim().toLowerCase();
  if (!TX_HASH_RE.test(txHash)) {
    return { ok: false, field: 'tx_hash', message: 'invalid_tx_hash' };
  }

  const chainId = typeof raw.chain_id === 'number' ? raw.chain_id : Number(raw.chain_id);
  if (!Number.isInteger(chainId) || !(SUPPORTED_CHAINS as readonly number[]).includes(chainId)) {
    return { ok: false, field: 'chain_id', message: 'unsupported_chain' };
  }

  const fromSymbol = String(raw.from_symbol ?? '').trim().toUpperCase();
  const toSymbol = String(raw.to_symbol ?? '').trim().toUpperCase();
  if (!SYMBOL_RE.test(fromSymbol) || !SYMBOL_RE.test(toSymbol) || fromSymbol === toSymbol) {
    return { ok: false, field: 'symbols', message: 'invalid_symbols' };
  }

  const from = validateAmountField(raw.from_amount, fromSymbol, 'from_amount');
  if (isErr(from)) return from;
  const to = validateAmountField(raw.to_amount, toSymbol, 'to_amount');
  if (isErr(to)) return to;

  const fromUsd = validateUsdField(raw.from_amount_usd, 'from_amount_usd');
  if (isErr(fromUsd)) return fromUsd;
  const toUsd = validateUsdField(raw.to_amount_usd, 'to_amount_usd');
  if (isErr(toUsd)) return toUsd;

  const dexProviderRaw = raw.dex_provider === undefined || raw.dex_provider === null
    ? 'unknown'
    : String(raw.dex_provider).trim();
  if (dexProviderRaw.length > 32) {
    return { ok: false, field: 'dex_provider', message: 'dex_provider quá dài (tối đa 32 ký tự)' };
  }
  const dexProvider = dexProviderRaw === '' ? 'unknown' : dexProviderRaw;

  let quoteId: string | null = null;
  if (raw.quote_id !== undefined && raw.quote_id !== null && raw.quote_id !== '') {
    const q = String(raw.quote_id).trim();
    if (q.length > 64) {
      return { ok: false, field: 'quote_id', message: 'quote_id quá dài (tối đa 64 ký tự)' };
    }
    quoteId = q;
  }

  return {
    ok: true,
    txHash,
    chainId,
    fromSymbol,
    toSymbol,
    fromAmount: from.decimal,
    toAmount: to.decimal,
    fromAmountUnits: from.units,
    toAmountUnits: to.units,
    fromAmountUsd: fromUsd,
    toAmountUsd: toUsd,
    dexProvider,
    quoteId,
  };
}

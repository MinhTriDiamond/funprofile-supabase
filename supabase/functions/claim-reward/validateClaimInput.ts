/**
 * Validate + chuẩn hoá input của edge function `claim-reward`.
 *
 * Không import thư viện ngoài để module này chạy được cả trong Deno (edge)
 * và Vitest (guard test) — theo AGENTS.md §6 mọi phép tính token dùng
 * BigInt string-based, KHÔNG dùng Number()/parseFloat cho số tiền.
 */

export const CAMLY_DECIMALS = 3;
export const EVM_ADDRESS_RE = /^0x[0-9a-fA-F]{40}$/;

/** Trần an toàn: 1 tỷ CAMLY / 1 lệnh (chặn số phi lý trước khi tính toán). */
export const MAX_CLAIM_UNITS = 1_000_000_000n * 10n ** BigInt(CAMLY_DECIMALS);

export interface ClaimInputOk {
  ok: true;
  /** Địa chỉ ví đã lowercase. */
  walletAddress: string;
  /** Số tiền dạng chuỗi thập phân đã chuẩn hoá, ví dụ "200000.5". */
  amountDecimal: string;
  /** Số tiền dạng đơn vị nhỏ nhất (BigInt, 3 decimals). */
  amountUnits: bigint;
}

export interface ClaimInputErr {
  ok: false;
  field: 'wallet_address' | 'amount' | 'body';
  message: string;
}

export type ClaimInputResult = ClaimInputOk | ClaimInputErr;

/**
 * Chuyển chuỗi thập phân sang BigInt đơn vị nhỏ nhất (tự cài, thay parseUnits
 * để module không phụ thuộc viem). Trả null nếu chuỗi không hợp lệ.
 */
export function decimalToUnits(input: string, decimals: number): bigint | null {
  if (!/^\d+(\.\d+)?$/.test(input)) return null;
  const [intPart, fracRaw = ''] = input.split('.');
  if (fracRaw.length > decimals) return null;
  const frac = fracRaw.padEnd(decimals, '0');
  try {
    return BigInt(intPart + frac);
  } catch {
    return null;
  }
}

/** BigInt units → chuỗi thập phân rút gọn (bỏ số 0 vô nghĩa cuối). */
export function unitsToDecimal(units: bigint, decimals: number): string {
  const base = 10n ** BigInt(decimals);
  const intPart = units / base;
  const frac = (units % base).toString().padStart(decimals, '0').replace(/0+$/, '');
  return frac ? `${intPart}.${frac}` : intPart.toString();
}

export function validateClaimInput(body: unknown): ClaimInputResult {
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    return { ok: false, field: 'body', message: 'Dữ liệu yêu cầu không hợp lệ' };
  }

  const raw = body as Record<string, unknown>;

  // --- wallet_address ---
  const walletRaw = raw.wallet_address;
  if (typeof walletRaw !== 'string' || walletRaw.trim() === '') {
    return { ok: false, field: 'wallet_address', message: 'Thiếu thông tin ví' };
  }
  const wallet = walletRaw.trim();
  if (!EVM_ADDRESS_RE.test(wallet)) {
    return { ok: false, field: 'wallet_address', message: 'Địa chỉ ví không hợp lệ' };
  }

  // --- amount ---
  const amountRaw = raw.amount;
  let amountStr: string;
  if (typeof amountRaw === 'string') {
    amountStr = amountRaw.trim();
  } else if (typeof amountRaw === 'number') {
    // Chặn số không an toàn / ký hiệu khoa học trước khi ép chuỗi
    if (!Number.isFinite(amountRaw) || !Number.isSafeInteger(Math.trunc(amountRaw))) {
      return { ok: false, field: 'amount', message: 'Số lượng không hợp lệ' };
    }
    amountStr = amountRaw.toString();
    if (amountStr.includes('e') || amountStr.includes('E')) {
      return { ok: false, field: 'amount', message: 'Số lượng không hợp lệ' };
    }
  } else {
    return { ok: false, field: 'amount', message: 'Thiếu số lượng cần rút' };
  }

  if (amountStr === '') {
    return { ok: false, field: 'amount', message: 'Thiếu số lượng cần rút' };
  }
  if (amountStr.length > 40) {
    return { ok: false, field: 'amount', message: 'Số lượng không hợp lệ' };
  }

  const units = decimalToUnits(amountStr, CAMLY_DECIMALS);
  if (units === null) {
    return {
      ok: false,
      field: 'amount',
      message: `Số lượng không hợp lệ (chỉ nhận số dương, tối đa ${CAMLY_DECIMALS} số thập phân)`,
    };
  }
  if (units <= 0n) {
    return { ok: false, field: 'amount', message: 'Số lượng phải lớn hơn 0' };
  }
  if (units > MAX_CLAIM_UNITS) {
    return { ok: false, field: 'amount', message: 'Số lượng vượt mức cho phép' };
  }

  return {
    ok: true,
    walletAddress: wallet.toLowerCase(),
    amountDecimal: unitsToDecimal(units, CAMLY_DECIMALS),
    amountUnits: units,
  };
}

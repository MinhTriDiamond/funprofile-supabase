/**
 * Format token amount cho UI/History/Export.
 * - KHÔNG BAO GIỜ trả về scientific notation.
 * - Locale vi-VN (dấu phẩy thập phân).
 * - Trim số 0 dư ở cuối, giữ đủ số nhỏ có nghĩa.
 */

const TOKEN_MAX_DECIMALS: Record<string, number> = {
  BTC: 8,
  BTCB: 8,
  BNB: 8,
  USDT: 6,
  USDC: 6,
  FUN: 4,
  CAMLY: 3,
};

const DEFAULT_MAX_DECIMALS = 6;

export function getTokenMaxDecimals(symbol?: string | null): number {
  if (!symbol) return DEFAULT_MAX_DECIMALS;
  return TOKEN_MAX_DECIMALS[symbol.toUpperCase()] ?? DEFAULT_MAX_DECIMALS;
}

export interface FormatTokenAmountOptions {
  /** Prepend "+" / "−" theo dấu. Nếu false: hiển thị số tuyệt đối. */
  sign?: boolean;
  /** Override max decimals thay vì lấy từ token registry. */
  maxDecimals?: number;
}

/**
 * Format số token thành chuỗi locale vi-VN, không bao giờ dùng scientific notation.
 *
 * Ví dụ:
 *   formatTokenAmount(0.00008, 'BTC')   → "0,00008"
 *   formatTokenAmount(0.000897, 'BTC')  → "0,000897"
 *   formatTokenAmount(1234.5, 'USDT')   → "1.234,5"
 *   formatTokenAmount(-0.5, 'BNB', { sign: true }) → "−0,5"
 */
export function formatTokenAmount(
  amount: number | null | undefined,
  tokenSymbol?: string | null,
  opts: FormatTokenAmountOptions = {},
): string {
  if (amount == null || Number.isNaN(amount)) return '—';
  const { sign = false, maxDecimals } = opts;
  const max = maxDecimals ?? getTokenMaxDecimals(tokenSymbol);
  const abs = Math.abs(amount);

  if (abs === 0) return sign ? '0' : '0';

  // toLocaleString('vi-VN') với maximumFractionDigits không dùng scientific.
  // Với số cực nhỏ (< 1e-max), sẽ ra "0" — fallback bằng toFixed rồi format thủ công.
  let body: string;
  const rounded = Number(abs.toFixed(max));
  if (rounded === 0) {
    // Số quá nhỏ so với max decimals → hiển thị dạng min-precision (không scientific)
    // Dùng toFixed với đủ decimals để không mất giá trị, rồi trim 0 cuối.
    const enoughDecimals = Math.min(20, Math.max(max, Math.ceil(-Math.log10(abs)) + 2));
    const raw = abs.toFixed(enoughDecimals); // "0.00000008..."
    const trimmed = trimTrailingZeros(raw);
    body = trimmed.replace('.', ',');
  } else {
    body = rounded.toLocaleString('vi-VN', {
      minimumFractionDigits: 0,
      maximumFractionDigits: max,
      useGrouping: true,
    });
  }

  if (!sign) return body;
  if (amount > 0) return `+${body}`;
  if (amount < 0) return `−${body}`;
  return body;
}

function trimTrailingZeros(numStr: string): string {
  if (!numStr.includes('.')) return numStr;
  return numStr.replace(/0+$/, '').replace(/\.$/, '');
}

export const MIN_SEND_USD = 0.01;

export interface MinSendValidation {
  valid: boolean;
  message?: string;
}

/**
 * Validate that a send/donation amount meets the minimum USD value threshold.
 * @param amount - The token amount being sent
 * @param priceUSD - The token's USD price, or null if unknown
 */
export function validateMinSendValue(
  amount: number,
  priceUSD: number | null
): MinSendValidation {
  if (amount <= 0) {
    return { valid: false };
  }

  if (priceUSD === null || priceUSD === undefined) {
    return {
      valid: false,
      message: 'Chưa xác định được giá trị USD của token này',
    };
  }

  const usdValue = amount * priceUSD;

  if (usdValue < MIN_SEND_USD) {
    return {
      valid: false,
      message: `Giá trị gửi tối thiểu là ${MIN_SEND_USD} USD`,
    };
  }

  return { valid: true };
}

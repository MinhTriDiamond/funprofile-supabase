export interface PendingDonationPayload {
  txHash: string;
  recipientId: string;
  senderId?: string;
  amount: string;
  tokenSymbol: string;
  tokenAddress?: string;
  chainId?: number;
  message?: string;
  messageTemplate?: string;
  postId?: string;
  cardTheme?: string;
  cardSound?: string;
  timestamp: number;
}


/** Persist as soon as a broadcast hash exists, before waiting for its receipt. */
export function rememberPendingDonation(payload: PendingDonationPayload): boolean {
  try {
    window.localStorage.setItem(`pending_donation_${payload.txHash}`, JSON.stringify(payload));
    return true;
  } catch {
    // Storage restrictions must never prevent presenting the transaction card.
    return false;
  }
}

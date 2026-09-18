/**
 * Pending gift intent — lưu snapshot dialog Tặng trước khi user rời Safari sang MetaMask,
 * để khi quay lại tự khôi phục form đã nhập.
 *
 * Sống trong localStorage 10 phút, key cố định (1 intent tại 1 thời điểm).
 */

const KEY = 'fun.pendingGift';
const TTL_MS = 10 * 60 * 1000;

export interface PendingGiftIntent {
  recipientId?: string;
  recipientUsername?: string;
  tokenSymbol?: string;
  amount?: string;
  message?: string;
  chainId?: number;
  postId?: string;
  returnPath?: string;
  createdAt: number;
}

export function rememberPendingGiftIntent(payload: Omit<PendingGiftIntent, 'createdAt'>) {
  try {
    const intent: PendingGiftIntent = {
      ...payload,
      createdAt: Date.now(),
      returnPath: payload.returnPath ?? (typeof window !== 'undefined'
        ? window.location.pathname + window.location.search
        : undefined),
    };
    localStorage.setItem(KEY, JSON.stringify(intent));
  } catch {}
}

export function readPendingGiftIntent(): PendingGiftIntent | null {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    const intent = JSON.parse(raw) as PendingGiftIntent;
    if (!intent?.createdAt || Date.now() - intent.createdAt > TTL_MS) {
      clearPendingGiftIntent();
      return null;
    }
    return intent;
  } catch {
    return null;
  }
}

export function clearPendingGiftIntent() {
  try { localStorage.removeItem(KEY); } catch {}
}

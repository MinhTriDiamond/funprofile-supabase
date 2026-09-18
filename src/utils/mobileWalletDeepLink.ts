/**
 * Mobile Wallet Deep Link helper
 *
 * Mục đích: khi người dùng dùng WalletConnect trên mobile (browser thường, KHÔNG phải in-app),
 * sau khi gọi sendTransactionAsync, app cần "đẩy" người dùng quay lại app ví để xác nhận.
 *
 * Cơ chế:
 * - Phát hiện connector hiện tại có phải walletConnect không.
 * - Nếu mobile + walletConnect → mở deep-link tương ứng (metamask:, trust:, wc:).
 * - Trên trình duyệt in-app (Trust/MetaMask/Bitget) thì KHÔNG cần — provider injected sẽ tự bật prompt.
 */

import { isInjectedMobileBrowser, isMobileDevice } from './mobileWalletConnect';

export type WalletKind = 'metamask' | 'trust' | 'rainbow' | 'unknown';

/** Nhận diện loại ví dựa trên connector id / name (lowercase). */
export function detectWalletKind(connectorIdOrName?: string | null): WalletKind {
  const v = (connectorIdOrName || '').toLowerCase();
  if (v.includes('metamask') || v === 'io.metamask') return 'metamask';
  if (v.includes('trust')) return 'trust';
  if (v.includes('rainbow')) return 'rainbow';
  return 'unknown';
}

/**
 * Mở app ví trên mobile để user xác nhận giao dịch.
 * - Trên in-app browser: không làm gì (provider injected tự lo).
 * - Trên mobile WalletConnect: thử mở deep-link đặc thù trước; fallback về `wc:` nếu cần.
 *
 * Return true nếu có thử mở deep-link, false nếu bỏ qua.
 */
export function openWalletAppForSigning(opts: {
  connectorId?: string | null;
  connectorName?: string | null;
}): boolean {
  if (typeof window === 'undefined') return false;
  if (!isMobileDevice()) return false;
  // In-app browser: provider tự bật, không cần deep-link
  if (isInjectedMobileBrowser()) return false;

  const kind = detectWalletKind(opts.connectorId || opts.connectorName);
  const isAndroid = /android/i.test(navigator.userAgent || '');

  // Android Chrome: ưu tiên intent:// vì scheme thuần đôi khi bị block.
  // S.browser_fallback_url giúp Chrome quay lại tab dApp nếu app ví chưa cài.
  const fallback = encodeURIComponent(getReturnToAppUrl());
  let target: string | null = null;
  if (isAndroid) {
    if (kind === 'metamask') target = `intent://#Intent;scheme=metamask;package=io.metamask;S.browser_fallback_url=${fallback};end`;
    else if (kind === 'trust') target = `intent://#Intent;scheme=trust;package=com.wallet.crypto.trustapp;S.browser_fallback_url=${fallback};end`;
    else if (kind === 'rainbow') target = `intent://#Intent;scheme=rainbow;package=me.rainbow;S.browser_fallback_url=${fallback};end`;
  } else {
    if (kind === 'metamask') target = 'metamask://';
    else if (kind === 'trust') target = 'trust://';
    else if (kind === 'rainbow') target = 'rainbow://';
  }

  if (!target) return false;

  try {
    window.location.href = target;
    return true;
  } catch {
    return false;
  }
}

/**
 * Trả về URL "deep link" để user quay về dApp FUN sau khi ký xong trong app ví.
 * - Trên mobile WC: ví thường mở dApp trong in-app browser hoặc switch app —
 *   ta cung cấp 1 URL universal link để user 1-tap quay lại.
 */
export function getReturnToAppUrl(): string {
  if (typeof window === 'undefined') return '';
  return `${window.location.origin}${window.location.pathname}${window.location.search}`;
}

/**
 * Cố gắng "đẩy" focus quay về tab dApp sau khi ký xong (best-effort).
 * Mobile browser không cho phép programmatic focus, nhưng trên 1 số ví in-app
 * (Trust/MetaMask) việc gọi `window.focus()` + scroll giúp UI cập nhật ngay.
 */
export function nudgeReturnToApp(): void {
  if (typeof window === 'undefined') return;
  try {
    window.focus();
    // Trigger 1 scroll nhỏ để rrweb/visibility API nhận biết tab active lại
    window.scrollBy({ top: 1, behavior: 'instant' as ScrollBehavior });
    window.scrollBy({ top: -1, behavior: 'instant' as ScrollBehavior });
  } catch {}
}

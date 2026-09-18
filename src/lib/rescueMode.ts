/**
 * Rescue mode: khi user vào trang chủ bằng nút "Vào trang chủ không dùng ví",
 * URL có `?__fun_no_web3=...`. Ta snapshot cờ này vào sessionStorage trước khi
 * `cleanupRecoveryQueryParams` xóa query, để các provider/button gift biết
 * tuyệt đối không lazy-load Web3 trong phiên hiện tại.
 *
 * Cờ tự clear khi user nhấn "Tải lại bản mới" (applyHardUpdate resetRecovery).
 */

const RESCUE_NO_WEB3_KEY = 'fun_profile_force_no_web3';
const RESCUE_QUERY = '__fun_no_web3';

export function captureRescueModeFromUrl() {
  if (typeof window === 'undefined') return;
  try {
    const url = new URL(window.location.href);
    if (url.searchParams.has(RESCUE_QUERY)) {
      sessionStorage.setItem(RESCUE_NO_WEB3_KEY, '1');
    }
  } catch {
    // best effort
  }
}

export function isWeb3Rescued(): boolean {
  if (typeof window === 'undefined') return false;
  try {
    return sessionStorage.getItem(RESCUE_NO_WEB3_KEY) === '1';
  } catch {
    return false;
  }
}

export function clearWeb3Rescue() {
  if (typeof window === 'undefined') return;
  try {
    sessionStorage.removeItem(RESCUE_NO_WEB3_KEY);
  } catch {
    // best effort
  }
}

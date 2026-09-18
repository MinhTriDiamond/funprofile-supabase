import { useCallback } from "react";

/**
 * Phase 3 — Haptic feedback nhẹ cho thao tác mobile.
 *
 * Dùng Vibration API (navigator.vibrate). API này được hỗ trợ trên Android
 * Chrome và một phần trên iOS PWA. Trên thiết bị không hỗ trợ, hook im lặng
 * (no-op) — không throw, không log, không phá vỡ luồng.
 *
 * Tôn trọng `prefers-reduced-motion` để không rung khi user tắt animation.
 *
 * Mẫu rung gợi ý:
 *  - light  : feedback nhẹ (tap, like, toggle)        → 10ms
 *  - medium : xác nhận hành động (gửi, refresh)        → 25ms
 *  - heavy  : cảnh báo / thành công lớn (mint, gift)   → [10,40,10]
 *  - error  : lỗi nghiêm trọng                         → [40,30,40]
 *  - success: thành công                               → [10,30,10]
 */
export type HapticPattern =
  | "light"
  | "medium"
  | "heavy"
  | "error"
  | "success";

const PATTERNS: Record<HapticPattern, number | number[]> = {
  light: 10,
  medium: 25,
  heavy: [10, 40, 10],
  error: [40, 30, 40],
  success: [10, 30, 10],
};

function isReducedMotion(): boolean {
  try {
    return (
      typeof window !== "undefined" &&
      window.matchMedia &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches
    );
  } catch {
    return false;
  }
}

function vibrateSafe(pattern: number | number[]): boolean {
  try {
    if (typeof navigator === "undefined") return false;
    if (typeof navigator.vibrate !== "function") return false;
    if (isReducedMotion()) return false;
    return navigator.vibrate(pattern);
  } catch {
    return false;
  }
}

/**
 * Trả về callback `haptic(pattern)` để gọi tại bất kỳ event handler nào.
 *
 * Ví dụ:
 *   const haptic = useHaptics();
 *   <button onClick={() => { haptic("light"); doLike(); }}>👍</button>
 */
export function useHaptics() {
  return useCallback((pattern: HapticPattern = "light") => {
    vibrateSafe(PATTERNS[pattern]);
  }, []);
}

/** Gọi trực tiếp ngoài React component (vd: trong utils, async flows). */
export function triggerHaptic(pattern: HapticPattern = "light"): void {
  vibrateSafe(PATTERNS[pattern]);
}

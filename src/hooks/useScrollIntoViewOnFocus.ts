import { useCallback } from "react";

/**
 * Phase 2.3 — Khi user focus vào input/textarea trên mobile, bàn phím
 * thường che input. Hook này trả về handler onFocus để cuộn input
 * vào giữa viewport sau khi keyboard hiện ra.
 *
 * Sử dụng:
 *   const handleFocus = useScrollIntoViewOnFocus();
 *   <input onFocus={handleFocus} ... />
 *
 * Có thể truyền options của scrollIntoView để tuỳ biến.
 */
export function useScrollIntoViewOnFocus(
  options: ScrollIntoViewOptions = { block: "center", behavior: "smooth" },
) {
  return useCallback(
    (e: React.FocusEvent<HTMLElement>) => {
      const target = e.currentTarget;
      // Trên iOS, keyboard mất ~250-350ms để hoàn tất animate.
      // scrollIntoView trước đó sẽ bị reset → đợi nhẹ rồi mới cuộn.
      window.setTimeout(() => {
        try {
          target.scrollIntoView(options);
        } catch {
          // ignore — element có thể đã unmount
        }
      }, 300);
    },
    [options],
  );
}

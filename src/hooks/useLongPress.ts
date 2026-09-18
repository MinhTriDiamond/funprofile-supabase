import { useCallback, useRef } from 'react';

interface Options {
  delay?: number;
  moveThreshold?: number;
  /** Also fire on mouse long-press for desktop parity. Default true. */
  mouse?: boolean;
}

/**
 * Long-press hook for touch + mouse (Facebook-style "nhấn giữ để mở menu").
 * - Fires `onLongPress` after `delay` (default 400ms) if pointer stays within `moveThreshold` px.
 * - Cancels if the user scrolls / lifts early / pointer moves too far.
 * - Suppresses the follow-up `contextmenu` event so the native menu doesn't double-trigger.
 */
export function useLongPress(
  onLongPress: () => void,
  { delay = 400, moveThreshold = 10, mouse = true }: Options = {},
) {
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const startRef = useRef<{ x: number; y: number } | null>(null);
  const firedRef = useRef(false);

  const clear = useCallback(() => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  const start = useCallback(
    (x: number, y: number) => {
      startRef.current = { x, y };
      firedRef.current = false;
      clear();
      timerRef.current = setTimeout(() => {
        firedRef.current = true;
        onLongPress();
      }, delay);
    },
    [clear, delay, onLongPress],
  );

  const move = useCallback(
    (x: number, y: number) => {
      const s = startRef.current;
      if (!s) return;
      if (Math.hypot(x - s.x, y - s.y) > moveThreshold) clear();
    },
    [clear, moveThreshold],
  );

  const end = useCallback(() => {
    clear();
    startRef.current = null;
  }, [clear]);

  const onTouchStart = useCallback(
    (e: React.TouchEvent) => {
      const t = e.touches[0];
      if (!t) return;
      start(t.clientX, t.clientY);
    },
    [start],
  );
  const onTouchMove = useCallback(
    (e: React.TouchEvent) => {
      const t = e.touches[0];
      if (!t) return;
      move(t.clientX, t.clientY);
    },
    [move],
  );
  const onTouchEnd = end;
  const onTouchCancel = end;

  const onMouseDown = useCallback(
    (e: React.MouseEvent) => {
      if (!mouse || e.button !== 0) return;
      start(e.clientX, e.clientY);
    },
    [mouse, start],
  );
  const onMouseMove = useCallback(
    (e: React.MouseEvent) => {
      if (!mouse) return;
      move(e.clientX, e.clientY);
    },
    [mouse, move],
  );
  const onMouseUp = mouse ? end : undefined;
  const onMouseLeave = mouse ? end : undefined;

  const onContextMenu = useCallback((e: React.SyntheticEvent) => {
    if (firedRef.current) {
      e.preventDefault();
      firedRef.current = false;
    }
  }, []);

  return {
    onTouchStart,
    onTouchMove,
    onTouchEnd,
    onTouchCancel,
    onMouseDown,
    onMouseMove,
    onMouseUp,
    onMouseLeave,
    onContextMenu,
  };
}

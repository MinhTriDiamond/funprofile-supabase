import { useEffect, useRef } from 'react';
import { getState, pause, play } from '@/lib/globalAudio';

/**
 * Tự động pause global music khi mount, resume khi unmount nếu trước đó đang phát.
 * Dùng cho màn Livestream để tránh nhạc nền vọng vào mic.
 */
export function useMusicAutoPause(enabled = true) {
  const wasPlayingRef = useRef(false);

  useEffect(() => {
    if (!enabled) return;
    try {
      const state = getState();
      if (state.playing) {
        wasPlayingRef.current = true;
        pause();
      }
    } catch {
      // ignore
    }

    return () => {
      if (wasPlayingRef.current) {
        try {
          play();
        } catch {
          // ignore
        }
        wasPlayingRef.current = false;
      }
    };
  }, [enabled]);
}

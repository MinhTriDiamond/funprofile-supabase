import { useEffect, useState } from 'react';

/**
 * Returns a formatted elapsed time string (HH:MM:SS) from a given start ISO timestamp.
 * Updates every second while `enabled` is true.
 */
export function useLiveDuration(startedAt: string | undefined | null, enabled: boolean): string {
  const [elapsed, setElapsed] = useState('00:00:00');

  useEffect(() => {
    if (!startedAt || !enabled) {
      setElapsed('00:00:00');
      return;
    }

    const startMs = new Date(startedAt).getTime();

    const update = () => {
      const diff = Math.max(0, Math.floor((Date.now() - startMs) / 1000));
      const h = String(Math.floor(diff / 3600)).padStart(2, '0');
      const m = String(Math.floor((diff % 3600) / 60)).padStart(2, '0');
      const s = String(diff % 60).padStart(2, '0');
      setElapsed(`${h}:${m}:${s}`);
    };

    update();
    const id = setInterval(update, 1000);
    return () => clearInterval(id);
  }, [startedAt, enabled]);

  return elapsed;
}

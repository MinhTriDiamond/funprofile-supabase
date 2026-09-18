import { useEffect } from 'react';
import { heartbeatLiveSession } from '../liveService';

const HEARTBEAT_INTERVAL = 15_000;

/**
 * Sends a backend heartbeat every 15s. The watchdog treats missing
 * heartbeats as the source of truth for reconnecting/ending Agora sessions.
 */
export function useLiveHeartbeat(sessionId: string | undefined, isHost: boolean, enabled = true) {
  useEffect(() => {
    if (!sessionId || !isHost || !enabled) return;

    let cancelled = false;
    const beat = async () => {
      if (typeof navigator !== 'undefined' && navigator.onLine === false) return;
      try {
        await heartbeatLiveSession(sessionId);
      } catch (error) {
        if (!cancelled) console.warn('[useLiveHeartbeat] heartbeat failed:', error);
      }
    };

    beat();
    const interval = window.setInterval(beat, HEARTBEAT_INTERVAL);

    return () => {
      cancelled = true;
      window.clearInterval(interval);
    };
  }, [enabled, sessionId, isHost]);
}

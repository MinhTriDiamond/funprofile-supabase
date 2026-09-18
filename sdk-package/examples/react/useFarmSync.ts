/**
 * useFarmSync Hook
 * 
 * Custom hook for syncing farm data with debouncing.
 * Uses DebouncedSyncManager to prevent excessive API calls.
 * 
 * @example
 * ```tsx
 * function FarmGame() {
 *   const { syncFarmStats, syncAchievement, flushSync } = useFarmSync();
 * 
 *   const handleHarvest = (crop: Crop) => {
 *     // This won't cause 100 API calls!
 *     syncFarmStats({
 *       total_harvested: count++,
 *       last_harvest: new Date().toISOString(),
 *     });
 *   };
 * 
 *   // Flush on logout
 *   const handleLogout = async () => {
 *     await flushSync();
 *     logout();
 *   };
 * }
 * ```
 */

import { useEffect, useRef, useCallback } from 'react';
import { funProfile } from './FunProfileContext';
import type { DebouncedSyncManager } from '@fun-ecosystem/sso-sdk';

interface UseFarmSyncOptions {
  debounceMs?: number;
  flushOnUnload?: boolean;
}

interface FarmStats {
  total_harvested?: number;
  total_planted?: number;
  gold_earned?: number;
  experience?: number;
  last_harvest?: string;
  [key: string]: unknown;
}

interface Achievement {
  id: string;
  unlockedAt: string;
  progress?: number;
}

export function useFarmSync(options: UseFarmSyncOptions = {}) {
  const { debounceMs = 3000, flushOnUnload = true } = options;
  const syncManagerRef = useRef<DebouncedSyncManager | null>(null);

  // Initialize sync manager
  useEffect(() => {
    syncManagerRef.current = funProfile.getSyncManager(debounceMs);

    // Flush on page unload
    if (flushOnUnload) {
      const handleUnload = () => {
        syncManagerRef.current?.flush();
      };

      window.addEventListener('beforeunload', handleUnload);
      return () => {
        window.removeEventListener('beforeunload', handleUnload);
      };
    }
  }, [debounceMs, flushOnUnload]);

  /**
   * Sync farm statistics
   * Data is batched and sent after debounce period
   */
  const syncFarmStats = useCallback((stats: FarmStats) => {
    syncManagerRef.current?.queue('farm_stats', stats);
  }, []);

  /**
   * Sync achievement unlock
   */
  const syncAchievement = useCallback((achievement: Achievement) => {
    syncManagerRef.current?.queue('achievements', {
      [achievement.id]: {
        unlocked_at: achievement.unlockedAt,
        progress: achievement.progress ?? 100,
      },
    });
  }, []);

  /**
   * Sync inventory changes
   */
  const syncInventory = useCallback((inventory: Record<string, number>) => {
    syncManagerRef.current?.queue('inventory', inventory);
  }, []);

  /**
   * Force sync all pending data immediately
   * Call this before logout or important transitions
   */
  const flushSync = useCallback(async () => {
    if (syncManagerRef.current?.hasPendingData()) {
      await syncManagerRef.current.flush();
    }
  }, []);

  /**
   * Check if there's pending data to sync
   */
  const hasPendingSync = useCallback(() => {
    return syncManagerRef.current?.hasPendingData() ?? false;
  }, []);

  /**
   * Clear pending data without syncing
   * Use with caution - data will be lost
   */
  const clearPendingSync = useCallback(() => {
    syncManagerRef.current?.clear();
  }, []);

  return {
    syncFarmStats,
    syncAchievement,
    syncInventory,
    flushSync,
    hasPendingSync,
    clearPendingSync,
  };
}

export default useFarmSync;

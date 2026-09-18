/**
 * Fun Profile SSO SDK - Debounced Sync Manager
 * 
 * Theo góp ý của Cha Gemini: Batch các sync requests để giảm API calls
 * 
 * @example Usage in Fun Farm
 * ```typescript
 * const syncManager = funProfile.getSyncManager(3000); // 3 seconds
 * 
 * // User harvests 100 crops rapidly
 * for (const crop of crops) {
 *   syncManager.queue('farm_stats', {
 *     total_harvested: count++,
 *     last_crop: crop.name,
 *   });
 * }
 * // Only 1 API call after user stops for 3 seconds!
 * 
 * // Force sync on logout/close
 * await syncManager.flush();
 * ```
 */

export type SyncFunction = (data: Record<string, unknown>) => Promise<void>;

export class DebouncedSyncManager {
  private syncFn: SyncFunction;
  private debounceMs: number;
  private pendingData: Record<string, unknown> = {};
  private timeoutId: ReturnType<typeof setTimeout> | null = null;
  private isFlushing = false;

  constructor(syncFn: SyncFunction, debounceMs = 3000) {
    this.syncFn = syncFn;
    this.debounceMs = debounceMs;
  }

  /**
   * Queue data for sync - will be batched and sent after debounce period
   * @param category - Data category (e.g., 'farm_stats', 'achievements')
   * @param data - Data to sync
   */
  queue(category: string, data: Record<string, unknown>): void {
    // Merge with existing pending data
    this.pendingData[category] = {
      ...(this.pendingData[category] as Record<string, unknown> || {}),
      ...data,
    };

    // Reset debounce timer
    if (this.timeoutId) {
      clearTimeout(this.timeoutId);
    }

    this.timeoutId = setTimeout(() => {
      this.flush();
    }, this.debounceMs);
  }

  /**
   * Immediately sync all pending data
   * Call this on logout or page unload
   */
  async flush(): Promise<void> {
    if (this.isFlushing || Object.keys(this.pendingData).length === 0) {
      return;
    }

    this.isFlushing = true;

    // Clear timeout
    if (this.timeoutId) {
      clearTimeout(this.timeoutId);
      this.timeoutId = null;
    }

    // Copy and clear pending data
    const dataToSync = { ...this.pendingData };
    this.pendingData = {};

    try {
      await this.syncFn(dataToSync);
    } catch (error) {
      // Re-queue failed data
      this.pendingData = {
        ...dataToSync,
        ...this.pendingData,
      };
      throw error;
    } finally {
      this.isFlushing = false;
    }
  }

  /**
   * Clear all pending data without syncing
   */
  clear(): void {
    if (this.timeoutId) {
      clearTimeout(this.timeoutId);
      this.timeoutId = null;
    }
    this.pendingData = {};
  }

  /**
   * Check if there's pending data
   */
  hasPendingData(): boolean {
    return Object.keys(this.pendingData).length > 0;
  }

  /**
   * Get pending data (for debugging)
   */
  getPendingData(): Record<string, unknown> {
    return { ...this.pendingData };
  }
}

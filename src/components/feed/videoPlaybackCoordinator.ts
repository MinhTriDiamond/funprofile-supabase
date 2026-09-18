/**
 * Video Playback Coordinator — singleton
 * Ensures only one video plays at a time across the entire feed.
 */

type PauseFn = () => void;

const registry = new Map<string, PauseFn>();
let currentId: string | null = null;

export const videoPlaybackCoordinator = {
  register(id: string, pauseFn: PauseFn) {
    registry.set(id, pauseFn);
  },

  unregister(id: string) {
    registry.delete(id);
    if (currentId === id) currentId = null;
  },

  requestPlay(id: string) {
    if (currentId && currentId !== id) {
      const pausePrev = registry.get(currentId);
      pausePrev?.();
    }
    currentId = id;
  },

  clearIfCurrent(id: string) {
    if (currentId === id) currentId = null;
  },
};

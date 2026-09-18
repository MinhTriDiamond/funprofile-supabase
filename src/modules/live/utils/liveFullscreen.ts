import { toast } from 'sonner';

type ScreenOrientationWithLock = ScreenOrientation & {
  lock?: (orientation: OrientationLockType) => Promise<void>;
  unlock?: () => void;
};

const LANDSCAPE_HINT = 'Vui lòng xoay ngang điện thoại để xem toàn màn hình';

function getScreenOrientation(): ScreenOrientationWithLock | undefined {
  return typeof screen !== 'undefined'
    ? (screen.orientation as ScreenOrientationWithLock | undefined)
    : undefined;
}

export function unlockLiveOrientation(): void {
  try {
    getScreenOrientation()?.unlock?.();
  } catch {
    // Some mobile browsers throw if the document is no longer fullscreen.
  }
}

export async function toggleLiveLandscapeFullscreen(target: HTMLElement | null): Promise<void> {
  if (!target) return;

  if (document.fullscreenElement) {
    await document.exitFullscreen().catch(() => undefined);
    unlockLiveOrientation();
    return;
  }

  if (!target.requestFullscreen) {
    toast.info(LANDSCAPE_HINT);
    return;
  }

  await target.requestFullscreen().catch(() => undefined);

  const orientation = getScreenOrientation();
  if (!orientation?.lock || !document.fullscreenElement) {
    toast.info(LANDSCAPE_HINT);
    return;
  }

  try {
    await orientation.lock('landscape');
  } catch {
    toast.info(LANDSCAPE_HINT);
  }
}

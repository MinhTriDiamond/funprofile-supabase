export function isLivePostDebugEnabled(): boolean {
  if (import.meta.env.DEV) return true;
  if (typeof window === 'undefined') return false;
  try {
    return window.localStorage.getItem('fun:debug:live-post') === '1';
  } catch {
    return false;
  }
}

export function getLivePostViewportDebug() {
  if (typeof window === 'undefined') {
    return { isMobile: false, width: null as number | null };
  }
  const width = window.innerWidth;
  return { isMobile: width < 768, width };
}

export function debugLivePost(label: string, payload: Record<string, unknown>): void {
  if (!isLivePostDebugEnabled()) return;
  console.debug(`[live-post] ${label}`, {
    ...getLivePostViewportDebug(),
    ...payload,
  });
}

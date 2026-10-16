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

const SENSITIVE_DEBUG_KEY = /(url|src|poster|stream.?key|token|authorization|secret|raw.?body|content)/i;

export function sanitizeLivePostDebugPayload(payload: Record<string, unknown>): Record<string, unknown> {
  const sanitize = (value: unknown, key = ''): unknown => {
    if (SENSITIVE_DEBUG_KEY.test(key)) return undefined;
    if (typeof value === 'string') {
      return value.replace(/https?:\/\/[^\s"'<>)}\]]+/gi, '[redacted-url]');
    }
    if (Array.isArray(value)) {
      return value.map((item) => sanitize(item)).filter((item) => item !== undefined);
    }
    if (value && typeof value === 'object') {
      return Object.fromEntries(
        Object.entries(value as Record<string, unknown>)
          .map(([childKey, childValue]) => [childKey, sanitize(childValue, childKey)])
          .filter(([, childValue]) => childValue !== undefined),
      );
    }
    return value;
  };

  return (sanitize(payload) as Record<string, unknown>) || {};
}

export function debugLivePost(label: string, payload: Record<string, unknown>): void {
  if (!isLivePostDebugEnabled()) return;
  console.debug(`[live-post] ${label}`, {
    ...getLivePostViewportDebug(),
    ...sanitizeLivePostDebugPayload(payload),
  });
}

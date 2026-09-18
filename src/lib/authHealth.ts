export const SUPABASE_AUTH_TRANSIENT_MESSAGE =
  'Lovable Cloud đang mất kết nối tạm thời với hệ thống đăng nhập. Vui lòng đợi 1–2 phút rồi thử lại.';

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL as string | undefined;

export interface SupabaseAuthHealthResult {
  ok: boolean;
  status?: number;
  durationMs: number;
  host?: string;
  error?: string;
}

export const getSupabaseAuthHost = (): string => {
  try {
    return SUPABASE_URL ? new URL(SUPABASE_URL).host : 'unknown-supabase-host';
  } catch {
    return 'unknown-supabase-host';
  }
};

export const isTransientAuthError = (error: unknown): boolean => {
  const err = error as { message?: string; name?: string; status?: number; statusCode?: number; code?: string };
  const msg = String(err?.message || err?.code || '').toLowerCase();
  const name = String(err?.name || '').toLowerCase();
  const status = err?.status || err?.statusCode;

  return (
    msg === 'auth_timeout' ||
    msg === 'supabase_auth_unavailable' ||
    msg.includes('timeout') ||
    msg.includes('timed out') ||
    msg.includes('failed to fetch') ||
    msg.includes('network') ||
    msg.includes('connection') ||
    // Lock contention trong gotrue-js (bị steal khi nhiều tab/component cùng truy cập)
    // và AbortError do request bị huỷ giữa chừng → coi như transient, retry im lặng.
    msg.includes('lock broken') ||
    msg.includes("'steal' option") ||
    msg.includes('aborted') ||
    msg.includes('request was aborted') ||
    name === 'aborterror' ||
    name === 'authretryablefetcherror' ||
    status === 522 ||
    status === 504 ||
    status === 503 ||
    status === 500 ||
    status === 408 ||
    status === 429
  );
};

export const withAuthTimeout = async <T,>(
  operation: () => Promise<T>,
  timeoutMs = 20_000,
): Promise<T> => {
  let timeoutId: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timeoutId = setTimeout(() => reject(new Error('AUTH_TIMEOUT')), timeoutMs);
  });

  try {
    return await Promise.race([operation(), timeout]);
  } finally {
    if (timeoutId) clearTimeout(timeoutId);
  }
};

export const checkSupabaseAuthHealth = async (
  timeoutMs = 8_000,
): Promise<SupabaseAuthHealthResult> => {
  const startedAt = performance.now();
  const host = getSupabaseAuthHost();

  if (!SUPABASE_URL) {
    return {
      ok: false,
      host,
      durationMs: Math.round(performance.now() - startedAt),
      error: 'missing_supabase_url',
    };
  }

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  try {
    // GoTrue /auth/v1/health yêu cầu apikey header, không kèm sẽ luôn 401
    // → authHealth bị đánh giá là 'degraded' sai và hiển thị banner "đang tạm gián đoạn".
    const apikey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string | undefined;
    const headers: Record<string, string> = {};
    if (apikey) {
      headers.apikey = apikey;
      headers.Authorization = `Bearer ${apikey}`;
    }
    const response = await fetch(`${SUPABASE_URL.replace(/\/$/, '')}/auth/v1/health`, {
      method: 'GET',
      signal: controller.signal,
      cache: 'no-store',
      headers,
    });
    const durationMs = Math.round(performance.now() - startedAt);

    return {
      ok: response.ok,
      status: response.status,
      durationMs,
      host,
      error: response.ok ? undefined : `http_${response.status}`,
    };
  } catch (error) {
    return {
      ok: false,
      durationMs: Math.round(performance.now() - startedAt),
      host,
      error: error instanceof Error ? error.message : String(error),
    };
  } finally {
    clearTimeout(timeoutId);
  }
};

export const assertSupabaseAuthHealthy = async (timeoutMs = 8_000): Promise<void> => {
  const health = await checkSupabaseAuthHealth(timeoutMs);
  if (import.meta.env.DEV || localStorage.getItem('fun:debug:auth') === '1') {
    console.debug('[AuthHealth]', health);
  }
  if (!health.ok) {
    const error = new Error('SUPABASE_AUTH_UNAVAILABLE') as Error & {
      status?: number;
      authHealth?: SupabaseAuthHealthResult;
    };
    error.status = health.status;
    error.authHealth = health;
    throw error;
  }
};

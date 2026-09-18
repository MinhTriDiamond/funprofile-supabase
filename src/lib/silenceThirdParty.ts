/**
 * Lọc noise console từ các nguồn không liên quan đến app:
 * - eth.merkle.io: wagmi public RPC bị CORS từ origin custom domain.
 * - cloudflarestream.com thumbnails 404: stream UID đã bị xoá sau khi archive sang R2.
 * Chỉ chặn ở production để dev vẫn thấy đầy đủ log.
 */
export function installThirdPartySilencer() {
  if (typeof window === 'undefined') return;

  const NOISE_RE = /(eth\.merkle\.io|cloudflarestream\.com\/[^\s"']+\/thumbnails\/)/i;

  // Chặn unhandledrejection từ các fetch CORS/404 third-party — tránh bị bắt
  // bởi React error reporter / Sentry fake và làm replay component unmount.
  window.addEventListener('unhandledrejection', (e) => {
    const msg = String((e as PromiseRejectionEvent).reason?.message ?? (e as PromiseRejectionEvent).reason ?? '');
    if (NOISE_RE.test(msg)) {
      e.preventDefault();
    }
  });

  if (import.meta.env.DEV) return;

  const origError = console.error;
  console.error = (...args: unknown[]) => {
    try {
      const joined = args.map((a) => (typeof a === 'string' ? a : JSON.stringify(a))).join(' ');
      if (NOISE_RE.test(joined)) return;
    } catch { /* fall through */ }
    origError.apply(console, args as []);
  };
}

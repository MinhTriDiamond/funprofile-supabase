import { useEffect, useRef } from 'react';

// Cloudflare Turnstile - widget xác minh người dùng thật cho các form xác thực.
// Site key là khóa CÔNG KHAI (VITE_TURNSTILE_SITE_KEY). Nếu chưa cấu hình key,
// component không render gì và TURNSTILE_ENABLED = false để các form vẫn chạy
// bình thường như trước (triển khai từng bước an toàn: frontend lên trước,
// bật ép buộc phía server sau).
export const TURNSTILE_SITE_KEY = (import.meta.env.VITE_TURNSTILE_SITE_KEY as string | undefined) || '';
export const TURNSTILE_ENABLED = TURNSTILE_SITE_KEY.length > 0;

declare global {
  interface Window {
    turnstile?: {
      render: (container: HTMLElement, options: Record<string, unknown>) => string;
      reset: (widgetId: string) => void;
      remove: (widgetId: string) => void;
    };
    __turnstileReady?: () => void;
  }
}

let scriptPromise: Promise<void> | null = null;
function loadTurnstileScript(): Promise<void> {
  if (window.turnstile) return Promise.resolve();
  if (!scriptPromise) {
    scriptPromise = new Promise((resolve) => {
      window.__turnstileReady = () => resolve();
      const s = document.createElement('script');
      s.src = 'https://challenges.cloudflare.com/turnstile/v0/api.js?onload=__turnstileReady&render=explicit';
      s.async = true;
      s.defer = true;
      document.head.appendChild(s);
    });
  }
  return scriptPromise;
}

interface TurnstileWidgetProps {
  onToken: (token: string | null) => void;
  // Tăng số này để reset widget (token Turnstile chỉ dùng được một lần).
  resetSignal?: number;
}

export const TurnstileWidget = ({ onToken, resetSignal = 0 }: TurnstileWidgetProps) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const widgetIdRef = useRef<string | null>(null);
  const onTokenRef = useRef(onToken);
  onTokenRef.current = onToken;
  const firstResetRef = useRef(true);

  useEffect(() => {
    if (!TURNSTILE_ENABLED || !containerRef.current) return;
    let cancelled = false;
    loadTurnstileScript().then(() => {
      if (cancelled || !containerRef.current || !window.turnstile) return;
      widgetIdRef.current = window.turnstile.render(containerRef.current, {
        sitekey: TURNSTILE_SITE_KEY,
        callback: (token: string) => onTokenRef.current(token),
        'expired-callback': () => onTokenRef.current(null),
        'error-callback': () => onTokenRef.current(null),
      });
    });
    return () => {
      cancelled = true;
      if (widgetIdRef.current && window.turnstile) {
        try {
          window.turnstile.remove(widgetIdRef.current);
        } catch {
          /* widget đã bị gỡ */
        }
        widgetIdRef.current = null;
      }
    };
  }, []);

  useEffect(() => {
    if (firstResetRef.current) {
      firstResetRef.current = false;
      return;
    }
    if (widgetIdRef.current && window.turnstile) {
      try {
        window.turnstile.reset(widgetIdRef.current);
      } catch {
        /* widget chưa sẵn sàng */
      }
      onTokenRef.current(null);
    }
  }, [resetSignal]);

  if (!TURNSTILE_ENABLED) return null;
  return <div ref={containerRef} className="flex justify-center py-1" />;
};

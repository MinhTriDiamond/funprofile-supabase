/**
 * Tự re-check linkedWalletAddress + reconnect wagmi khi user quay lại tab Fun.Rich
 * (ví dụ sau khi xác nhận trong MetaMask DApp browser → switch về Safari).
 *
 * Mount 1 lần ở root (App.tsx) — KHÔNG gắn vào nhiều component để tránh duplicate listeners.
 */
import { useEffect, useRef } from 'react';
import { useAccount, useReconnect } from 'wagmi';
import { useQueryClient } from '@tanstack/react-query';
import { logWalletEvent } from '@/lib/walletDebugLog';

const DEBOUNCE_MS = 800;

export function useWalletVisibilityRefresh() {
  const { status } = useAccount();
  const { reconnect } = useReconnect();
  const queryClient = useQueryClient();
  const lastRunRef = useRef(0);

  useEffect(() => {
    const handle = (source: string) => {
      const now = Date.now();
      if (now - lastRunRef.current < DEBOUNCE_MS) return;
      lastRunRef.current = now;

      // Chỉ chạy khi tab thực sự visible
      if (typeof document !== 'undefined' && document.visibilityState === 'hidden') return;

      logWalletEvent('visibility.refresh', { source, wagmiStatus: status });

      // 1) Invalidate linked-wallet để fetch lại từ backend
      queryClient.invalidateQueries({ queryKey: ['linked-wallet'] }).catch(() => {});

      // 2) Nếu wagmi disconnected mà có connector cũ trong storage → thử reconnect
      if (status === 'disconnected') {
        try {
          const recent = localStorage.getItem('wagmi.recentConnectorId');
          if (recent) {
            logWalletEvent('visibility.reconnect_attempt', { recentConnector: recent });
            reconnect();
          }
        } catch {}
      }
    };

    const onVisibility = () => {
      if (document.visibilityState === 'visible') handle('visibilitychange');
    };
    const onPageShow = (e: PageTransitionEvent) => handle(e.persisted ? 'pageshow.bfcache' : 'pageshow');
    const onFocus = () => handle('focus');

    document.addEventListener('visibilitychange', onVisibility);
    window.addEventListener('pageshow', onPageShow);
    window.addEventListener('focus', onFocus);

    return () => {
      document.removeEventListener('visibilitychange', onVisibility);
      window.removeEventListener('pageshow', onPageShow);
      window.removeEventListener('focus', onFocus);
    };
  }, [status, reconnect, queryClient]);
}

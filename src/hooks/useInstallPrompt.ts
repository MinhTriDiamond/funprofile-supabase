import { useState, useEffect, useCallback } from 'react';

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

export type InstallPlatform = 'ios' | 'android' | 'desktop' | 'unknown';

const DISMISS_KEY = 'fun_install_banner_dismissed_at';
const DISMISS_COOLDOWN_DAYS = 7;

function detectPlatform(): InstallPlatform {
  if (typeof navigator === 'undefined') return 'unknown';
  const ua = navigator.userAgent.toLowerCase();
  if (/iphone|ipad|ipod/.test(ua)) return 'ios';
  if (/android/.test(ua)) return 'android';
  return 'desktop';
}

function isStandalone(): boolean {
  if (typeof window === 'undefined') return false;
  return (
    window.matchMedia?.('(display-mode: standalone)').matches ||
    // iOS Safari
    (window.navigator as unknown as { standalone?: boolean }).standalone === true
  );
}

function isDismissedRecently(): boolean {
  try {
    const v = localStorage.getItem(DISMISS_KEY);
    if (!v) return false;
    const at = Number(v);
    if (!at) return false;
    const days = (Date.now() - at) / (1000 * 60 * 60 * 24);
    return days < DISMISS_COOLDOWN_DAYS;
  } catch {
    return false;
  }
}

/**
 * Hook lắng nghe beforeinstallprompt và quản lý trạng thái cài đặt PWA.
 * - Android/Chrome/Edge: dùng deferredPrompt.prompt()
 * - iOS Safari: hướng dẫn Share → Add to Home Screen
 * - Desktop: dùng deferredPrompt nếu khả dụng, ngược lại hướng dẫn
 */
export function useInstallPrompt() {
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [installed, setInstalled] = useState<boolean>(() => isStandalone());
  const [platform] = useState<InstallPlatform>(() => detectPlatform());
  const [dismissed, setDismissed] = useState<boolean>(() => isDismissedRecently());

  useEffect(() => {
    const handleBeforeInstall = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e as BeforeInstallPromptEvent);
    };

    const handleInstalled = () => {
      setInstalled(true);
      setDeferredPrompt(null);
    };

    window.addEventListener('beforeinstallprompt', handleBeforeInstall);
    window.addEventListener('appinstalled', handleInstalled);

    // Re-check standalone on display-mode change
    const mq = window.matchMedia?.('(display-mode: standalone)');
    const handleChange = () => setInstalled(isStandalone());
    mq?.addEventListener?.('change', handleChange);

    return () => {
      window.removeEventListener('beforeinstallprompt', handleBeforeInstall);
      window.removeEventListener('appinstalled', handleInstalled);
      mq?.removeEventListener?.('change', handleChange);
    };
  }, []);

  const promptInstall = useCallback(async (): Promise<'accepted' | 'dismissed' | 'unavailable'> => {
    if (!deferredPrompt) return 'unavailable';
    try {
      await deferredPrompt.prompt();
      const { outcome } = await deferredPrompt.userChoice;
      setDeferredPrompt(null);
      if (outcome === 'accepted') setInstalled(true);
      return outcome;
    } catch {
      return 'unavailable';
    }
  }, [deferredPrompt]);

  const dismiss = useCallback(() => {
    try {
      localStorage.setItem(DISMISS_KEY, String(Date.now()));
    } catch {
      // ignore
    }
    setDismissed(true);
  }, []);

  // Có thể hiển thị banner khi: chưa cài, chưa dismiss, và (có deferred prompt HOẶC iOS)
  const canShowBanner = !installed && !dismissed && (deferredPrompt !== null || platform === 'ios');

  return {
    platform,
    installed,
    dismissed,
    canShowBanner,
    canPrompt: deferredPrompt !== null,
    promptInstall,
    dismiss,
  };
}

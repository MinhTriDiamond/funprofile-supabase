import { useEffect, useRef, useState, useCallback } from "react";
import { applyHardUpdate } from "@/lib/appUpdateRecovery";
import logger from "@/lib/logger";

const CHECK_INTERVAL = 5 * 60 * 1000; // 5 minutes

function extractScriptSrc(html: string): string | null {
  const match = html.match(/src="(\/assets\/index-[^"]+\.js)"/);
  return match?.[1] ?? null;
}

function getCurrentScriptSrc(): string | null {
  const scripts = Array.from(document.querySelectorAll<HTMLScriptElement>('script[type="module"][src]'));
  const entry = scripts.find((script) => /\/assets\/index-[^/]+\.js/.test(script.src));
  if (!entry) return null;
  try {
    return new URL(entry.src).pathname;
  } catch {
    return entry.getAttribute('src');
  }
}

export function forceAppUpdate() {
  applyHardUpdate({ resetRecovery: true, fallbackToHome: true, reason: 'unknown' });
}

export function useVersionCheck() {
  const [updateAvailable, setUpdateAvailable] = useState(false);
  const initialSrc = useRef<string | null>(getCurrentScriptSrc());
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const checkVersion = useCallback(async () => {
    if (document.visibilityState !== "visible") return;
    try {
      const res = await fetch(`/index.html?t=${Date.now()}`, { cache: "no-store" });
      if (!res.ok) return;
      const html = await res.text();
      const src = extractScriptSrc(html);
      if (!src) return;

      if (initialSrc.current === null) {
        initialSrc.current = getCurrentScriptSrc() || src;
      }

      if (src !== initialSrc.current) {
        logger.debug("[VersionCheck] New version detected:", { current: initialSrc.current, latest: src });
        setUpdateAvailable(true);
        // Stop polling once detected
        if (intervalRef.current) {
          clearInterval(intervalRef.current);
          intervalRef.current = null;
        }
        return;
      }
    } catch {
      // Network error, ignore
    }
  }, []);

  const applyUpdate = useCallback(() => {
    forceAppUpdate();
  }, []);

  useEffect(() => {
    // Initial check
    checkVersion();
    intervalRef.current = setInterval(checkVersion, CHECK_INTERVAL);
    window.addEventListener("focus", checkVersion);
    window.addEventListener("online", checkVersion);
    document.addEventListener("visibilitychange", checkVersion);

    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
      window.removeEventListener("focus", checkVersion);
      window.removeEventListener("online", checkVersion);
      document.removeEventListener("visibilitychange", checkVersion);
    };
  }, [checkVersion]);

  return { updateAvailable, applyUpdate };
}

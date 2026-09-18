import { useEffect, useRef } from "react";
import { useLocation, useNavigationType } from "react-router-dom";

const SCROLL_KEY_PREFIX = "fun:scroll:";
const MAX_ENTRIES = 50;

function readScroll(pathname: string): number | null {
  try {
    const raw = sessionStorage.getItem(SCROLL_KEY_PREFIX + pathname);
    if (!raw) return null;
    const n = Number(raw);
    return Number.isFinite(n) ? n : null;
  } catch {
    return null;
  }
}

function writeScroll(pathname: string, y: number) {
  try {
    sessionStorage.setItem(SCROLL_KEY_PREFIX + pathname, String(y));
    // Lightweight cleanup: nếu vượt MAX_ENTRIES, xoá entry cũ nhất
    const keys: string[] = [];
    for (let i = 0; i < sessionStorage.length; i++) {
      const k = sessionStorage.key(i);
      if (k && k.startsWith(SCROLL_KEY_PREFIX)) keys.push(k);
    }
    if (keys.length > MAX_ENTRIES) {
      sessionStorage.removeItem(keys[0]);
    }
  } catch {
    // private mode → bỏ qua
  }
}

const ScrollToTop = () => {
  const { pathname } = useLocation();
  const navType = useNavigationType(); // 'POP' | 'PUSH' | 'REPLACE'
  const prevPathnameRef = useRef<string | null>(null);

  useEffect(() => {
    const prev = prevPathnameRef.current;

    // Lưu scroll của trang trước khi rời đi
    if (prev && prev !== pathname) {
      const appScroll = document.querySelector('[data-app-scroll]') as HTMLElement | null;
      const y = appScroll ? appScroll.scrollTop : window.scrollY;
      writeScroll(prev, y);
    }

    // Bỏ qua lần render đầu tiên (mount): không scroll, không reset
    // → tránh trường hợp tab quay lại làm guard re-render mà ScrollToTop kéo về 0.
    if (prev === pathname) return;

    prevPathnameRef.current = pathname;
    if (prev === null) return; // mount lần đầu — giữ nguyên scroll trình duyệt

    const appScroll = document.querySelector('[data-app-scroll]') as HTMLElement | null;

    // POP (back/forward) → khôi phục scroll cũ nếu có
    if (navType === 'POP') {
      const restored = readScroll(pathname);
      if (restored !== null) {
        if (appScroll) appScroll.scrollTo({ top: restored, left: 0 });
        else window.scrollTo({ top: restored, left: 0 });
        return;
      }
    }

    // Điều hướng mới → về top
    if (appScroll) appScroll.scrollTo({ top: 0, left: 0 });
    window.scrollTo({ top: 0, left: 0 });
  }, [pathname, navType]);

  return null;
};

export default ScrollToTop;

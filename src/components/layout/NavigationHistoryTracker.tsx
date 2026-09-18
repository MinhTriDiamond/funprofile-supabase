import { useEffect } from 'react';
import { useLocation } from 'react-router-dom';

const STORAGE_KEY = 'nav:stack';
const MAX_ENTRIES = 20;

/** Các route không nên đưa vào stack (auth/callback/redirect) */
const EXCLUDED = [
  /^\/auth(\/|$)/,
  /^\/verify-email/,
  /^\/reset-password/,
  /^\/set-password/,
  /^\/begin$/,
];

function isExcluded(pathname: string): boolean {
  return EXCLUDED.some((re) => re.test(pathname));
}

function readStack(): string[] {
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const arr = JSON.parse(raw);
    return Array.isArray(arr) ? arr.filter((x) => typeof x === 'string') : [];
  } catch {
    return [];
  }
}

function writeStack(stack: string[]) {
  try {
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(stack.slice(-MAX_ENTRIES)));
  } catch {}
}

/**
 * Trả về route in-app đứng trước route hiện tại (nếu có).
 */
export function getPreviousInAppRoute(currentPath: string): string | null {
  const stack = readStack();
  const currentPathname = currentPath.split('?')[0].split('#')[0];
  // Tìm entry áp chót khác current VÀ khác pathname (tránh loop tab/search/hash)
  for (let i = stack.length - 2; i >= 0; i--) {
    const entry = stack[i];
    if (!entry || entry === currentPath) continue;
    const entryPathname = entry.split('?')[0].split('#')[0];
    if (entryPathname === currentPathname) continue;
    return entry;
  }
  return null;
}

/**
 * Mount 1 lần trong App — ghi nhận mỗi lần đổi route in-app vào sessionStorage.
 */
export function NavigationHistoryTracker() {
  const location = useLocation();

  useEffect(() => {
    const path = location.pathname + location.search;
    if (isExcluded(location.pathname)) return;
    const stack = readStack();
    const last = stack[stack.length - 1];
    if (last === path) return;
    // Nếu chỉ khác search/hash trên cùng pathname → replace entry cuối,
    // tránh tích lũy entry mỗi lần đổi tab gây loop khi Back.
    const lastPath = last ? last.split('?')[0].split('#')[0] : null;
    if (lastPath === location.pathname) {
      stack[stack.length - 1] = path;
    } else {
      stack.push(path);
    }
    writeStack(stack);
  }, [location.pathname, location.search]);

  return null;
}

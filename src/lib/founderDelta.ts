/**
 * So sánh kỳ — lưu snapshot KPI cuối cùng vào localStorage và tính Δ% so với lần xem trước.
 *
 * Dùng cho các panel không có sẵn baseline kỳ trước trong RPC (Overview).
 * Snapshot per-key, TTL 7 ngày để tránh so sánh với dữ liệu quá cũ.
 */

const PREFIX = 'founder-snapshot-v1:';
const TTL_MS = 7 * 24 * 60 * 60 * 1000;

interface Snapshot<T> {
  ts: number;
  data: T;
}

export function loadSnapshot<T>(key: string): Snapshot<T> | null {
  try {
    const raw = localStorage.getItem(PREFIX + key);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Snapshot<T>;
    if (Date.now() - parsed.ts > TTL_MS) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function saveSnapshot<T>(key: string, data: T): void {
  try {
    localStorage.setItem(PREFIX + key, JSON.stringify({ ts: Date.now(), data }));
  } catch {}
}

export function pctDelta(current: number, previous: number): number | null {
  if (!previous || previous === 0) return null;
  return ((current - previous) / previous) * 100;
}

export function formatDelta(delta: number | null): { text: string; color: string } {
  if (delta === null) return { text: '—', color: 'text-muted-foreground' };
  const sign = delta > 0 ? '+' : '';
  const color =
    delta > 0 ? 'text-emerald-600 dark:text-emerald-400'
      : delta < 0 ? 'text-destructive'
        : 'text-muted-foreground';
  return { text: `${sign}${delta.toFixed(1)}%`, color };
}

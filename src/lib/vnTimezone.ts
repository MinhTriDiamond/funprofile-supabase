/**
 * Helper functions for Vietnam timezone (UTC+7) calculations.
 * Used across Gift Celebration and Donation History to ensure consistent date ranges.
 */

/** Get today's date string in VN timezone (YYYY-MM-DD) */
export function getTodayVN(): string {
  const now = new Date();
  const vn = new Date(now.getTime() + 7 * 60 * 60 * 1000);
  return `${vn.getUTCFullYear()}-${String(vn.getUTCMonth() + 1).padStart(2, '0')}-${String(vn.getUTCDate()).padStart(2, '0')}`;
}

/** Convert a VN date string (YYYY-MM-DD) to a UTC ISO range { start, end } */
export function vnDateToUtcRange(dateStr: string): { start: string; end: string } {
  const [y, m, d] = dateStr.split('-').map(Number);
  const vnMidnight = new Date(Date.UTC(y, m - 1, d, 0, 0, 0));
  const utcStart = new Date(vnMidnight.getTime() - 7 * 60 * 60 * 1000);
  const utcEnd = new Date(utcStart.getTime() + 24 * 60 * 60 * 1000);
  return { start: utcStart.toISOString(), end: utcEnd.toISOString() };
}

/** Get today's full UTC range in VN timezone */
export function getVNTodayRange(): { start: string; end: string; dateStr: string } {
  const dateStr = getTodayVN();
  const { start, end } = vnDateToUtcRange(dateStr);
  return { start, end, dateStr };
}

export type VnTimeRange = 'today' | 'week' | 'month' | 'year' | 'all';

/**
 * Batch 1.4 — Trả về khoảng UTC ISO tương ứng với phạm vi thời gian theo giờ Việt Nam (UTC+7).
 * - today: 00:00 hôm nay (VN) → hiện tại
 * - week:  00:00 thứ Hai tuần này (VN) → hiện tại
 * - month: 00:00 ngày 1 tháng này (VN) → hiện tại
 * - year:  00:00 ngày 1/1 năm này (VN) → hiện tại
 * - all:   { start: null, end: null }
 *
 * Dùng cho mọi màn hình BXH / thống kê thay vì `date_trunc('month', now())` (UTC) — trước đây lệch 7h.
 */
export function getVnTimezoneRange(range: VnTimeRange): { start: string | null; end: string | null } {
  if (range === 'all') return { start: null, end: null };

  const now = new Date();
  const vn = new Date(now.getTime() + 7 * 60 * 60 * 1000);
  const y = vn.getUTCFullYear();
  const m = vn.getUTCMonth();
  const d = vn.getUTCDate();

  let vnStart: Date;
  if (range === 'today') {
    vnStart = new Date(Date.UTC(y, m, d, 0, 0, 0));
  } else if (range === 'week') {
    // ISO week: thứ Hai = 1, Chủ nhật = 0 → coi Chủ nhật là ngày cuối tuần
    const dow = vn.getUTCDay();
    const daysFromMonday = (dow + 6) % 7;
    vnStart = new Date(Date.UTC(y, m, d - daysFromMonday, 0, 0, 0));
  } else if (range === 'month') {
    vnStart = new Date(Date.UTC(y, m, 1, 0, 0, 0));
  } else {
    vnStart = new Date(Date.UTC(y, 0, 1, 0, 0, 0));
  }

  const utcStart = new Date(vnStart.getTime() - 7 * 60 * 60 * 1000);
  return { start: utcStart.toISOString(), end: now.toISOString() };
}

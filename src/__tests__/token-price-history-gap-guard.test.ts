/**
 * Guard B7a (M6E) — token_price_history KHÔNG được có ngày thiếu giá trong
 * cửa sổ 14 ngày gần nhất cho mọi symbol đang lưu hành.
 *
 * - Lớp 1 (offline): kiểm tra logic tính chuỗi ngày thiếu (đúng cùng công thức
 *   với mode `gap_alert` của edge `token-price-history-daily`).
 * - Lớp 2 (live, tự SKIP nếu không có PGHOST): đọc DB thật, fail nếu còn ngày
 *   thiếu → tự phát hiện khi cron `token-price-history-daily` hoặc
 *   `token-price-gap-alert` chết âm thầm.
 *
 * Cửa sổ: [current_date - 14 ; current_date - 1]. Bỏ HÔM NAY vì CoinGecko chỉ
 * có giá chốt của ngày đã qua (cùng quy ước với cron).
 */
import { describe, it, expect } from "vitest";
import { execFileSync } from "node:child_process";

export const GAP_WINDOW_DAYS = 14;
export const MAX_GAP_STREAK = 3;
export const CIRCULATING_SYMBOLS = ["BNB", "BTC", "BTCB", "USDT", "CAMLY", "TON"] as const;

/** Chuỗi ngày thiếu dài nhất — mirror của mode gap_alert. */
export function worstGapStreak(dates: string[], have: Set<string>): number {
  let cur = 0;
  let worst = 0;
  for (const d of dates) {
    if (have.has(d)) cur = 0;
    else worst = Math.max(worst, ++cur);
  }
  return worst;
}

describe("gap streak logic (offline mirror của cron gap_alert)", () => {
  const dates = ["2026-08-01", "2026-08-02", "2026-08-03", "2026-08-04", "2026-08-05"];

  it("đủ giá mọi ngày → streak 0", () => {
    expect(worstGapStreak(dates, new Set(dates))).toBe(0);
  });

  it("thiếu rải rác 1 ngày → streak 1, không vượt ngưỡng cảnh báo", () => {
    const have = new Set(dates.filter((d) => d !== "2026-08-03"));
    expect(worstGapStreak(dates, have)).toBe(1);
    expect(worstGapStreak(dates, have)).toBeLessThanOrEqual(MAX_GAP_STREAK);
  });

  it("thiếu 4 ngày liên tiếp → vượt ngưỡng MAX_GAP_STREAK", () => {
    const have = new Set(["2026-08-01"]);
    expect(worstGapStreak(dates, have)).toBe(4);
    expect(worstGapStreak(dates, have)).toBeGreaterThan(MAX_GAP_STREAK);
  });
});

const hasDb = !!process.env.PGHOST;

function psql(sql: string) {
  return execFileSync("psql", ["-tAc", sql], { encoding: "utf8" }).trim();
}

describe("token_price_history coverage (live DB)", () => {
  it.skipIf(!hasDb)(
    `0 ngày thiếu giá trong ${GAP_WINDOW_DAYS} ngày gần nhất cho mọi symbol lưu hành`,
    () => {
      const symbols = CIRCULATING_SYMBOLS.map((s) => `'${s}'`).join(",");
      const out = psql(`
        with d as (
          select generate_series(current_date - ${GAP_WINDOW_DAYS}, current_date - 1, '1 day')::date dt
        ), s as (select unnest(array[${symbols}]) sym)
        select coalesce(string_agg(s.sym || ':' || d.dt, ', '), '')
        from s cross join d
        left join public.token_price_history h
          on h.symbol = s.sym and h.date = d.dt
        where h.price_usd is null
      `);
      expect(out).toBe("");
    },
  );

  it.skipIf(!hasDb)("mọi giá lưu đều > 0 (không có giá bịa 0 / âm)", () => {
    const bad = psql(`
      select count(*) from public.token_price_history
      where price_usd is null or price_usd <= 0
    `);
    expect(Number(bad)).toBe(0);
  });
});

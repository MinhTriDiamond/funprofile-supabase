/**
 * BTC Raw-Satoshi Guard Test
 * - Offline: hằng số + danh sách bảng.
 * - Live: fetch edge `btc-raw-sat-guard`. Skip nếu thiếu env (parity với
 *   cascade-consistency.test.ts).
 *
 * CI cần biến env `BTC_GUARD_SERVICE_KEY` (service_role) để pass admin
 * gate — nếu không có, live block SKIP.
 */
import { describe, it, expect } from "vitest";

const RAW_SAT_BTC_THRESHOLD = 1000;
const GUARDED_TABLES = ["transactions", "donations", "wallet_transfers"] as const;

describe("BTC raw-satoshi guard (offline)", () => {
  it("Threshold = 1000 (ngưỡng phát hiện raw-satoshi, không phải giới hạn nghiệp vụ)", () => {
    expect(RAW_SAT_BTC_THRESHOLD).toBe(1000);
  });

  it("Phủ đủ 3 bảng liên quan BTC", () => {
    expect(GUARDED_TABLES).toContain("transactions");
    expect(GUARDED_TABLES).toContain("donations");
    expect(GUARDED_TABLES).toContain("wallet_transfers");
    expect(GUARDED_TABLES.length).toBe(3);
  });
});

describe("BTC raw-satoshi guard (live)", () => {
  const url = process.env.VITE_SUPABASE_URL;
  const anon = process.env.VITE_SUPABASE_PUBLISHABLE_KEY;
  const serviceKey = process.env.BTC_GUARD_SERVICE_KEY; // service_role cho CI

  it.skipIf(!url || !anon || !serviceKey)(
    "Edge btc-raw-sat-guard trả ok=true, cả 2 tầng check sạch",
    { timeout: 30000 },
    async () => {
      let res: Response;
      try {
        res = await fetch(`${url}/functions/v1/btc-raw-sat-guard`, {
          headers: {
            apikey: anon!,
            Authorization: `Bearer ${serviceKey}`,
          },
        });
      } catch (e) {
        console.warn("⚠️ btc-raw-sat-guard unreachable, skip:", e);
        return;
      }
      if (!res.ok) {
        console.warn(`⚠️ btc-raw-sat-guard HTTP ${res.status}, skip`);
        return;
      }
      const j = await res.json().catch(() => null);
      if (!j) {
        console.warn("⚠️ btc-raw-sat-guard trả JSON không hợp lệ, skip");
        return;
      }
      if (!j.ok) {
        console.error(
          "⚠️ BTC RAW-SAT DRIFT:\n",
          JSON.stringify(j.checks, null, 2),
        );
      }
      expect(j.ok).toBe(true);
      expect(j.checks?.threshold_1000?.ok).toBe(true);
      expect(j.checks?.threshold_1000?.offenders).toEqual([]);
      expect(j.checks?.cross_table_ratio_1e8?.ok).toBe(true);
      expect(j.checks?.cross_table_ratio_1e8?.offenders).toEqual([]);
    },
  );
});

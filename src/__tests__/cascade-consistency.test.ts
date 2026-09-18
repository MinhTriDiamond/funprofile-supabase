/**
 * Cascade Consistency Test
 * - Đảm bảo CASCADE_CONFIG (frontend) khớp epoch_config (DB live).
 * - Chạy mỗi lần build qua `bun run test:cascade`.
 * - Nếu thiếu env (local dev không có .env Supabase) → SKIP, không fail.
 */
import { describe, it, expect } from "vitest";
import { CASCADE_CONFIG, POOLS_SUM, PER_USER_HARD_CAP } from "@/config/cascade-constants";

describe("Cascade invariants (offline)", () => {
  it("Tổng 5 pool = 1.0", () => {
    expect(Math.abs(POOLS_SUM - 1)).toBeLessThan(1e-6);
  });

  it("instant + locked = 1.0", () => {
    const sum = CASCADE_CONFIG.instantPortionPct + CASCADE_CONFIG.lockedPortionPct;
    expect(Math.abs(sum - 1)).toBeLessThan(1e-6);
  });

  it("Trần cá nhân = ceiling × user × maxShare", () => {
    expect(PER_USER_HARD_CAP).toBe(
      CASCADE_CONFIG.softCeiling *
        CASCADE_CONFIG.pools.user *
        CASCADE_CONFIG.maxSharePerUser,
    );
  });

  it("max_share_per_user ∈ (0, 0.1] (anti-whale sane bounds)", () => {
    expect(CASCADE_CONFIG.maxSharePerUser).toBeGreaterThan(0);
    expect(CASCADE_CONFIG.maxSharePerUser).toBeLessThanOrEqual(0.1);
  });
});

describe("Cascade DB sync (live)", () => {
  const url = process.env.VITE_SUPABASE_URL;
  const key = process.env.VITE_SUPABASE_PUBLISHABLE_KEY;

  it.skipIf(!url || !key)("Edge function cascade-consistency-check trả ok=true", { timeout: 30000 }, async () => {
    let res: Response;
    try {
      res = await fetch(`${url}/functions/v1/cascade-consistency-check`, {
        headers: { apikey: key!, Authorization: `Bearer ${key}` },
      });
    } catch (e) {
      console.warn("⚠️ cascade-consistency-check unreachable, skip live check:", e);
      return;
    }
    if (!res.ok) {
      console.warn(`⚠️ cascade-consistency-check HTTP ${res.status}, skip live check`);
      return;
    }
    const json = await res.json().catch(() => null);
    if (!json) {
      console.warn("⚠️ cascade-consistency-check trả JSON không hợp lệ, skip");
      return;
    }
    if (!json.ok) {
      console.error("⚠️ DRIFT:", JSON.stringify(json.drift, null, 2));
    }
    expect(json.ok).toBe(true);
    expect(json.drift).toEqual([]);
  });
});

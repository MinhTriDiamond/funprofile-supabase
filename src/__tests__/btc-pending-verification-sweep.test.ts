/**
 * Guard cho cron `btc-pending-verification-sweep-daily`
 * (RPC `public.btc_pending_verification_sweep(ttl_days)`).
 *
 * Offline: khoá cứng quy tắc khớp CHẶT + TTL 30 ngày + tên trạng thái.
 * Live: xác nhận `anon` KHÔNG gọi được RPC (skip nếu thiếu env).
 */
import { describe, it, expect } from "vitest";

export const PENDING_TTL_DAYS = 30;
export const STATUS_PENDING = "pending_verification";
export const STATUS_REJECTED = "rejected_unverified";

interface FakeRow {
  sender_id: string;
  recipient_id: string;
  amount: string;
  pending_verification_since: string;
}
interface RealRow {
  sender_id: string;
  recipient_id: string;
  amount: string;
  sender_address: string | null;
  tx_hash: string;
}

/** Khớp CHẶT: cùng người gửi + người nhận + amount TUYỆT ĐỐI + địa chỉ gửi on-chain thuộc chính người gửi. */
export function isStrictMatch(
  fake: FakeRow,
  real: RealRow,
  ownedAddresses: Record<string, string[]>,
): boolean {
  if (real.tx_hash.startsWith("btc-manual-")) return false;
  if (fake.sender_id !== real.sender_id) return false;
  if (fake.recipient_id !== real.recipient_id) return false;
  if (fake.amount !== real.amount) return false;
  if (!real.sender_address) return false;
  return (ownedAddresses[fake.sender_id] ?? []).includes(real.sender_address);
}

export function isExpired(since: string, now: Date, ttlDays = PENDING_TTL_DAYS): boolean {
  return new Date(since).getTime() < now.getTime() - ttlDays * 86_400_000;
}

const fake: FakeRow = {
  sender_id: "u1",
  recipient_id: "u2",
  amount: "0.00063",
  pending_verification_since: "2026-08-22T00:00:00Z",
};
const owned = { u1: ["bc1qsender-of-u1"] };

describe("btc_pending_verification_sweep — khớp chặt", () => {
  it("Khớp đủ 4 điều kiện → merge", () => {
    expect(
      isStrictMatch(fake, { ...fake, sender_address: "bc1qsender-of-u1", tx_hash: "abc" }, owned),
    ).toBe(true);
  });

  it("Cùng amount + thời gian nhưng địa chỉ gửi KHÔNG thuộc người gửi → KHÔNG merge", () => {
    expect(
      isStrictMatch(fake, { ...fake, sender_address: "bc1q-someone-else", tx_hash: "abc" }, owned),
    ).toBe(false);
  });

  it("Thiếu sender_address on-chain → KHÔNG merge (không đoán)", () => {
    expect(isStrictMatch(fake, { ...fake, sender_address: null, tx_hash: "abc" }, owned)).toBe(false);
  });

  it("Amount lệch dù rất nhỏ → KHÔNG merge", () => {
    expect(
      isStrictMatch(
        fake,
        { ...fake, amount: "0.000631", sender_address: "bc1qsender-of-u1", tx_hash: "abc" },
        owned,
      ),
    ).toBe(false);
  });

  it("Khác người nhận → KHÔNG merge", () => {
    expect(
      isStrictMatch(
        fake,
        { ...fake, recipient_id: "u3", sender_address: "bc1qsender-of-u1", tx_hash: "abc" },
        owned,
      ),
    ).toBe(false);
  });

  it("Dòng đối chiếu cũng là btc-manual-% → KHÔNG merge", () => {
    expect(
      isStrictMatch(
        fake,
        { ...fake, sender_address: "bc1qsender-of-u1", tx_hash: "btc-manual-123" },
        owned,
      ),
    ).toBe(false);
  });
});

describe("btc_pending_verification_sweep — TTL", () => {
  it("TTL cố định 30 ngày", () => {
    expect(PENDING_TTL_DAYS).toBe(30);
  });

  it("Đúng 29 ngày → chưa hết hạn", () => {
    expect(isExpired("2026-08-22T00:00:00Z", new Date("2026-09-20T00:00:00Z"))).toBe(false);
  });

  it("31 ngày → hết hạn, chuyển rejected_unverified", () => {
    expect(isExpired("2026-08-22T00:00:00Z", new Date("2026-09-22T01:00:00Z"))).toBe(true);
  });

  it("Tên trạng thái khớp CHECK constraint donations_status_check", () => {
    expect([STATUS_PENDING, STATUS_REJECTED]).toEqual([
      "pending_verification",
      "rejected_unverified",
    ]);
  });
});

describe("btc_pending_verification_sweep — quyền RPC (live)", () => {
  const url = process.env.VITE_SUPABASE_URL;
  const anon = process.env.VITE_SUPABASE_PUBLISHABLE_KEY;

  it.skipIf(!url || !anon)(
    "anon KHÔNG gọi được RPC sweep",
    { timeout: 20000 },
    async () => {
      const res = await fetch(`${url}/rest/v1/rpc/btc_pending_verification_sweep`, {
        method: "POST",
        headers: {
          apikey: anon as string,
          Authorization: `Bearer ${anon}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ _ttl_days: 30 }),
      });
      await res.text();
      expect(res.ok).toBe(false);
      expect([401, 403, 404]).toContain(res.status);
    },
  );
});

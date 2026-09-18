/**
 * BTC Attribution Resolver — Phase 1 gate test.
 *
 * Bất biến (RC3 — sở hữu-theo-thời-gian, RC8 — cấm suy luận vòng tròn):
 *  1. Time-travel: cùng 1 địa chỉ, 2 mốc thời gian, phải suy ra đúng 2 chủ khác nhau
 *     (chủ cũ trước khi valid_to, chủ mới sau verified_at của lần ký mới).
 *  2. Không có bằng chứng ⇒ NULL, không fallback/suy luận.
 *  3. Chuẩn hoá địa chỉ: bech32 (bc1q/bc1p) case-insensitive, legacy base58 (1.../3...)
 *     case-sensitive — lowercase vô điều kiện sẽ làm sai lệch verify chữ ký BIP-322.
 */
import { describe, it, expect } from "vitest";
import { btcNormalizeAddress, resolveBtcOwnerAt, type BtcOwnershipRow } from "@/lib/btc/btcOwnershipResolver";

const ADDR = "bc1qexampleaddressxxxxxxxxxxxxxxxxxxxxxxxxxxx";
const USER_A = "11111111-1111-1111-1111-111111111111";
const USER_B = "22222222-2222-2222-2222-222222222222";

describe("btcNormalizeAddress", () => {
  it("lowercase địa chỉ bech32 (case-insensitive theo BIP-173)", () => {
    expect(btcNormalizeAddress("BC1QEXAMPLE")).toBe("bc1qexample");
    expect(btcNormalizeAddress("bc1pTaprootMixedCase")).toBe("bc1ptaprootmixedcase");
  });

  it("GIỮ NGUYÊN case của địa chỉ legacy base58 (case-sensitive)", () => {
    // 1A1zP1eP5QGefi2DMPTfTL5SLmv7DivfNa — địa chỉ Genesis block thật, mixed-case có ý nghĩa
    expect(btcNormalizeAddress("1A1zP1eP5QGefi2DMPTfTL5SLmv7DivfNa")).toBe(
      "1A1zP1eP5QGefi2DMPTfTL5SLmv7DivfNa",
    );
    expect(btcNormalizeAddress("3J98t1WpEZ73CNmQviecrnyiWrnqRhWNLy")).toBe(
      "3J98t1WpEZ73CNmQviecrnyiWrnqRhWNLy",
    );
  });

  it("trim khoảng trắng", () => {
    expect(btcNormalizeAddress("  bc1qexample  ")).toBe("bc1qexample");
  });
});

describe("resolveBtcOwnerAt — time-travel (RC3)", () => {
  const t1 = new Date("2026-01-01T00:00:00Z"); // USER_A ký sở hữu
  const t2 = new Date("2026-06-01T00:00:00Z"); // USER_A bị đóng active, USER_B ký sở hữu
  const before = new Date("2025-12-01T00:00:00Z"); // trước khi có bằng chứng nào
  const duringA = new Date("2026-03-01T00:00:00Z"); // giữa t1 và t2 → USER_A
  const duringB = new Date("2026-09-01T00:00:00Z"); // sau t2 → USER_B

  const history: BtcOwnershipRow[] = [
    { address: ADDR, user_id: USER_A, verified_at: t1, valid_to: t2 },
    { address: ADDR, user_id: USER_B, verified_at: t2, valid_to: null },
  ];

  it("cùng địa chỉ, 2 mốc thời gian → 2 chủ khác nhau", () => {
    expect(resolveBtcOwnerAt(history, ADDR, duringA)).toBe(USER_A);
    expect(resolveBtcOwnerAt(history, ADDR, duringB)).toBe(USER_B);
    expect(resolveBtcOwnerAt(history, ADDR, duringA)).not.toBe(
      resolveBtcOwnerAt(history, ADDR, duringB),
    );
  });

  it("trước khi có bằng chứng nào → NULL, không suy luận", () => {
    expect(resolveBtcOwnerAt(history, ADDR, before)).toBeNull();
  });

  it("đúng ranh giới: tại verified_at của chủ mới → đã là chủ mới", () => {
    expect(resolveBtcOwnerAt(history, ADDR, t2)).toBe(USER_B);
  });

  it("đúng ranh giới: ngay trước verified_at của chủ mới (1ms) → vẫn là chủ cũ", () => {
    expect(resolveBtcOwnerAt(history, ADDR, new Date(t2.getTime() - 1))).toBe(USER_A);
  });

  it("địa chỉ không có trong lịch sử ⇒ NULL", () => {
    expect(resolveBtcOwnerAt(history, "bc1qneverclaimed", duringB)).toBeNull();
  });

  it("khớp theo địa chỉ chuẩn hoá (case-insensitive cho bech32)", () => {
    expect(resolveBtcOwnerAt(history, ADDR.toUpperCase(), duringB)).toBe(USER_B);
  });
});

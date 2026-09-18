/**
 * btc-ownership-verify — edge function guard (offline source snapshot).
 *
 * Bất biến (RC1 — sở hữu phải xác thực bằng chữ ký, không phải tự khai):
 *  1. Bắt buộc requireUser() — không có luồng ẩn danh.
 *  2. Dùng BIP-322 (bip322-js), KHÔNG dùng verify kiểu Legacy chỉ hỗ trợ P2PKH — hệ thống
 *     có cả địa chỉ SegWit (bc1q) và Taproot (bc1p).
 *  3. Nonce: TTL 5 phút, single-use, đánh dấu used_at TRƯỚC khi verify (chặn replay dù
 *     verify fail hay pass — cùng bài học sso-web3-auth), và phải khớp đúng user_id + address
 *     của chính challenge đã cấp (chặn dùng challenge của người khác).
 *  4. Ghi ownership CHỈ qua claim_btc_ownership với verification_method='signature' — không tự
 *     viết INSERT rời rạc vào btc_address_ownership_history.
 *  5. KHÔNG đụng bảng profiles hay bất kỳ bảng dữ liệu sản xuất nào (Phase 1 = hạ tầng mới,
 *     chưa wiring vào luồng đổi ví thật).
 *  6. Chuẩn hoá địa chỉ khớp mirror TS (bech32 lowercase, legacy giữ nguyên case).
 *  7. Nonce claim là 1 UPDATE ... WHERE used_at IS NULL ... RETURNING nguyên tử — KHÔNG tách
 *     SELECT rồi UPDATE riêng (race condition: 2 request đồng thời cùng nonce đều pass SELECT
 *     trước khi request nào kịp UPDATE).
 *  8. Rate limit dùng RPC bền `check_rate_limit` (đã dùng ở claim-reward, sso-otp-request...),
 *     KHÔNG dùng Map trong bộ nhớ (mất state mỗi lần cold start).
 *  9. Cả 'challenge' VÀ 'verify' đều bị rate limit — verify KHÔNG được bỏ trống dù nonce đã
 *     single-use (verify ghi ownership thật, cần giới hạn độc lập với challenge).
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const EDGE_FN = resolve(process.cwd(), "supabase/functions/btc-ownership-verify/index.ts");

describe("btc-ownership-verify edge function (offline)", () => {
  const src = readFileSync(EDGE_FN, "utf8");

  it("bắt buộc requireUser()", () => {
    expect(src).toContain("const user = await requireUser(req);");
  });

  it("dùng BIP-322 (bip322-js), không dùng verify Legacy-only", () => {
    expect(src).toContain('import { Verifier } from "npm:bip322-js@4.0.0";');
    expect(src).toContain("Verifier.verifySignature(address, challenge.message, signature)");
    // "bitcoinjs-message" chỉ được nhắc trong comment (lý do loại trừ) — cấm nó xuất hiện
    // trong 1 câu lệnh import thật.
    expect(src).not.toMatch(/^\s*import[^\n]*bitcoinjs-message/m);
  });

  it("challenge TTL = 5 phút", () => {
    expect(src).toContain("const CHALLENGE_TTL_MS = 5 * 60 * 1000;");
  });

  it("nonce single-use + chưa hết hạn khi tra cứu", () => {
    expect(src).toContain('.is("used_at", null)');
    expect(src).toContain('.gt("expires_at", new Date().toISOString())');
  });

  it("đánh dấu used_at TRƯỚC khi verify chữ ký (chặn replay bất kể pass/fail)", () => {
    const markUsedIdx = src.indexOf('.update({ used_at: new Date().toISOString() })');
    const verifyIdx = src.indexOf("Verifier.verifySignature(");
    expect(markUsedIdx).toBeGreaterThan(-1);
    expect(verifyIdx).toBeGreaterThan(-1);
    expect(markUsedIdx).toBeLessThan(verifyIdx);
  });

  it("challenge phải khớp đúng user_id và address của caller", () => {
    expect(src).toContain("challenge.user_id !== user.id");
    expect(src).toContain("challenge.address !== address");
  });

  it("ghi ownership qua claim_btc_ownership với verification_method='signature'", () => {
    expect(src).toContain('admin.rpc("claim_btc_ownership"');
    expect(src).toContain('p_verification_method: "signature"');
  });

  it("KHÔNG đụng bảng profiles hoặc donations/wallet_transfers (Phase 1 không sửa dữ liệu sản xuất)", () => {
    expect(src).not.toMatch(/\.from\(["']profiles["']\)/);
    expect(src).not.toMatch(/\.from\(["']donations["']\)/);
    expect(src).not.toMatch(/\.from\(["']wallet_transfers["']\)/);
  });

  it("chuẩn hoá địa chỉ khớp mirror TS (bech32 lowercase, legacy giữ nguyên)", () => {
    expect(src).toContain("/^bc1[a-z0-9]+$/i.test(trimmed) ? trimmed.toLowerCase() : trimmed;");
  });

  it("nonce claim là 1 UPDATE...RETURNING nguyên tử, không tách SELECT riêng trước", () => {
    // Đúng 1 lệnh .update({ used_at: ... }) trên bảng challenges, và nó PHẢI mang theo
    // .is("used_at", null) trong cùng chain (điều kiện nguyên tử, không phải check riêng).
    const updateBlockMatch = src.match(
      /\.from\("btc_ownership_challenges"\)\s*\.update\(\{ used_at: new Date\(\)\.toISOString\(\) \}\)([\s\S]*?)\.select\("\*"\);/,
    );
    expect(updateBlockMatch).not.toBeNull();
    expect(updateBlockMatch![1]).toContain('.eq("nonce", nonce)');
    expect(updateBlockMatch![1]).toContain('.is("used_at", null)');
    expect(updateBlockMatch![1]).toContain('.gt("expires_at", new Date().toISOString())');

    // Không còn .select("*")... .maybeSingle() ĐỨNG RIÊNG trước bước update (dấu hiệu của
    // pattern SELECT-rồi-UPDATE cũ có race condition).
    expect(src).not.toMatch(/\.select\("\*"\)\s*\.eq\("nonce", nonce\)[\s\S]*?\.maybeSingle\(\)/);
  });

  it("rate limit dùng RPC bền check_rate_limit, không dùng Map trong bộ nhớ", () => {
    expect(src).toContain('admin.rpc("check_rate_limit"');
    expect(src).toContain("p_key: key");
    expect(src).not.toContain("new Map<string,");
    expect(src).not.toContain("rateLimitMap");
  });

  it("challenge và verify rate-limit RIÊNG biệt (key khác nhau, verify không bị bỏ trống)", () => {
    expect(src).toContain(
      "checkRateLimit(admin, `btc_ownership_challenge:${user.id}`, CHALLENGE_RATE_LIMIT)",
    );
    expect(src).toContain(
      "checkRateLimit(admin, `btc_ownership_verify:${user.id}`, VERIFY_RATE_LIMIT)",
    );
  });

  it("verify rate-limit chạy TRƯỚC khi chạm DB (nonce claim, verify chữ ký)", () => {
    const verifyRateLimitIdx = src.indexOf("btc_ownership_verify:${user.id}");
    const nonceClaimIdx = src.indexOf('.from("btc_ownership_challenges")\n        .update(');
    expect(verifyRateLimitIdx).toBeGreaterThan(-1);
    expect(nonceClaimIdx).toBeGreaterThan(-1);
    expect(verifyRateLimitIdx).toBeLessThan(nonceClaimIdx);
  });
});

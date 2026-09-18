/**
 * BTC_WALLET_AUDIT_WRITE_LOCK (P0, pre-Phase-1)
 *
 * btc-wallet-audit tự học địa chỉ (hd_change_auto/hd_cluster) và backfill
 * donations/wallet_transfers/posts ngay trong 1 request, không lọc qua
 * profile_btc_aux_addresses.verified — cùng bản chất suy luận vòng tròn với
 * hd_input_back (RC8/RC-10). Khoá độc lập bằng app_settings
 * `btc_wallet_audit_write_enabled` (default false), theo đúng mẫu
 * `btc_manual_confirm_enabled`.
 *
 * Bất biến:
 *  1. Migration seed flag = 'false' và có COALESCE(...,false) — không cho default true.
 *  2. RPC REVOKE ALL FROM PUBLIC trước khi GRANT lại (bài học A1: REVOKE thiếu PUBLIC = vô hiệu).
 *  3. Edge function đọc flag qua RPC (không tự suy ra true) và cả 2 điểm ghi
 *     (persist aux rows + backfill donations/transfers/posts) đều gate bằng WRITE_ENABLED.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const MIGRATION = resolve(
  process.cwd(),
  "supabase/migrations/20260823123949_3feff786-67ed-421e-ba72-596d70be6a55.sql",
);
const EDGE_FN = resolve(process.cwd(), "supabase/functions/btc-wallet-audit/index.ts");

describe("btc-wallet-audit write lock — migration (offline)", () => {
  const sql = readFileSync(MIGRATION, "utf8");

  it("seed app_settings mặc định false", () => {
    expect(sql).toContain("VALUES ('btc_wallet_audit_write_enabled', 'false')");
    expect(sql).toContain("ON CONFLICT (key) DO UPDATE SET value = 'false'");
  });

  it("RPC default false qua COALESCE", () => {
    expect(sql).toMatch(/COALESCE\(\s*\(SELECT lower\(value\) = 'true'[^)]*\),\s*false\s*\)/);
  });

  it("REVOKE ALL FROM PUBLIC trước khi GRANT", () => {
    expect(sql).toContain(
      "REVOKE ALL ON FUNCTION public.btc_wallet_audit_write_enabled() FROM PUBLIC",
    );
    expect(sql).toContain(
      "GRANT EXECUTE ON FUNCTION public.btc_wallet_audit_write_enabled() TO authenticated, anon, service_role",
    );
  });
});

describe("btc-wallet-audit write lock — edge function (offline)", () => {
  const src = readFileSync(EDGE_FN, "utf8");

  it("đọc cờ qua RPC, không tự suy true", () => {
    expect(src).toContain('admin.rpc("btc_wallet_audit_write_enabled")');
    expect(src).toContain("const WRITE_ENABLED = writeEnabledRpc === true;");
  });

  it("persist aux rows bị gate bằng WRITE_ENABLED", () => {
    expect(src).toMatch(/if \(WRITE_ENABLED && newlyLearned\.length > 0\)/);
  });

  it("backfill donations/transfers/posts bị gate bằng WRITE_ENABLED", () => {
    expect(src).toMatch(/if \(WRITE_ENABLED && sendTxIds\.length > 0\)/);
    // Không còn nhánh ghi nào chạy vô điều kiện khi sendTxIds.length > 0
    expect(src).not.toMatch(/^\s*if \(sendTxIds\.length > 0\) \{/m);
  });

  it("response báo trạng thái khoá cho caller quan sát được", () => {
    expect(src).toContain("writes_locked: !WRITE_ENABLED");
  });

  it("hd_input_back vẫn giữ gate cũ (defense-in-depth, không bị gỡ)", () => {
    expect(src).toContain('source === "hd_input_back" && !HD_INPUT_BACK_ENABLED');
  });
});

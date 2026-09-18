/**
 * Guard A2(c) — log_security_action + viewer count RPC
 *
 * Bất biến:
 *  1. Chủ thể log xác định bằng auth.uid(); p_user_id khác mình chỉ được khi has_role(admin).
 *  2. details luôn ghi actor_id thật (chống giả mạo audit trail).
 *  3. Whitelist action giữ nguyên + có 'password_changed' (FE ChangePasswordDialog dùng).
 *  4. Không có wrapper client nào gọi increment/decrement_live_viewer_count (đã REVOKE).
 *  5. anon không gọi được cả 3 RPC — kiểm ở lớp live, tự SKIP nếu thiếu env.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const SNAPSHOT = resolve(
  process.cwd(),
  "docs/audit/batch-2-identity-security/evidence/rpc_log_security_action.sql",
);
const LIVE_SERVICE = resolve(process.cwd(), "src/modules/live/liveService.ts");

describe("log_security_action guard (offline snapshot)", () => {
  const sql = readFileSync(SNAPSHOT, "utf8");

  it("actor lấy từ auth.uid()", () => {
    expect(sql).toContain("v_actor uuid := auth.uid()");
  });

  it("chặn khi chưa đăng nhập", () => {
    expect(sql).toContain("IF v_actor IS NULL THEN");
    expect(sql).toContain("Authentication required");
  });

  it("user thường không ghi log cho người khác", () => {
    expect(sql).toContain("IF p_user_id <> v_actor AND NOT public.has_role(v_actor, 'admin') THEN");
    expect(sql).toMatch(/Forbidden: cannot log security action for another user/);
  });

  it("audit trail ghi actor thật", () => {
    expect(sql).toContain("jsonb_build_object('actor_id', v_actor)");
  });

  it("whitelist action đầy đủ", () => {
    for (const a of [
      "password_set",
      "password_changed",
      "wallet_link_succeeded",
      "wallet_link_failed",
      "email_link_verified",
    ]) {
      expect(sql).toContain(`'${a}'`);
    }
  });
});

describe("viewer count RPC không còn wrapper client", () => {
  const src = readFileSync(LIVE_SERVICE, "utf8");
  it("liveService không gọi increment/decrement_live_viewer_count", () => {
    expect(src).not.toMatch(/rpc\(\s*['"]increment_live_viewer_count/);
    expect(src).not.toMatch(/rpc\(\s*['"]decrement_live_viewer_count/);
  });
});

describe("live REST (skip nếu thiếu env)", () => {
  const url = process.env.VITE_SUPABASE_URL;
  const key = process.env.VITE_SUPABASE_PUBLISHABLE_KEY;

  const cases: Array<[string, Record<string, unknown>]> = [
    ["log_security_action", { p_user_id: "00000000-0000-0000-0000-000000000000", p_action: "password_set", p_details: null }],
    ["increment_live_viewer_count", { session_id: "00000000-0000-0000-0000-000000000000" }],
    ["decrement_live_viewer_count", { session_id: "00000000-0000-0000-0000-000000000000" }],
  ];

  for (const [fn, body] of cases) {
    it.skipIf(!url || !key)(`anon bị permission denied: ${fn}`, async () => {
      const res = await fetch(`${url}/rest/v1/rpc/${fn}`, {
        method: "POST",
        headers: { apikey: key as string, "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      expect(res.status).toBe(401);
      const json = await res.json();
      expect(json.message).toMatch(/permission denied/i);
    });
  }
});

/**
 * Guard A1 đợt 2 — 2 function đọc chỉ dùng ở dashboard admin.
 *
 * Bất biến:
 *  1. Guard admin dựa trên auth.uid().
 *  2. REVOKE luôn kèm PUBLIC (bài học: thiếu PUBLIC = REVOKE vô hiệu).
 *  3. anon KHÔNG gọi được (live REST, tự SKIP nếu thiếu env).
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const SNAPSHOT = resolve(
  process.cwd(),
  "docs/audit/batch-2-identity-security/evidence/rpc_a1_admin_batch2.sql",
);

const FUNCTIONS = ["get_banned_user_claims", "get_user_mint_stats"] as const;

describe("A1 đợt 2 (offline snapshot)", () => {
  const sql = readFileSync(SNAPSHOT, "utf8");

  it("mọi REVOKE đều có PUBLIC", () => {
    const revokes = sql.match(/REVOKE ALL ON FUNCTION[^;]+;/g) ?? [];
    expect(revokes.length).toBe(FUNCTIONS.length);
    for (const r of revokes) expect(r).toMatch(/FROM PUBLIC, anon/);
  });

  it.each(FUNCTIONS)("%s có REVOKE + GRANT authenticated/service_role", (fn) => {
    expect(sql).toContain(`REVOKE ALL ON FUNCTION public.${fn}(`);
    expect(sql).toMatch(
      new RegExp(`GRANT EXECUTE ON FUNCTION public\\.${fn}\\([^)]*\\) TO authenticated, service_role`),
    );
  });

  it("guard dùng auth.uid()", () => {
    expect(sql).toContain("v_actor uuid := auth.uid()");
    expect(sql).toContain("has_role(v_actor, 'admin')");
  });
});

describe("A1 đợt 2 (live REST, skip nếu thiếu env)", () => {
  const url = process.env.VITE_SUPABASE_URL;
  const key = process.env.VITE_SUPABASE_PUBLISHABLE_KEY;

  it.skipIf(!url || !key).each(FUNCTIONS)("anon bị chặn: %s", async (fn) => {
    const res = await fetch(`${url}/rest/v1/rpc/${fn}`, {
      method: "POST",
      headers: { apikey: key as string, "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });
    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.message).toMatch(/permission denied/i);
  });
});

/**
 * Guard A1 đợt 1 — 5 function admin (ban/unban/batch ban/emails/qualified users)
 *
 * Bất biến:
 *  1. Guard admin dựa trên auth.uid(), KHÔNG tin p_admin_id/admin_id do client truyền.
 *  2. Không REVOKE thiếu PUBLIC (bài học: REVOKE chỉ anon/authenticated là vô hiệu).
 *  3. anon KHÔNG gọi được (live REST, tự SKIP nếu thiếu env).
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const SNAPSHOT = resolve(
  process.cwd(),
  "docs/audit/batch-2-identity-security/evidence/rpc_a1_admin_batch1.sql",
);

const FUNCTIONS = [
  "ban_user_permanently",
  "unban_user",
  "batch_ban_ghost_users",
  "get_user_emails_for_admin",
  "get_qualified_reward_users",
] as const;

describe("A1 admin guard (offline snapshot)", () => {
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

  it("guard dùng auth.uid(), không dùng p_admin_id", () => {
    expect(sql).toContain("v_actor uuid := auth.uid()");
    expect(sql).toContain("has_role(v_actor, 'admin')");
    expect(sql).not.toContain("has_role(p_admin_id");
    expect(sql).not.toContain("has_role(admin_id");
  });

  it("p_admin_id chỉ lưu để đối chiếu", () => {
    expect(sql).toContain("'claimed_admin_id', p_admin_id");
  });
});

describe("A1 admin guard (live REST, skip nếu thiếu env)", () => {
  const url = process.env.VITE_SUPABASE_URL;
  const key = process.env.VITE_SUPABASE_PUBLISHABLE_KEY;
  const ZERO = "00000000-0000-0000-0000-000000000000";
  const BODIES: Record<string, unknown> = {
    ban_user_permanently: { p_admin_id: ZERO, p_user_id: ZERO, p_reason: "x" },
    unban_user: { p_admin_id: ZERO, p_user_id: ZERO, p_reason: "x" },
    batch_ban_ghost_users: { user_ids: [], admin_id: ZERO },
    get_user_emails_for_admin: { p_admin_id: ZERO },
    get_qualified_reward_users: { p_admin_id: ZERO },
  };

  it.skipIf(!url || !key).each(FUNCTIONS)("anon bị chặn: %s", async (fn) => {
    const res = await fetch(`${url}/rest/v1/rpc/${fn}`, {
      method: "POST",
      headers: { apikey: key as string, "Content-Type": "application/json" },
      body: JSON.stringify(BODIES[fn]),
    });
    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.message).toMatch(/permission denied/i);
  });
});

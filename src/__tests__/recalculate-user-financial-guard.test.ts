/**
 * Guard containment Đ9 — recalculate_user_financial
 *
 * Yêu cầu bất biến:
 *  1. Guard admin dựa trên auth.uid() (KHÔNG tin p_admin_id do client truyền).
 *  2. Audit log ghi actor thật (v_actor), không ghi p_admin_id làm admin_id.
 *  3. Không tồn tại overload 2 tham số (bản cũ không có guard).
 *  4. Không được gọi bằng anon (đã REVOKE) — kiểm tra ở lớp live, tự SKIP nếu thiếu env.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const SNAPSHOT = resolve(
  process.cwd(),
  "docs/audit/batch-2-identity-security/evidence/rpc_recalculate_user_financial.sql",
);

describe("recalculate_user_financial guard (offline snapshot)", () => {
  const sql = readFileSync(SNAPSHOT, "utf8");

  it("actor lấy từ auth.uid()", () => {
    expect(sql).toContain("v_actor uuid := auth.uid()");
  });

  it("chặn khi chưa đăng nhập", () => {
    expect(sql).toContain("IF v_actor IS NULL THEN");
    expect(sql).toContain("Authentication required");
  });

  it("chỉ admin (has_role trên actor thật) được chạy", () => {
    expect(sql).toContain("NOT public.has_role(v_actor, 'admin')");
    expect(sql).not.toContain("has_role(p_admin_id");
  });

  it("audit log ghi actor thật, p_admin_id chỉ lưu để đối chiếu", () => {
    expect(sql).toContain("INSERT INTO public.audit_logs");
    expect(sql).toMatch(/VALUES\s*\(\s*v_actor,/);
    expect(sql).toContain("'claimed_admin_id', p_admin_id");
  });

  it("snapshot chỉ có 1 overload 3 tham số", () => {
    const defs = sql.match(/CREATE OR REPLACE FUNCTION public\.recalculate_user_financial/g) ?? [];
    expect(defs.length).toBe(1);
    expect(sql).toContain("(p_user_id uuid, p_client_id text DEFAULT NULL::text, p_admin_id uuid DEFAULT NULL::uuid)");
  });
});

describe("recalculate_user_financial guard (live REST, skip nếu thiếu env)", () => {
  const url = process.env.VITE_SUPABASE_URL;
  const key = process.env.VITE_SUPABASE_PUBLISHABLE_KEY;

  it.skipIf(!url || !key)("anon (publishable key) bị permission denied", async () => {
    const res = await fetch(`${url}/rest/v1/rpc/recalculate_user_financial`, {
      method: "POST",
      headers: { apikey: key as string, "Content-Type": "application/json" },
      body: JSON.stringify({
        p_user_id: "00000000-0000-0000-0000-000000000000",
        p_client_id: null,
        p_admin_id: "00000000-0000-0000-0000-000000000000",
      }),
    });
    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.message).toMatch(/permission denied/i);
  });
});

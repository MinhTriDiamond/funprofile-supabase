/**
 * Guard Việc 1 — run_financial_reconciliation.
 *
 * Bất biến:
 *  1. Guard admin dựa trên auth.uid(), KHÔNG tin p_admin_id do client truyền.
 *  2. Mặc định p_dry_run = true ⇒ không UPDATE dữ liệu tài chính.
 *  3. REVOKE luôn kèm PUBLIC (bài học: thiếu PUBLIC = REVOKE vô hiệu).
 *  4. Call site FE phải truyền p_dry_run: false tường minh khi muốn ghi.
 *  5. anon KHÔNG gọi được (live REST, tự SKIP nếu thiếu env).
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const SNAPSHOT = resolve(
  process.cwd(),
  "docs/audit/batch-2-identity-security/evidence/rpc_run_financial_reconciliation.sql",
);
const FINANCIAL_TAB = resolve(process.cwd(), "src/components/admin/FinancialTab.tsx");
const EDGE = resolve(process.cwd(), "supabase/functions/scheduled-reconciliation/index.ts");

describe("run_financial_reconciliation (offline snapshot)", () => {
  const sql = readFileSync(SNAPSHOT, "utf8");

  it("guard dùng auth.uid() + has_role", () => {
    expect(sql).toContain("v_actor uuid := auth.uid()");
    expect(sql).toContain("has_role(v_actor, 'admin')");
    expect(sql).toContain("Authentication required");
  });

  it("p_dry_run mặc định true", () => {
    expect(sql).toMatch(/p_dry_run boolean DEFAULT true/);
  });

  it("có rate-limit 5 phút cho lần ghi", () => {
    expect(sql).toContain("interval '5 minutes'");
  });

  it("REVOKE có PUBLIC + GRANT authenticated/service_role", () => {
    expect(sql).toContain(
      "REVOKE ALL ON FUNCTION public.run_financial_reconciliation(uuid, boolean) FROM PUBLIC;",
    );
    expect(sql).toContain(
      "GRANT EXECUTE ON FUNCTION public.run_financial_reconciliation(uuid, boolean) TO authenticated, service_role;",
    );
  });

  it("overload cũ (uuid) đã bị DROP", () => {
    expect(sql).toContain("DROP FUNCTION IF EXISTS public.run_financial_reconciliation(uuid);");
  });
});

describe("call site", () => {
  it("FinancialTab truyền p_dry_run: false tường minh", () => {
    const src = readFileSync(FINANCIAL_TAB, "utf8");
    const idx = src.indexOf("run_financial_reconciliation");
    expect(idx).toBeGreaterThan(-1);
    expect(src.slice(idx, idx + 200)).toContain("p_dry_run: false");
  });

  it("edge scheduled-reconciliation truyền p_dry_run: false tường minh", () => {
    const src = readFileSync(EDGE, "utf8");
    expect(src).toContain("p_dry_run: false");
  });
});

const url = process.env.VITE_SUPABASE_URL;
const key = process.env.VITE_SUPABASE_PUBLISHABLE_KEY;

describe.runIf(!!url && !!key)("live: anon bị chặn", () => {
  it("trả 401/403 permission denied", async () => {
    const res = await fetch(`${url}/rest/v1/rpc/run_financial_reconciliation`, {
      method: "POST",
      headers: { apikey: key!, "Content-Type": "application/json" },
      body: JSON.stringify({ p_admin_id: null, p_dry_run: true }),
    });
    expect([401, 403]).toContain(res.status);
    const body = await res.json();
    expect(String(body.message ?? "")).toMatch(/permission denied/i);
  }, 20_000);
});

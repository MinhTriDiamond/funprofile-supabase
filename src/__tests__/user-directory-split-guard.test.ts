/**
 * Guard Việc 2 — tách danh bạ thành viên thành 2 RPC.
 *
 * Bất biến:
 *  1. Bản công khai KHÔNG chứa email / pending_reward / approved_reward /
 *     reward_status / camly_today.
 *  2. usdt_received chỉ lấy từ donations ⇒ được phép công khai.
 *  3. Cả 2 RPC đều REVOKE PUBLIC + anon.
 *  4. anon gọi thật đều bị chặn (live REST, tự SKIP nếu thiếu env).
 *  5. FE chọn RPC theo quyền admin.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const SNAPSHOT = resolve(
  process.cwd(),
  "docs/audit/batch-2-identity-security/evidence/rpc_user_directory_split.sql",
);
const HOOK = resolve(process.cwd(), "src/hooks/useUserDirectory.ts");

const FUNCTIONS = [
  "get_user_directory_summary",
  "get_user_directory_admin",
] as const;

const ADMIN_ONLY_FIELDS = [
  "email",
  "pending_reward",
  "approved_reward",
  "reward_status",
  "camly_today",
] as const;

describe("Việc 2 — snapshot offline", () => {
  const sql = readFileSync(SNAPSHOT, "utf8");

  it.each(FUNCTIONS)("%s có REVOKE PUBLIC + anon", (fn) => {
    expect(sql).toContain(`REVOKE ALL ON FUNCTION public.${fn}() FROM PUBLIC;`);
    expect(sql).toContain(`REVOKE ALL ON FUNCTION public.${fn}() FROM anon;`);
    expect(sql).toContain(
      `GRANT EXECUTE ON FUNCTION public.${fn}() TO authenticated;`,
    );
  });

  it("bản công khai chỉ 23 cột và không chứa field admin-only", () => {
    const publicCols = (sql.match(/-- RETURNS TABLE\(([\s\S]*?)\)\n/) ?? [])[1] ?? "";
    const cols = publicCols
      .split(",")
      .map((c) => c.replace(/--/g, "").trim())
      .filter(Boolean);
    expect(cols.length).toBe(23);
    for (const f of ADMIN_ONLY_FIELDS) expect(cols).not.toContain(f);
    expect(cols).toContain("usdt_received");
  });

  it("ghi rõ nguồn usdt_received chỉ từ donations", () => {
    expect(sql).toMatch(/CHỈ SUM từ public\.donations/);
  });

  it("guard đúng: công khai cần đăng nhập, admin cần has_role", () => {
    expect(sql).toContain("permission denied: authentication required");
    expect(sql).toContain("has_role(auth.uid(), 'admin')");
  });
});

describe("Việc 2 — FE chọn RPC theo quyền", () => {
  const hook = readFileSync(HOOK, "utf8");

  it("hook dùng cả 2 RPC và chọn theo isAdmin", () => {
    expect(hook).toContain("get_user_directory_admin");
    expect(hook).toContain("get_user_directory_summary");
    expect(hook).toMatch(/isAdmin \?\s*'get_user_directory_admin'/);
  });

  it("queryKey phân biệt admin/public để không cache lẫn", () => {
    expect(hook).toMatch(/queryKey: \['user-directory', isAdmin \? 'admin' : 'public'\]/);
  });
});

describe("Việc 2 — live REST (skip nếu thiếu env)", () => {
  const url = process.env.VITE_SUPABASE_URL;
  const key = process.env.VITE_SUPABASE_PUBLISHABLE_KEY;

  it.runIf(!!url && !!key).each(FUNCTIONS)(
    "anon gọi %s bị chặn",
    async (fn) => {
      const res = await fetch(`${url}/rest/v1/rpc/${fn}`, {
        method: "POST",
        headers: { apikey: key!, "Content-Type": "application/json" },
        body: "{}",
      });
      expect(res.status).toBeGreaterThanOrEqual(400);
      const body = await res.json();
      expect(String(body.message ?? "")).toMatch(/permission denied/i);
    },
  );
});

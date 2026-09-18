/**
 * B3-01 guard — cột hệ thống của `posts` chỉ hệ thống/admin được đổi.
 *
 * Lớp 1 (offline): snapshot định nghĩa trigger function + policy UPDATE đã commit.
 * Lớp 2 (live, tự SKIP nếu không có PGHOST): đọc thẳng từ DB.
 *
 * Nếu ai xoá WITH CHECK, xoá trigger, hoặc cấp lại quyền UPDATE cho anon → fail.
 */
import { describe, it, expect } from "vitest";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const EV = (f: string) =>
  resolve(process.cwd(), `docs/audit/batch-3-pplp-lightscore/evidence/${f}`);

const FROZEN_COLUMNS = [
  "is_reward_eligible",
  "moderation_status",
  "content_hash",
  "pplp_pillar",
  "user_id",
] as const;

const hasPg = Boolean(process.env.PGHOST);
const psql = (sql: string) =>
  execFileSync("psql", ["-At", "-c", sql], { encoding: "utf8" });

describe("B3-01 offline snapshot", () => {
  const fnSql = readFileSync(EV("fn_posts_freeze_system_columns.sql"), "utf8");

  it("trigger function chỉ enforce với role request anon/authenticated", () => {
    expect(fnSql).toContain("current_setting('role', true)");
    expect(fnSql).toMatch(/NOT IN \('anon', 'authenticated'\)/);
  });

  it("trigger function có bypass admin qua has_role, không tin client", () => {
    expect(fnSql).toContain("auth.uid()");
    expect(fnSql).toContain("has_role(v_uid, 'admin'::app_role)");
  });

  for (const col of FROZEN_COLUMNS) {
    it(`cột ${col} bị ghim về OLD`, () => {
      expect(fnSql.replace(/\s+/g, " ")).toContain(`NEW.${col} := OLD.${col}`);
    });
  }

  it("policy UPDATE của user có cả USING và WITH CHECK auth.uid() = user_id", () => {
    const pol = readFileSync(EV("policy_posts_update.sql"), "utf8");
    const own = pol.split("POLICY ").find((p) => p.includes("Users can update their own posts"))!;
    expect(own).toContain("USING: (auth.uid() = user_id)");
    expect(own).toContain("WITH CHECK: (auth.uid() = user_id)");
    expect(own).not.toContain("WITH CHECK: NULL");
  });

  it("anon không còn quyền ghi trên posts", () => {
    const acl = readFileSync(EV("relacl_posts.txt"), "utf8");
    const anon = acl.split("\n").find((l) => l.startsWith("anon="))!;
    expect(anon).toBeTruthy();
    const privs = anon.split("=")[1].split("/")[0];
    expect(privs).not.toMatch(/[awdD]/); // insert/update/delete/truncate
    expect(privs).toContain("r"); // vẫn đọc được
  });
});

describe.skipIf(!hasPg)("B3-01 live DB", () => {
  it("trigger trg_posts_freeze_system_columns còn gắn BEFORE UPDATE trên posts", () => {
    const out = psql(
      "select tgname from pg_trigger where tgrelid='public.posts'::regclass and not tgisinternal",
    );
    expect(out).toContain("trg_posts_freeze_system_columns");
  });

  it("policy UPDATE trong DB có with_check", () => {
    const out = psql(
      "select coalesce(with_check,'NULL') from pg_policies where schemaname='public' and tablename='posts' and policyname='Users can update their own posts'",
    ).trim();
    expect(out).toContain("auth.uid() = user_id");
  });

  it("anon không có UPDATE trên posts", () => {
    const out = psql(
      "select has_table_privilege('anon','public.posts','UPDATE')",
    ).trim();
    expect(out).toBe("f");
  });
});

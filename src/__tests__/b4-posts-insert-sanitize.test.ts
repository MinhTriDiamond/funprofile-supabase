/**
 * B4 P1-5 guard — INSERT thẳng vào `posts` không được tự đặt field hệ thống.
 * Lớp 1: snapshot bằng chứng + code create-post ghi bằng service_role.
 * Lớp 2 (live, SKIP nếu không có PGHOST): trigger còn gắn + logic function.
 */
import { describe, it, expect } from "vitest";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const EV = resolve(
  process.cwd(),
  "docs/audit/batch-4-feed-social/evidence/p1-5-posts-insert-sanitize.txt",
);
const hasPg = Boolean(process.env.PGHOST);
const psql = (sql: string) =>
  execFileSync("psql", ["-At", "-c", sql], { encoding: "utf8" }).trim();

describe("B4 P1-5 offline", () => {
  const ev = readFileSync(EV, "utf8");

  it("INSERT thẳng với is_reward_eligible=true bị ghim về false", () => {
    expect(ev).toContain("is_reward_eligible  = false");
  });

  it("các dấu chấm điểm bị xoá về NULL", () => {
    for (const line of [
      "content_hash        = NULL",
      "pplp_pillar         = NULL",
      "scored_at           = NULL",
      "scored_content_hash = NULL",
    ]) {
      expect(ev).toContain(line);
    }
  });

  it("create-post ghi bài bằng service_role để không bị trigger ép", () => {
    const src = readFileSync(
      resolve(process.cwd(), "supabase/functions/create-post/index.ts"),
      "utf8",
    );
    expect(src).toContain("const postWriter = supabaseAdmin ?? supabase;");
    expect(src).toContain("await postWriter\n      .from(\"posts\")");
  });
});

describe.skipIf(!hasPg)("B4 P1-5 live DB", () => {
  it("trigger BEFORE INSERT còn gắn trên posts", () => {
    const out = psql(
      "select tgname from pg_trigger where tgrelid='public.posts'::regclass and not tgisinternal",
    );
    expect(out).toContain("trg_posts_sanitize_system_columns_on_insert");
  });

  it("function ghim đủ 6 cột hệ thống", () => {
    const def = psql(
      "select pg_get_functiondef('public.posts_sanitize_system_columns_on_insert()'::regprocedure)",
    ).replace(/\s+/g, " ");
    expect(def).toContain("NEW.is_reward_eligible := false");
    expect(def).toContain("NEW.moderation_status := 'approved'");
    expect(def).toContain("NEW.content_hash := NULL");
    expect(def).toContain("NEW.pplp_pillar := NULL");
    expect(def).toContain("NEW.scored_at := NULL");
    expect(def).toContain("NEW.scored_content_hash := NULL");
    expect(def).toContain("NOT IN ('anon', 'authenticated')");
  });
});

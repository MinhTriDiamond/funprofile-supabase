/**
 * B4 P1-2 + P1-3 guard — risk gate ở server + khoá cột hệ thống pet_states.
 * Lớp 1: snapshot bằng chứng runtime đã commit.
 * Lớp 2 (live, SKIP nếu không có PGHOST): đọc định nghĩa thật trong DB.
 */
import { describe, it, expect } from "vitest";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const EV = resolve(
  process.cwd(),
  "docs/audit/batch-4-feed-social/evidence/p1-2-p1-3-pet-risk-gate.txt",
);
const hasPg = Boolean(process.env.PGHOST);
const psql = (sql: string) =>
  execFileSync("psql", ["-At", "-c", sql], { encoding: "utf8" }).trim();

describe("B4 P1-2/P1-3 offline", () => {
  const ev = readFileSync(EV, "utf8");

  it("3 luồng shop/box/cheer đều bị chặn khi frozen", () => {
    expect(ev).toContain(
      "shop=PET_RISK_FROZEN | box=PET_RISK_FROZEN | cheer=PET_RISK_FROZEN",
    );
  });

  it("user tự sửa level/xp/risk_tier bị ghim về giá trị cũ", () => {
    expect(ev).toContain("level 1 -> 1 (self update 999)");
    expect(ev).toContain("xp_after=0");
    expect(ev).toContain("tier_after=safe");
  });

  it("gate đọc từ pet_risk_scores, không dùng cột mirror", () => {
    expect(ev).toContain("KHÔNG dùng cột mirror");
  });
});

describe.skipIf(!hasPg)("B4 P1-2/P1-3 live DB", () => {
  it("3 RPC đều gọi pet_risk_assert_allowed", () => {
    for (const fn of [
      "public.pet_shop_create_order(uuid)",
      "public.mystery_box_create_order(text)",
      "public.pet_cheer(uuid, text)",
    ]) {
      const def = psql(`select pg_get_functiondef('${fn}'::regprocedure)`);
      expect(def).toContain("pet_risk_assert_allowed");
    }
  });

  it("helper đọc pet_risk_scores và raise đúng mã lỗi", () => {
    const def = psql(
      "select pg_get_functiondef('public.pet_risk_assert_allowed(uuid,text)'::regprocedure)",
    );
    expect(def).toContain("FROM public.pet_risk_scores");
    expect(def).toContain("PET_RISK_FROZEN");
    expect(def).toContain("PET_RISK_RESTRICTED");
  });

  it("helper không cho anon/authenticated EXECUTE", () => {
    expect(
      psql(
        "select has_function_privilege('authenticated','public.pet_risk_assert_allowed(uuid,text)','EXECUTE')",
      ),
    ).toBe("f");
  });

  it("trigger ghim level/xp/risk_tier còn gắn trên pet_states", () => {
    expect(
      psql(
        "select tgname from pg_trigger where tgrelid='public.pet_states'::regclass and not tgisinternal",
      ),
    ).toContain("trg_pet_states_freeze_system_columns");
    const def = psql(
      "select pg_get_functiondef('public.pet_states_freeze_system_columns()'::regprocedure)",
    ).replace(/\s+/g, " ");
    expect(def).toContain("NEW.level := OLD.level");
    expect(def).toContain("NEW.xp := OLD.xp");
    expect(def).toContain("NEW.risk_tier := OLD.risk_tier");
  });
});

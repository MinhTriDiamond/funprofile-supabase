/**
 * B4 P0-1 guard — client KHÔNG được tự INSERT đơn Pet Shop / Mystery Box.
 * Lớp 1 (offline): snapshot bằng chứng đã commit.
 * Lớp 2 (live, tự SKIP nếu không có PGHOST).
 */
import { describe, it, expect } from "vitest";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const EV = resolve(
  process.cwd(),
  "docs/audit/batch-4-feed-social/evidence/p0-1-orders-insert-lockdown.txt",
);
const hasPg = Boolean(process.env.PGHOST);
const psql = (sql: string) =>
  execFileSync("psql", ["-At", "-c", sql], { encoding: "utf8" }).trim();

describe("B4 P0-1 offline snapshot", () => {
  const ev = readFileSync(EV, "utf8");

  it("authenticated/anon không còn quyền INSERT vào 2 bảng đơn", () => {
    expect(ev).toContain("authenticated INSERT pet_shop_orders    = false");
    expect(ev).toContain("authenticated INSERT mystery_box_orders = false");
    expect(ev).toContain("anon          INSERT pet_shop_orders    = false");
  });

  it("service_role vẫn ghi được (RPC/edge function)", () => {
    expect(ev).toContain("service_role  INSERT pet_shop_orders    = true");
  });

  it("policy INSERT là WITH CHECK false", () => {
    expect(ev).toContain("orders_no_client_insert    : WITH CHECK false");
    expect(ev).toContain("mb_orders_no_client_insert : WITH CHECK false");
  });

  it("thử INSERT giá thấp bất thường => 0 dòng được ghi", () => {
    expect(ev).toContain("treasury_address='0xdead')    = 0");
    expect(ev).toContain("treasury_address='0xdead') = 0");
  });
});

describe.skipIf(!hasPg)("B4 P0-1 live DB", () => {
  for (const t of ["pet_shop_orders", "mystery_box_orders"]) {
    it(`authenticated không có INSERT trên ${t}`, () => {
      expect(psql(`select has_table_privilege('authenticated','public.${t}','INSERT')`)).toBe("f");
    });
    it(`policy INSERT của ${t} là false`, () => {
      const out = psql(
        `select coalesce(with_check,'NULL') from pg_policies where tablename='${t}' and cmd='INSERT'`,
      );
      expect(out).toBe("false");
    });
  }
});

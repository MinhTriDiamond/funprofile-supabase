/**
 * Guard BXH: 3 RPC bảng xếp hạng PHẢI loại donation nếu **sender HOẶC recipient**
 * có exclude_from_leaderboard = true (ví stub / ví hệ thống).
 *
 * - Lớp 1 (offline): kiểm tra snapshot định nghĩa RPC đã commit trong docs/audit.
 * - Lớp 2 (live, tự SKIP nếu không có PGHOST): đọc pg_get_functiondef trực tiếp từ DB
 *   + chạy mô phỏng filter với 2 profile stub (sender & recipient) để chắc chắn cả
 *   hai hướng đều bị loại.
 *
 * Nếu sau này ai xoá 1 trong 2 điều kiện filter → test fail.
 */
import { describe, it, expect } from "vitest";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const RPCS = [
  "get_benefactor_leaderboard",
  "get_recipient_leaderboard",
  "get_token_leaderboard",
] as const;

const SENDER_FILTER = "NOT COALESCE(ps.exclude_from_leaderboard, false)";
const RECIPIENT_FILTER = "NOT COALESCE(pr.exclude_from_leaderboard, false)";

function evidencePath(fn: string) {
  return resolve(
    process.cwd(),
    `docs/audit/benefactors-2026-07/evidence/rpc_${fn}.sql`,
  );
}

describe("Leaderboard exclude_from_leaderboard guard (offline snapshot)", () => {
  for (const fn of RPCS) {
    it(`${fn}: snapshot có đủ filter sender + recipient`, () => {
      const sql = readFileSync(evidencePath(fn), "utf8");
      expect(sql).toContain("JOIN public.profiles ps ON ps.id = d.sender_id");
      expect(sql).toContain("JOIN public.profiles pr ON pr.id = d.recipient_id");
      expect(sql).toContain(SENDER_FILTER);
      expect(sql).toContain(RECIPIENT_FILTER);
    });
  }
});

const hasDb = !!process.env.PGHOST;

function psql(sql: string) {
  return execFileSync("psql", ["-tAc", sql], { encoding: "utf8" }).trim();
}

describe("Leaderboard exclude_from_leaderboard guard (live DB)", () => {
  for (const fn of RPCS) {
    it.skipIf(!hasDb)(`${fn}: định nghĩa live có đủ 2 điều kiện filter`, () => {
      const def = psql(
        `select pg_get_functiondef(oid) from pg_proc where proname = '${fn}'`,
      );
      expect(def.length).toBeGreaterThan(0);
      expect(def).toContain(SENDER_FILTER);
      expect(def).toContain(RECIPIENT_FILTER);
    });
  }

  it.skipIf(!hasDb)(
    "mô phỏng filter: stub ở vai sender và vai recipient đều bị loại",
    () => {
      // 3 donation giả lập: (1) sender stub, (2) recipient stub, (3) cả 2 hợp lệ.
      const out = psql(`
        with p(id, excluded) as (
          values (1, true), (2, false), (3, false)
        ), d(sender_id, recipient_id) as (
          values (1, 2), (2, 1), (2, 3)
        )
        select count(*) from d
        join p ps on ps.id = d.sender_id
        join p pr on pr.id = d.recipient_id
        where NOT COALESCE(ps.excluded, false)
          AND NOT COALESCE(pr.excluded, false)
      `);
      // Chỉ donation (2 -> 3) được giữ lại.
      expect(Number(out)).toBe(1);
    },
  );
});

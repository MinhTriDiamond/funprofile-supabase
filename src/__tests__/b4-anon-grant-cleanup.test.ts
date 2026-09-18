/**
 * B4 P2 guard — anon KHÔNG còn quyền ghi trực tiếp trên nhóm bảng Batch 4.
 * Lớp 1 (offline): snapshot bằng chứng đã commit.
 * Lớp 2 (live, tự SKIP nếu không có PGHOST).
 */
import { describe, it, expect } from "vitest";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const EV = resolve(
  process.cwd(),
  "docs/audit/batch-4-feed-social/evidence/p2-anon-grant-cleanup.txt",
);
const hasPg = Boolean(process.env.PGHOST);
const psql = (sql: string) =>
  execFileSync("psql", ["-At", "-c", sql], { encoding: "utf8" }).trim();

/** Mẫu đại diện mỗi nhóm: Feed / Chat / Reels / Live / Pet / Mystery Box */
const SAMPLE = [
  "posts",
  "comments",
  "reactions",
  "messages",
  "chat_settings",
  "reels",
  "reel_likes",
  "live_comments",
  "live_sessions",
  "pet_states",
  "pet_cheers",
  "mystery_box_inventory",
];

describe("B4 P2 offline snapshot", () => {
  const ev = readFileSync(EV, "utf8");

  it("bằng chứng nêu rõ chặn ở tầng GRANT (42501)", () => {
    expect(ev).toContain("permission denied for table comments");
    expect(ev).toContain("permission denied for table pet_cheers");
  });

  it("khách vẫn đọc được nội dung công khai", () => {
    expect(ev).toContain("GET  /rest/v1/posts?select=id&limit=1 -> 200");
  });

  it("ghi rõ ngoại lệ có chủ đích video_downloads", () => {
    expect(ev).toContain("video_downloads                  anon=SELECT,INSERT");
    expect(ev).toContain("REVOKE UPDATE, DELETE");
  });
});

describe.skipIf(!hasPg)("B4 P2 live grants", () => {
  it("anon không còn INSERT/UPDATE/DELETE trên các bảng đại diện", () => {
    for (const t of SAMPLE) {
      const out = psql(
        `SELECT has_table_privilege('anon','public.${t}','INSERT')::text || ',' ||
                has_table_privilege('anon','public.${t}','UPDATE')::text || ',' ||
                has_table_privilege('anon','public.${t}','DELETE')::text`,
      );
      expect(out, t).toBe("false,false,false");
    }
  });

  it("ngoại lệ video_downloads: chỉ append, không sửa/xoá", () => {
    const out = psql(
      `SELECT has_table_privilege('anon','public.video_downloads','INSERT')::text || ',' ||
              has_table_privilege('anon','public.video_downloads','UPDATE')::text || ',' ||
              has_table_privilege('anon','public.video_downloads','DELETE')::text`,
    );
    expect(out).toBe("true,false,false");
  });

  it("service_role vẫn ghi được (RPC/edge function)", () => {
    const out = psql(
      `SELECT has_table_privilege('service_role','public.pet_states','INSERT')::text`,
    );
    expect(out).toBe("true");
  });
});

/**
 * BTC Attribution Resolver — Phase 1 schema guard (offline snapshot).
 *
 * supabase/migrations/20260825155557_817499d5-a1d5-40bf-a256-edc514177fb5.sql
 *
 * Bất biến:
 *  1. verification_method chỉ nhận 'signature' | 'admin_manual' — KHÔNG có 'heuristic'
 *     (đây là cách chặn RC8 tái diễn ở tầng schema, không chỉ tầng code).
 *  2. created_by NOT NULL (giải quyết RC5 cho bảng này — không actor NULL).
 *  3. Unique index đảm bảo 1 địa chỉ chỉ có tối đa 1 chủ đang active (valid_to IS NULL).
 *  4. RLS bật, REVOKE ALL FROM PUBLIC trước khi GRANT lại (bài học A1).
 *  5. claim_btc_ownership (điểm ghi duy nhất) chỉ service_role được EXECUTE — client
 *     không bao giờ ghi trực tiếp.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const MIGRATION = resolve(
  process.cwd(),
  "supabase/migrations/20260825155557_817499d5-a1d5-40bf-a256-edc514177fb5.sql",
);

describe("btc_address_ownership_history schema (offline)", () => {
  const sql = readFileSync(MIGRATION, "utf8");

  it("verification_method CHECK chỉ cho 'signature' | 'admin_manual'", () => {
    expect(sql).toContain(
      "verification_method   text NOT NULL CHECK (verification_method IN ('signature', 'admin_manual'))",
    );
    // 'heuristic' được nhắc tới trong comment giải thích (lý do loại trừ) — chỉ cấm nó
    // xuất hiện trong chính danh sách giá trị hợp lệ của CHECK.
    expect(sql).not.toMatch(/verification_method IN \([^)]*heuristic[^)]*\)/);
  });

  it("created_by NOT NULL + FK auth.users", () => {
    expect(sql).toContain("created_by            uuid NOT NULL REFERENCES auth.users(id)");
  });

  it("user_id NOT NULL + FK profiles", () => {
    expect(sql).toContain("user_id               uuid NOT NULL REFERENCES public.profiles(id)");
  });

  it("unique index: 1 địa chỉ tối đa 1 chủ đang active", () => {
    expect(sql).toContain("CREATE UNIQUE INDEX idx_btc_ownership_active_unique");
    expect(sql).toMatch(/idx_btc_ownership_active_unique[\s\S]*?WHERE valid_to IS NULL/);
  });

  it("RLS bật + CHỈ service_role đọc/ghi (CTO điểm 4 — không cấp authenticated)", () => {
    expect(sql).toContain("ALTER TABLE public.btc_address_ownership_history ENABLE ROW LEVEL SECURITY");
    expect(sql).toContain("GRANT ALL ON public.btc_address_ownership_history TO service_role");
    expect(sql).not.toMatch(
      /GRANT[^;]*ON public\.btc_address_ownership_history[^;]*TO\s+(anon|authenticated)/,
    );
  });

  it("resolve_btc_owner: CHỈ service_role EXECUTE (CTO điểm 1)", () => {
    expect(sql).toContain(
      "REVOKE ALL ON FUNCTION public.resolve_btc_owner(text, timestamptz) FROM PUBLIC",
    );
    expect(sql).toContain(
      "GRANT EXECUTE ON FUNCTION public.resolve_btc_owner(text, timestamptz) TO service_role",
    );
    expect(sql).not.toMatch(
      /GRANT EXECUTE ON FUNCTION public\.resolve_btc_owner\([^)]*\) TO[^;]*(anon|authenticated)/,
    );
  });

  it("claim_btc_ownership: chỉ service_role được EXECUTE", () => {
    expect(sql).toContain(
      "REVOKE ALL ON FUNCTION public.claim_btc_ownership(text, uuid, text, text, uuid, text) FROM PUBLIC",
    );
    expect(sql).toMatch(
      /GRANT EXECUTE ON FUNCTION public\.claim_btc_ownership\([^)]*\) TO service_role;/,
    );
    expect(sql).not.toMatch(
      /GRANT EXECUTE ON FUNCTION public\.claim_btc_ownership\([^)]*\) TO authenticated/,
    );
  });

  it("claim_btc_ownership validate verification_method + created_by bên trong hàm (defense-in-depth với CHECK)", () => {
    expect(sql).toContain("IF p_verification_method NOT IN ('signature', 'admin_manual') THEN");
    expect(sql).toContain("IF p_created_by IS NULL THEN");
  });

  it("btc_ownership_challenges: RLS false toàn bộ, chỉ service_role thao tác qua bypass", () => {
    expect(sql).toContain('CREATE POLICY "No public access to btc_ownership_challenges"');
    expect(sql).toContain("ON public.btc_ownership_challenges FOR ALL USING (false)");
    expect(sql).toContain("GRANT ALL ON public.btc_ownership_challenges TO service_role");
  });

  it("btc_normalize_address: bech32 lowercase, legacy giữ nguyên (khớp mirror TS)", () => {
    expect(sql).toContain("WHEN p_address ~* '^bc1[a-z0-9]+$' THEN lower(btrim(p_address))");
  });
});

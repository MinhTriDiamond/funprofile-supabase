/**
 * BTC Attribution Resolver — Phase 2 (shadow mode) schema guard (offline snapshot).
 *
 * supabase/migrations/20260825155557_817499d5-a1d5-40bf-a256-edc514177fb5.sql
 *
 * Bất biến:
 *  1. GRANT/RLS: chỉ service_role đọc/ghi btc_resolver_shadow_log — không cấp anon/authenticated.
 *  2. Idempotency: UNIQUE index trên idempotency_key + ON CONFLICT DO NOTHING trong RPC ghi.
 *  3. Phân loại "nghi do legacy-format" tách biệt khỏi "không khớp thật" — chỉ set true khi
 *     KHÔNG khớp + địa chỉ không phải bech32 + raw address logic cũ khác bản đã normalize.
 *  4. log_btc_resolver_shadow_comparison chỉ service_role được EXECUTE.
 *  5. Trigger đánh dấu + báo ngay (notifications) cho danh sách tài khoản ưu tiên điều tra.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const MIGRATION = resolve(
  process.cwd(),
  "supabase/migrations/20260825155557_817499d5-a1d5-40bf-a256-edc514177fb5.sql",
);

describe("btc_resolver_shadow_log schema (offline)", () => {
  const sql = readFileSync(MIGRATION, "utf8");

  it("chỉ GRANT cho service_role, không có GRANT nào cho anon/authenticated", () => {
    expect(sql).toContain("GRANT ALL ON public.btc_resolver_shadow_log TO service_role");
    expect(sql).not.toMatch(/GRANT[^;]*ON public\.btc_resolver_shadow_log[^;]*TO\s+(anon|authenticated)/);
  });

  it("RLS bật + chỉ 1 policy cho service_role (mặc định deny các role khác)", () => {
    expect(sql).toContain("ALTER TABLE public.btc_resolver_shadow_log ENABLE ROW LEVEL SECURITY");
    expect(sql).toContain('CREATE POLICY "btc_resolver_shadow_log_service_only"');
    expect(sql).toContain("FOR ALL TO service_role USING (true) WITH CHECK (true)");
  });

  it("idempotency: UNIQUE index trên idempotency_key + ON CONFLICT DO NOTHING", () => {
    expect(sql).toContain("CREATE UNIQUE INDEX idx_btc_shadow_log_idempotency");
    expect(sql).toContain("ON public.btc_resolver_shadow_log(idempotency_key)");
    expect(sql).toContain("ON CONFLICT (idempotency_key) DO NOTHING");
  });

  it("phân loại legacy-format: chỉ true khi is_match=false + không phải bech32 + raw khác normalized", () => {
    expect(sql).toContain("NEW.suspected_legacy_format_mismatch :=");
    expect(sql).toContain("NOT NEW.is_match");
    expect(sql).toContain("NEW.address !~* '^bc1'");
    expect(sql).toContain("NEW.raw_address_legacy_side <> NEW.address");
  });

  it("log_btc_resolver_shadow_comparison: chỉ service_role EXECUTE", () => {
    expect(sql).toMatch(
      /REVOKE ALL ON FUNCTION public\.log_btc_resolver_shadow_comparison\([^)]*\) FROM PUBLIC/,
    );
    expect(sql).toMatch(
      /GRANT EXECUTE ON FUNCTION public\.log_btc_resolver_shadow_comparison\([^)]*\) TO service_role;/,
    );
    expect(sql).not.toMatch(
      /GRANT EXECUTE ON FUNCTION public\.log_btc_resolver_shadow_comparison\([^)]*\) TO authenticated/,
    );
  });

  it("resolve_btc_owner được gọi thật bên trong (không tự viết lại logic)", () => {
    expect(sql).toContain("v_resolver_user_id := public.resolve_btc_owner(v_addr, v_event_at);");
    expect(sql).toContain("v_addr text := public.btc_normalize_address(p_address);");
  });

  it("trigger ưu tiên: đánh dấu priority_account_flag + tạo notification cho toàn bộ admin", () => {
    expect(sql).toContain("NEW.priority_account_flag := EXISTS (");
    expect(sql).toContain("p.username = ANY (v_usernames)");
    expect(sql).toContain("'btc_shadow_priority_alert'");
    expect(sql).toContain("FROM public.user_roles ur");
    expect(sql).toContain("WHERE ur.role = 'admin'");
  });

  it("danh sách tài khoản ưu tiên đúng 5 username theo yêu cầu", () => {
    expect(sql).toContain(
      '\'["angelkim","angelutopia","angelthienhanh68","angelgiau","angelqueanh"]\'',
    );
    expect(sql).toContain(
      "ARRAY['angelkim','angelutopia','angelthienhanh68','angelgiau','angelqueanh']",
    );
  });
});

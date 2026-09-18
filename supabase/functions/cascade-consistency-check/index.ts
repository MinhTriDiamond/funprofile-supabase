/**
 * cascade-consistency-check
 * So sánh CASCADE_CONFIG (frontend constants) ↔ epoch_config (DB).
 * Trả {ok, drift[], db, expected}. Khi drift → tạo notification cho admin.
 *
 * Lịch chạy: pg_cron daily 04:00 UTC.
 * Public (verify_jwt=false) — chỉ đọc public config.
 */
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

// Snapshot expected (đồng bộ với src/config/cascade-constants.ts).
// Khi sync script update file frontend, deployment kế tiếp cũng update đây.
const EXPECTED = {
  soft_ceiling: 50_000_000,
  user_pool_pct: 0.7,
  ecosystem_pool_pct: 0.12,
  treasury_pool_pct: 0.1,
  strategic_pool_pct: 0.05,
  resilience_pool_pct: 0.03,
  instant_portion_pct: 0.15,
  locked_portion_pct: 0.85,
  base_vesting_days: 28,
  max_share_per_user: 0.03,
};

const EPS = 1e-6;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    (Deno.env.get('SUPABASE_SECRET_KEY') ?? Deno.env.get('SUPABASE_SERVICE_ROLE_KEY'))!,
  );

  const { data, error } = await supabase
    .from("epoch_config")
    .select(
      "soft_ceiling,user_pool_pct,ecosystem_pool_pct,treasury_pool_pct,strategic_pool_pct,resilience_pool_pct,instant_portion_pct,locked_portion_pct,base_vesting_days,max_share_per_user",
    )
    .eq("is_active", true)
    .maybeSingle();

  if (error || !data) {
    return new Response(
      JSON.stringify({ ok: false, error: error?.message ?? "no active config" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }

  const drift: Array<{ key: string; db: number; expected: number; diff: number }> = [];
  for (const [k, expected] of Object.entries(EXPECTED)) {
    const dbVal = Number((data as any)[k]);
    const diff = Math.abs(dbVal - expected);
    const tolerance = k === "soft_ceiling" ? 0 : EPS;
    if (diff > tolerance) drift.push({ key: k, db: dbVal, expected, diff });
  }

  // Invariant: tổng pools phải = 1
  const poolSum =
    Number(data.user_pool_pct) +
    Number(data.ecosystem_pool_pct) +
    Number(data.treasury_pool_pct) +
    Number(data.strategic_pool_pct) +
    Number(data.resilience_pool_pct);
  if (Math.abs(poolSum - 1) > EPS) {
    drift.push({ key: "POOLS_SUM", db: poolSum, expected: 1, diff: Math.abs(poolSum - 1) });
  }

  // Invariant: instant + locked = 1
  const vestSum = Number(data.instant_portion_pct) + Number(data.locked_portion_pct);
  if (Math.abs(vestSum - 1) > EPS) {
    drift.push({ key: "VESTING_SUM", db: vestSum, expected: 1, diff: Math.abs(vestSum - 1) });
  }

  if (drift.length > 0) {
    // Notify admins
    const { data: admins } = await supabase
      .from("user_roles")
      .select("user_id")
      .eq("role", "admin");

    if (admins?.length) {
      await supabase.from("notifications").insert(
        admins.map((a) => ({
          user_id: a.user_id,
          type: "docs_drift",
          title: "⚠️ Lệch cấu hình Cascade (docs ↔ DB)",
          message: `Phát hiện ${drift.length} key lệch: ${drift.map((d) => d.key).join(", ")}. Kiểm tra /docs/cascade-formula.`,
          metadata: { drift, checked_at: new Date().toISOString() },
        })),
      );
    }
  }

  return new Response(
    JSON.stringify({
      ok: drift.length === 0,
      drift,
      db: data,
      expected: EXPECTED,
      checked_at: new Date().toISOString(),
    }),
    { headers: { ...corsHeaders, "Content-Type": "application/json" } },
  );
});

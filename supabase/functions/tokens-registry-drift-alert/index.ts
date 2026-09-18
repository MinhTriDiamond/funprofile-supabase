// Cron 1h: phát hiện spike unknown_contract / symbol_collision trong cửa sổ 60'.
// Nếu vượt ngưỡng → ghi `registry_drift_alerts` + tạo notification cho mọi admin.
import { corsHeaders, handleCors } from "../_shared/cors.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const THRESHOLDS: Record<string, number> = {
  unknown_contract: 200,
  symbol_collision: 50,
  decimals_mismatch: 50,
  native_not_in_registry: 20,
};

Deno.serve(async (req) => {
  const cors = handleCors(req);
  if (cors) return cors;

  const sb = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, { auth: { persistSession: false } });

  const windowEnd = new Date();
  const windowStart = new Date(windowEnd.getTime() - 60 * 60 * 1000);

  const created: any[] = [];

  for (const [reason, threshold] of Object.entries(THRESHOLDS)) {
    const { data, error } = await sb
      .from("suspicious_wallet_events")
      .select("raw_token_address, raw_symbol")
      .eq("reason", reason)
      .gte("last_seen_at", windowStart.toISOString());
    if (error) {
      console.warn("query err", reason, error.message);
      continue;
    }
    const count = data?.length || 0;
    if (count < threshold) continue;

    // Aggregate top contracts
    const agg = new Map<string, { addr: string | null; symbol: string | null; count: number }>();
    for (const r of data || []) {
      const key = `${(r.raw_token_address || "(native)").toLowerCase()}:${r.raw_symbol || ""}`;
      const prev = agg.get(key) || { addr: r.raw_token_address, symbol: r.raw_symbol, count: 0 };
      prev.count += 1;
      agg.set(key, prev);
    }
    const top = [...agg.values()].sort((a, b) => b.count - a.count).slice(0, 10);

    const { data: ins, error: insErr } = await sb
      .from("registry_drift_alerts")
      .insert({
        window_start: windowStart.toISOString(),
        window_end: windowEnd.toISOString(),
        reason: `${reason}_spike`,
        event_count: count,
        threshold,
        sample_contracts: top,
      })
      .select()
      .single();
    if (insErr) {
      console.warn("alert insert err", insErr.message);
      continue;
    }
    created.push(ins);

    // Notify all admins
    const { data: admins } = await sb
      .from("user_roles")
      .select("user_id")
      .eq("role", "admin");
    if (admins && admins.length > 0) {
      const rows = admins.map((a: any) => ({
        user_id: a.user_id,
        type: "registry_drift_alert",
        title: `Cảnh báo Registry: ${reason}`,
        message: `Phát hiện ${count} event "${reason}" trong 1 giờ (ngưỡng ${threshold}). Cha vào /admin/transactions-trust kiểm tra.`,
        metadata: { alert_id: ins.id, reason, count, threshold },
      }));
      await sb.from("notifications").insert(rows);
    }
  }

  return new Response(JSON.stringify({ ok: true, alerts: created.length, created }), {
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
});

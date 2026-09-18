// Aggregation report cho registry_validate_log.
// Được gọi bởi pg_cron ở mốc T+24h và T+48h.
// Sau khi chạy xong, tự unschedule cron entry (one-shot).
//
// Body: { window_hours: 24 | 48, self_unschedule?: string }
// - Nếu không có body → chạy 24h mặc định, không unschedule (mode manual/preview).

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface LogRow {
  id: string;
  created_at: string;
  reason: string;
  chain_id: number | null;
  token_symbol: string | null;
  token_address: string | null;
  tx_hash: string | null;
  sender_wallet: string | null;
  recipient_wallet: string | null;
  amount: number | null;
  extra: unknown;
}

serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    (Deno.env.get("SUPABASE_SECRET_KEY") ?? Deno.env.get("SUPABASE_SERVICE_ROLE_KEY"))!,
  );

  let windowHours = 24;
  let selfUnschedule: string | null = null;
  let manual = true;
  try {
    if (req.method === "POST") {
      const body = await req.json().catch(() => ({}));
      if (body && typeof body === "object") {
        if (typeof body.window_hours === "number") windowHours = body.window_hours;
        if (typeof body.self_unschedule === "string") {
          selfUnschedule = body.self_unschedule;
          manual = false;
        }
      }
    }
  } catch (_) { /* ignore */ }

  const sinceIso = new Date(Date.now() - windowHours * 3600 * 1000).toISOString();

  // 1. Mẫu số: tổng donation trong khung
  const { count: totalDonations, error: donErr } = await supabase
    .from("donations")
    .select("id", { count: "exact", head: true })
    .gte("created_at", sinceIso);

  // 2. Load toàn bộ log miss trong khung
  const { data: logs, error: logErr } = await supabase
    .from("registry_validate_log")
    .select("*")
    .gte("created_at", sinceIso)
    .order("created_at", { ascending: false })
    .limit(10000);

  if (logErr) {
    return new Response(JSON.stringify({ error: "load_logs_failed", details: logErr.message }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const rows = (logs ?? []) as LogRow[];

  // 3. Group theo reason (bucketize)
  const byReason: Record<string, LogRow[]> = {};
  for (const r of rows) {
    // Chuẩn hoá reason bucket: registry_query_error:xxx, blocked_or_suspicious:yyy → giữ prefix
    const bucket = r.reason.startsWith("registry_query_error")
      ? "registry_query_error"
      : r.reason.startsWith("blocked_or_suspicious")
        ? "blocked_or_suspicious"
        : r.reason;
    (byReason[bucket] ||= []).push(r);
  }

  // 4. no_registry_match → distinct combo (chain_id, symbol, address)
  const noMatchRows = byReason["no_registry_match"] ?? [];
  const comboMap = new Map<string, { chain_id: number | null; token_symbol: string | null; token_address: string | null; count: number; sample: LogRow[] }>();
  for (const r of noMatchRows) {
    const key = `${r.chain_id}|${(r.token_symbol ?? "").toUpperCase()}|${r.token_address ?? "native"}`;
    let entry = comboMap.get(key);
    if (!entry) {
      entry = { chain_id: r.chain_id, token_symbol: r.token_symbol, token_address: r.token_address, count: 0, sample: [] };
      comboMap.set(key, entry);
    }
    entry.count++;
    if (entry.sample.length < 3) entry.sample.push(r);
  }
  const noMatchCombos = Array.from(comboMap.values()).sort((a, b) => b.count - a.count);

  // 5. Sample raw 3-5 dòng mỗi bucket
  const rawSamples: Record<string, LogRow[]> = {};
  for (const [bucket, list] of Object.entries(byReason)) {
    rawSamples[bucket] = list.slice(0, 5);
  }

  // 6. Cảnh báo registry_query_error
  const queryErrorCount = (byReason["registry_query_error"] ?? []).length;

  const report = {
    generated_at: new Date().toISOString(),
    window_hours: windowHours,
    since: sinceIso,
    denominator: {
      total_donations: donErr ? null : (totalDonations ?? 0),
      total_donations_error: donErr?.message ?? null,
    },
    summary: {
      total_misses: rows.length,
      miss_rate_pct: totalDonations && totalDonations > 0
        ? Number(((rows.length / totalDonations) * 100).toFixed(3))
        : null,
      by_reason_count: Object.fromEntries(
        Object.entries(byReason).map(([k, v]) => [k, v.length]),
      ),
    },
    critical_alert: queryErrorCount > 0
      ? {
        message: `⚠️ CRITICAL: registry_query_error xuất hiện ${queryErrorCount} lần — fail-open đã kích hoạt thật, điều tra ngay.`,
        count: queryErrorCount,
      }
      : null,
    no_registry_match_combos: noMatchCombos.map((c) => ({
      chain_id: c.chain_id,
      token_symbol: c.token_symbol,
      token_address: c.token_address,
      count: c.count,
      sample_tx_hashes: c.sample.map((s) => s.tx_hash).filter(Boolean),
    })),
    raw_samples: rawSamples,
  };

  // 7. Gửi notification cho tất cả admin
  const { data: admins } = await supabase
    .from("user_roles")
    .select("user_id")
    .eq("role", "admin");

  const title = `Registry Validate Report — T+${windowHours}h`;
  const bodyMsg = `Miss: ${rows.length} / Donation: ${report.denominator.total_donations ?? "n/a"} (${report.summary.miss_rate_pct ?? "n/a"}%). ` +
    (queryErrorCount > 0 ? `⚠️ registry_query_error x${queryErrorCount}. ` : "") +
    `Distinct token lạ: ${noMatchCombos.length}.`;

  if (admins && admins.length > 0) {
    const notifs = admins.map((a) => ({
      user_id: a.user_id,
      type: "registry_validate_report",
      title,
      message: bodyMsg,
      data: report,
      is_read: false,
    }));
    const { error: notifErr } = await supabase.from("notifications").insert(notifs);
    if (notifErr) console.error("[registry-validate-report] notify insert error:", notifErr.message);
  }

  // 8. Self-unschedule cron entry (one-shot)
  let unscheduled = false;
  if (selfUnschedule) {
    try {
      const { error: unschedErr } = await supabase.rpc("cron_unschedule_by_name", { job_name: selfUnschedule });
      if (unschedErr) {
        // Fallback: chạy trực tiếp SQL nếu RPC không tồn tại
        console.warn("[registry-validate-report] cron_unschedule_by_name RPC missing, trying raw SQL:", unschedErr.message);
      } else {
        unscheduled = true;
      }
    } catch (e) {
      console.error("[registry-validate-report] unschedule threw:", e);
    }
  }

  return new Response(JSON.stringify({ ok: true, unscheduled, manual, report }, null, 2), {
    status: 200,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
});

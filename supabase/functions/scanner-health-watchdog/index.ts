/**
 * MỤC 1 (lệnh 15/09/2026) — Watchdog nguồn quét on-chain.
 *
 * Chống lặp lại sự cố "Moralis chết 12 ngày không ai biết".
 * Cron mỗi 15 phút. Cảnh báo admin khi bất kỳ nguồn quét nào lỗi/đứng > 1 giờ:
 *   1. `scanner-rpc-tick` không có tick ok=true nào trong 1 giờ
 *   2. watermark không nhích (updated_at cũ > 1 giờ, hoặc tụt head > 3.000 block quá 1 giờ)
 *   3. Moralis: không có call thành công nào trong 1 giờ dù vẫn đang được gọi
 *   4. `scanner_block_gaps` chưa resolve > 500
 *
 * Read-only với dữ liệu tài chính. Chỉ ghi `notifications` (dedupe 3 giờ) + trả JSON.
 */
import { corsHeaders, createAdminClient, json } from "../_shared/httpAuth.ts";
import {
  buildScannerHealthAlertRows,
  SCANNER_HEALTH_DEDUPE_MS,
  SCANNER_HEALTH_SOURCE,
  type ScannerHealthProblem,
} from "../_shared/scannerAlert.ts";

const STALL_LIMIT_MIN = 60;
const WATERMARK_LAG_BLOCKS = 3000;
const GAP_UNRESOLVED_LIMIT = 500;
const SYSTEM_ACTOR = "a97cbb6c-2d00-40e9-a35a-f181273b17bb"; // FUN.RICH

const minutesSince = (iso: string | null): number =>
  iso ? Math.round((Date.now() - new Date(iso).getTime()) / 60000) : 10_000;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const admin = createAdminClient();
  const problems: ScannerHealthProblem[] = [];
  const checks: Record<string, unknown> = {};

  // 1. tick ok gần nhất
  const { data: lastOk } = await admin
    .from("scanner_tick_log")
    .select("created_at")
    .eq("ok", true)
    .order("created_at", { ascending: false })
    .limit(1);
  const tickMin = minutesSince(lastOk?.[0]?.created_at ?? null);
  checks.last_ok_tick_minutes = tickMin;
  if (tickMin > STALL_LIMIT_MIN) {
    problems.push({
      kind: "rpc_tick",
      source: "scanner-rpc-tick",
      stalled_minutes: tickMin,
      detail: `Không có tick thành công nào trong ${tickMin} phút.`,
    });
  }

  // 2. watermark từng nguồn
  const { data: marks } = await admin
    .from("scanner_watermarks")
    .select("source, token_address, last_block, head_block, updated_at");
  const wmReport: unknown[] = [];
  for (const m of marks ?? []) {
    const mins = minutesSince(m.updated_at as string);
    const lag = Number(m.head_block ?? 0) - Number(m.last_block ?? 0);
    const label = `${m.source}${m.token_address ? ":" + String(m.token_address).slice(0, 10) : ""}`;
    wmReport.push({ source: label, lag_blocks: lag, updated_minutes_ago: mins });
    if (mins > STALL_LIMIT_MIN) {
      problems.push({
        kind: "watermark_stalled",
        source: label,
        stalled_minutes: mins,
        detail: `Watermark không nhích trong ${mins} phút (lag ${lag} block).`,
      });
    } else if (lag > WATERMARK_LAG_BLOCKS) {
      problems.push({
        kind: "watermark_lag",
        source: label,
        stalled_minutes: mins,
        detail: `Watermark tụt ${lag} block so với head (ngưỡng ${WATERMARK_LAG_BLOCKS}).`,
      });
    }
  }
  checks.watermarks = wmReport;

  // 3. Moralis — còn được gọi nhưng không call nào thành công trong 1 giờ
  const { data: moralis } = await admin
    .from("moralis_api_usage")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(1);
  if (moralis?.[0]) {
    const row = moralis[0] as Record<string, unknown>;
    const mins = minutesSince((row.updated_at ?? row.created_at) as string);
    checks.moralis_last_usage_minutes = mins;
    const failures = Number(row.failed_calls ?? row.error_count ?? 0);
    const success = Number(row.success_calls ?? row.call_count ?? 0);
    if (failures > 0 && success === 0 && mins <= STALL_LIMIT_MIN * 24) {
      problems.push({
        kind: "moralis",
        source: "moralis",
        stalled_minutes: mins,
        detail: `Moralis chỉ có lỗi (${failures}) và 0 call thành công ở bản ghi mới nhất.`,
      });
    }
  }

  // 4. gap chưa resolve
  const { count: gapCount } = await admin
    .from("scanner_block_gaps")
    .select("id", { count: "exact", head: true })
    .is("resolved_at", null);
  checks.gaps_unresolved = gapCount ?? 0;
  if ((gapCount ?? 0) > GAP_UNRESOLVED_LIMIT) {
    problems.push({
      kind: "gaps_unresolved",
      source: "scanner_block_gaps",
      stalled_minutes: 0,
      detail: `${gapCount} block chưa đọc được — nguy cơ sót giao dịch.`,
    });
  }

  // Gửi cảnh báo (dedupe 3 giờ)
  let sent = 0;
  if (problems.length > 0) {
    const since = new Date(Date.now() - SCANNER_HEALTH_DEDUPE_MS).toISOString();
    const { data: recent } = await admin
      .from("notifications")
      .select("id, metadata")
      .eq("type", "wallet_reconciliation_alert")
      .gte("created_at", since)
      .limit(50);
    const alreadySent = (recent ?? []).some((r) =>
      (r.metadata as Record<string, unknown> | null)?.source === SCANNER_HEALTH_SOURCE
    );
    if (!alreadySent) {
      const { data: admins } = await admin
        .from("user_roles")
        .select("user_id")
        .eq("role", "admin");
      const ids = (admins ?? []).map((a) => a.user_id as string);
      const rows = buildScannerHealthAlertRows(ids, problems, SYSTEM_ACTOR);
      if (rows.length > 0) {
        const { error } = await admin.from("notifications").insert(rows);
        if (error) console.error("[watchdog] insert notifications lỗi:", error.message);
        else sent = rows.length;
      }
    } else {
      checks.dedupe_skipped = true;
    }
  }

  return json({
    ok: true,
    healthy: problems.length === 0,
    problems,
    alerts_sent: sent,
    checks,
  });
});

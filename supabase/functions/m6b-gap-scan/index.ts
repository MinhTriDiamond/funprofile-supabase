/**
 * m6b-gap-scan — Đo "gap" lịch sử giao dịch theo LÔ (token × tháng).
 *
 * Gap = dòng trong `transactions` KHÔNG có đối ứng ở `donations`/`wallet_transfers`
 * VÀ bị whitelist của `v_unified_transactions` loại ra ⇒ user không thấy ở đâu cả.
 *
 * Bảo vệ chống timeout: mỗi request chỉ xử lý tối đa `max_batches` lô
 * (mặc định 8) hoặc tới khi hết time budget 40s. Single-flight qua `job_leases`.
 *
 * Gọi: admin (JWT có role admin) hoặc CRON (x-cron-secret / service role key).
 */
import { corsHeaders, json, createAdminClient } from '../_shared/httpAuth.ts';

const LEASE_NAME = 'm6b-gap-scan';
const TIME_BUDGET_MS = 40_000;

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  const started = Date.now();
  const admin = createAdminClient();

  try {
    // ---- Auth: CRON secret, service role key, hoặc admin JWT ----
    const authHeader = req.headers.get('Authorization') ?? '';
    const token = authHeader.replace(/^Bearer\s+/i, '');
    const serviceKey =
      Deno.env.get('SUPABASE_SECRET_KEY') || Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';
    const cronSecret = Deno.env.get('CRON_SHARED_SECRET') || Deno.env.get('CRON_SECRET') || '';
    const providedCron = req.headers.get('x-cron-secret') || req.headers.get('X-Cron-Secret') || '';
    const isService =
      (token.length > 0 && token === serviceKey) ||
      (cronSecret.length > 0 && providedCron === cronSecret);

    if (!isService) {
      const { data: userRes } = await admin.auth.getUser(token);
      const uid = userRes?.user?.id;
      if (!uid) return json({ ok: false, reason: 'invalid_token' }, 401);
      const { data: isAdmin } = await admin.rpc('has_role', { _user_id: uid, _role: 'admin' });
      if (!isAdmin) return json({ ok: false, reason: 'forbidden' }, 403);
    }

    let body: Record<string, unknown> = {};
    try {
      body = await req.json();
    } catch {
      body = {};
    }
    const maxBatches = Math.min(Math.max(Number(body.max_batches ?? 8) || 8, 1), 40);
    const plan = body.plan !== false; // mặc định luôn refresh danh sách lô

    // ---- Single-flight lease ----
    const ownerToken = crypto.randomUUID();
    const { data: leaseOk, error: leaseErr } = await admin.rpc('job_acquire_lease', {
      p_job_name: LEASE_NAME,
      p_owner_token: ownerToken,
      p_ttl_seconds: 120,
    });
    if (leaseErr) return json({ ok: false, reason: 'lease_error', error: leaseErr.message }, 500);
    if (!leaseOk) return json({ ok: true, skipped: 'lease_held' }, 200);

    let planned: unknown = null;
    const processed: Array<Record<string, unknown>> = [];
    let gapTotal = 0;
    let rowsScanned = 0;

    try {
      if (plan) {
        const { data, error } = await admin.rpc('m6b_gap_plan_batches', { _max_rows: 8000 });
        if (error) throw new Error(`plan_failed: ${error.message}`);
        planned = Array.isArray(data) ? data[0] : data;
      }

      for (let i = 0; i < maxBatches; i++) {
        if (Date.now() - started > TIME_BUDGET_MS) break;

        const { data: claimed, error: claimErr } = await admin.rpc('m6b_gap_claim_next_batch');
        if (claimErr) throw new Error(`claim_failed: ${claimErr.message}`);
        const batch = Array.isArray(claimed) ? claimed[0] : claimed;
        if (!batch?.id) break; // hết lô pending

        const { data: done, error: runErr } = await admin.rpc('m6b_gap_scan_run_batch', {
          _batch_id: batch.id,
        });
        if (runErr) {
          await admin
            .from('m6b_gap_scan_batches')
            .update({ status: 'error', last_error: runErr.message, finished_at: new Date().toISOString() })
            .eq('id', batch.id);
          processed.push({ id: batch.id, token: batch.token_symbol, month: batch.month, error: runErr.message });
          continue;
        }
        const row = Array.isArray(done) ? done[0] : done;
        gapTotal += Number(row?.gap_found ?? 0);
        rowsScanned += Number(row?.rows_scanned ?? 0);
        processed.push({
          id: row?.id,
          token: row?.token_symbol,
          month: row?.month,
          half: row?.half,
          rows_scanned: row?.rows_scanned,
          gap_found: row?.gap_found,
        });
      }
    } finally {
      await admin.rpc('job_release_lease', { p_job_name: LEASE_NAME, p_owner_token: ownerToken });
    }

    // ---- Tổng hợp trạng thái toàn bộ kế hoạch ----
    const { data: agg } = await admin
      .from('m6b_gap_scan_batches')
      .select('status, gap_found, rows_scanned');
    const summary = {
      batches_total: agg?.length ?? 0,
      batches_done: agg?.filter((r) => r.status === 'done').length ?? 0,
      batches_pending: agg?.filter((r) => r.status === 'pending').length ?? 0,
      batches_error: agg?.filter((r) => r.status === 'error').length ?? 0,
      gap_total_all_done: (agg ?? []).reduce((s, r) => s + Number(r.gap_found ?? 0), 0),
      rows_scanned_all_done: (agg ?? []).reduce((s, r) => s + Number(r.rows_scanned ?? 0), 0),
    };

    return json({
      ok: true,
      planned,
      processed_count: processed.length,
      processed,
      run_gap_found: gapTotal,
      run_rows_scanned: rowsScanned,
      summary,
      elapsed_ms: Date.now() - started,
    });
  } catch (e) {
    return json({ ok: false, error: e instanceof Error ? e.message : String(e) }, 500);
  }
});

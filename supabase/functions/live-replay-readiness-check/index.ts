/* eslint-disable @typescript-eslint/no-explicit-any */
// live-replay-readiness-check
// Quét các replay status='awaiting_chunks', kiểm tra chunk đã ổn định chưa.
// Nếu pending=0 và max(updated_at) > STABLE_WINDOW_SECONDS trước → FREEZE snapshot,
// chuyển status='queued' để TUS ingest dùng snapshot bất biến (không bị "moving target").
import { createClient } from 'npm:@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-cron-secret',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const STABLE_WINDOW_SECONDS = 60;
const MAX_AWAITING_AGE_HOURS = 6;
const BATCH_LIMIT = 30;

function json(body: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: corsHeaders });

  const authHeader = req.headers.get('Authorization') || '';
  const serviceRoleKey = (Deno.env.get('SUPABASE_SECRET_KEY') ?? Deno.env.get('SUPABASE_SERVICE_ROLE_KEY'))!;
  const anonKey = (Deno.env.get('SUPABASE_PUBLISHABLE_KEY') ?? Deno.env.get('SUPABASE_ANON_KEY'));
  const cronSecret = Deno.env.get('CRON_SECRET') || Deno.env.get('CRON_SHARED_SECRET');
  const ok =
    authHeader === `Bearer ${serviceRoleKey}` ||
    authHeader === `Bearer ${anonKey}` ||
    (cronSecret && req.headers.get('X-Cron-Secret') === cronSecret);
  if (!ok) return json({ error: 'Unauthorized' }, 401);

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    serviceRoleKey,
    { auth: { autoRefreshToken: false, persistSession: false } },
  );

  // Bắt cả 'awaiting_chunks' (đường chuẩn) và 'queued' chưa-freeze + còn manifest key
  // (legacy/auto-finalize) — watchdog phòng thủ để không replay nào bị bỏ rơi.
  const { data: replays, error } = await supabase
    .from('live_replays')
    .select('id, chunked_recording_id, created_at, chunks_stable_since, status, source_webm_key, snapshot_frozen_at')
    .eq('cloudflare_vod_enabled', true)
    .or('status.eq.awaiting_chunks,and(status.eq.queued,snapshot_frozen_at.is.null,source_webm_key.like.%/manifest.json)')
    .order('created_at', { ascending: true })
    .limit(BATCH_LIMIT);

  if (error) {
    console.error('[READINESS] query error', error);
    return json({ error: error.message }, 500);
  }

  const results: any[] = [];
  for (const r of replays || []) {
    try {
      // Dùng SQL aggregate qua HEAD count + một query nhỏ để lấy max(uploaded_at)
      // tránh PostgREST cap 1000 rows. Đọc cả uploaded + pending bằng count exact.
      const recordingId = (r as any).chunked_recording_id;
      const { count: uploadedCount } = await supabase
        .from('chunked_recording_chunks')
        .select('seq', { count: 'exact', head: true })
        .eq('recording_id', recordingId)
        .eq('status', 'uploaded');
      const { count: pendingCount } = await supabase
        .from('chunked_recording_chunks')
        .select('seq', { count: 'exact', head: true })
        .eq('recording_id', recordingId)
        .not('status', 'in', '(uploaded,failed)');

      // Tổng bytes + max uploaded_at qua pagination 1000 rows.
      let totalBytes = 0;
      let lastUpdate = 0;
      const PAGE = 1000;
      const total = uploadedCount || 0;
      for (let from = 0; from < total; from += PAGE) {
        const { data: page, error: pErr } = await supabase
          .from('chunked_recording_chunks')
          .select('bytes, uploaded_at')
          .eq('recording_id', recordingId)
          .eq('status', 'uploaded')
          .order('seq', { ascending: true })
          .range(from, from + PAGE - 1);
        if (pErr) throw pErr;
        for (const c of page || []) {
          totalBytes += Number((c as any).bytes || 0);
          const t = new Date((c as any).uploaded_at).getTime();
          if (t > lastUpdate) lastUpdate = t;
        }
      }

      const idleSeconds = lastUpdate ? (Date.now() - lastUpdate) / 1000 : 0;
      const ageHours = (Date.now() - new Date((r as any).created_at).getTime()) / 3600_000;
      const stable = (pendingCount || 0) === 0 && idleSeconds >= STABLE_WINDOW_SECONDS && total > 0;
      const forcedTimeout = ageHours >= MAX_AWAITING_AGE_HOURS && total > 0;

      if (!stable && !forcedTimeout) {
        if ((pendingCount || 0) === 0 && !(r as any).chunks_stable_since) {
          await supabase.from('live_replays')
            .update({ chunks_stable_since: new Date(lastUpdate || Date.now()).toISOString() })
            .eq('id', (r as any).id);
        }
        results.push({ replay_id: (r as any).id, action: 'wait', uploaded: total, pending: pendingCount || 0, idle_s: Math.round(idleSeconds) });
        continue;
      }

      if (totalBytes <= 0 || total === 0) {
        await supabase.from('live_replays').update({
          status: 'failed',
          error_message: 'No uploaded chunks found',
          last_error_at: new Date().toISOString(),
          last_cf_status: 'readiness_no_chunks',
        }).eq('id', (r as any).id);
        results.push({ replay_id: (r as any).id, action: 'failed_no_chunks' });
        continue;
      }

      await supabase.from('live_replays').update({
        status: 'queued',
        snapshot_total_bytes: totalBytes,
        snapshot_total_chunks: total,
        snapshot_frozen_at: new Date().toISOString(),
        total_chunks_for_ingest: total,
        chunks_stable_since: new Date(lastUpdate || Date.now()).toISOString(),
        // Clear manifest.json key (set bởi recording-finalize) để concat-replay-webm
        // pick được. Sau khi concat xong sẽ set lại = recordings/{id}/replay.webm.
        source_webm_key: null,
        source_webm_size: null,
        last_cf_status: forcedTimeout ? 'snapshot_frozen_timeout' : 'snapshot_frozen',
        last_cf_response: { totalBytes, totalChunks: total, idle_s: Math.round(idleSeconds), age_hours: Number(ageHours.toFixed(2)), forced: forcedTimeout },
      }).eq('id', (r as any).id);

      console.log('[READINESS] frozen', { replay_id: (r as any).id, totalBytes, totalChunks: total, idle_s: Math.round(idleSeconds), forced: forcedTimeout });
      results.push({ replay_id: (r as any).id, action: 'frozen', totalBytes, totalChunks: total });
    } catch (err: any) {
      console.error('[READINESS] error', { replay_id: (r as any).id, err: err?.message });
      results.push({ replay_id: (r as any).id, error: String(err?.message || err) });
    }
  }

  return json({ processed: results.length, results, timestamp: new Date().toISOString() });
});

/**
 * live-replay-watchdog (cron mỗi 15 phút)
 *
 * - Soft-retry: replay 'uploading' không nhích trong 20' → reset last_ingest_at = NULL
 *   (cron-ingest sẽ pick ưu tiên do ORDER BY last_ingest_at ASC NULLS FIRST).
 * - Force-restart TUS: 'uploading' không nhích trong 90' AND tus_offset < 80% total
 *   → xóa tus_upload_url, reset offset/seq, để lần ingest sau tạo TUS mới.
 * - Hard-fail: 'uploading' AND ingest_attempts >= 5 AND last_ingest_at < now()-2h
 *   → status='failed', error='watchdog_timeout'.
 * - Probe CF: replay 'processing' >30' chưa ready → gọi live-replay-poll-status.
 * - Notify admin: nếu stale_1h >= 5 → tạo notification 'replay_backlog_alert'.
 */

import { createClient } from 'npm:@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-cron-secret',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

function json(body: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: corsHeaders });

  const authHeader = req.headers.get('Authorization') || '';
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY');
  const cronSecret = Deno.env.get('CRON_SECRET');
  const isAuthorized =
    authHeader === `Bearer ${serviceRoleKey}` ||
    authHeader === `Bearer ${anonKey}` ||
    (cronSecret && req.headers.get('X-Cron-Secret') === cronSecret);
  if (!isAuthorized) return json({ error: 'Unauthorized' }, 401);

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    serviceRoleKey,
    { auth: { autoRefreshToken: false, persistSession: false } },
  );

  const summary: Record<string, unknown> = {};

  // 1) Soft-retry: stale > 20 min
  const { data: softList } = await supabase
    .from('live_replays')
    .select('id')
    .eq('status', 'uploading')
    .lt('last_ingest_at', new Date(Date.now() - 20 * 60_000).toISOString());
  const softIds = (softList || []).map((r: any) => r.id);
  if (softIds.length > 0) {
    await supabase
      .from('live_replays')
      .update({ last_ingest_at: null })
      .in('id', softIds);
  }
  summary.soft_retry = softIds.length;

  // 2) Force-restart TUS: stale > 90 min, offset < 80%
  const { data: forceList } = await supabase
    .from('live_replays')
    .select('id, tus_offset, total_chunks_for_ingest, ingest_attempts, chunked_recording_id')
    .eq('status', 'uploading')
    .lt('last_ingest_at', new Date(Date.now() - 90 * 60_000).toISOString())
    .not('tus_upload_url', 'is', null);
  const restarted: string[] = [];
  for (const r of (forceList || []) as any[]) {
    // Lấy total bytes từ chunks
    const { data: chunks } = await supabase
      .from('chunked_recording_chunks')
      .select('bytes')
      .eq('recording_id', r.chunked_recording_id)
      .eq('status', 'uploaded');
    const totalBytes = (chunks || []).reduce((s: number, c: any) => s + Number(c.bytes || 0), 0);
    if (totalBytes <= 0) continue;
    const ratio = Number(r.tus_offset || 0) / totalBytes;
    if (ratio >= 0.8) continue;
    await supabase.from('live_replays').update({
      tus_upload_url: null,
      tus_offset: 0,
      next_chunk_seq: 0,
      stream_uid: null,
      ingest_attempts: (r.ingest_attempts || 0) + 1,
      last_ingest_at: null,
      error_message: `watchdog_restart at ratio=${ratio.toFixed(3)}`,
    }).eq('id', r.id);
    restarted.push(r.id);
  }
  summary.force_restart = restarted.length;

  // 3) Hard-fail
  const { data: failList } = await supabase
    .from('live_replays')
    .select('id')
    .eq('status', 'uploading')
    .gte('ingest_attempts', 5)
    .lt('last_ingest_at', new Date(Date.now() - 120 * 60_000).toISOString());
  const failIds = (failList || []).map((r: any) => r.id);
  if (failIds.length > 0) {
    await supabase
      .from('live_replays')
      .update({ status: 'failed', error_message: 'watchdog_timeout' })
      .in('id', failIds);
  }
  summary.hard_fail = failIds.length;

  // 4) Probe processing (CF chưa flip)
  const { data: probeList } = await supabase
    .from('live_replays')
    .select('id, stream_uid')
    .eq('status', 'processing')
    .lt('last_ingest_at', new Date(Date.now() - 30 * 60_000).toISOString())
    .not('stream_uid', 'is', null)
    .limit(20);
  const probed = (probeList || []).length;
  if (probed > 0) {
    try {
      await fetch(`${Deno.env.get('SUPABASE_URL')}/functions/v1/live-replay-poll-status`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${serviceRoleKey}`,
        },
        body: JSON.stringify({ trigger: 'watchdog' }),
      });
    } catch (e) {
      console.error('[watchdog] poll trigger failed', e);
    }
  }
  summary.probe_processing = probed;

  // 5) Notify admin nếu backlog stale > 1h
  const { count: stale1h } = await supabase
    .from('live_replays')
    .select('id', { count: 'exact', head: true })
    .in('status', ['queued', 'uploading'])
    .lt('last_ingest_at', new Date(Date.now() - 60 * 60_000).toISOString());
  summary.stale_1h = stale1h ?? 0;

  if ((stale1h ?? 0) >= 5) {
    // Lấy admin user_ids
    const { data: admins } = await supabase
      .from('user_roles')
      .select('user_id')
      .eq('role', 'admin');
    const rows = (admins || []).map((a: any) => ({
      user_id: a.user_id,
      type: 'replay_backlog_alert',
      title: 'Replay backlog cảnh báo',
      message: `Có ${stale1h} video replay đang pending quá 1 giờ. Watchdog đã thực hiện soft-retry=${summary.soft_retry}, force-restart=${summary.force_restart}, hard-fail=${summary.hard_fail}.`,
      metadata: { stale_1h: stale1h, ...summary },
    }));
    if (rows.length > 0) {
      await supabase.from('notifications').insert(rows);
    }
  }

  console.log('[watchdog] summary', summary);
  return json({ ok: true, ...summary, timestamp: new Date().toISOString() });
});

/* eslint-disable @typescript-eslint/no-explicit-any */
import { createClient } from 'npm:@supabase/supabase-js@2';
import { getStreamAccountId, getStreamToken, requestMp4Download } from '../_shared/cloudflareStreamService.ts';
import { markStreamReadyAndArchive } from '../_shared/livestreamProcessingService.ts';

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
  const serviceRoleKey = (Deno.env.get('SUPABASE_SECRET_KEY') ?? Deno.env.get('SUPABASE_SERVICE_ROLE_KEY'))!;
  const anonKey = (Deno.env.get('SUPABASE_PUBLISHABLE_KEY') ?? Deno.env.get('SUPABASE_ANON_KEY'));
  const cronSecret = Deno.env.get('CRON_SECRET') || Deno.env.get('CRON_SHARED_SECRET');
  const ok =
    authHeader === `Bearer ${serviceRoleKey}` ||
    authHeader === `Bearer ${anonKey}` ||
    (cronSecret && req.headers.get('X-Cron-Secret') === cronSecret);
  if (!ok) return json({ error: 'Unauthorized' }, 401);

  try {
    const accountId = getStreamAccountId();
    const token = getStreamToken();
    if (!accountId || !token) return json({ error: 'Missing Cloudflare Stream config' }, 500);

    const admin = createClient(
      Deno.env.get('SUPABASE_URL')!,
      serviceRoleKey,
      { auth: { autoRefreshToken: false, persistSession: false } },
    );

    const { data: pending } = await (admin as any)
      .from('live_replays')
      .select('id, live_session_id, stream_uid, status, processing_started_at')
      .in('status', ['uploading', 'queued', 'processing'])
      .eq('cloudflare_vod_enabled', true)
      .not('stream_uid', 'is', null)
      .limit(50);

    const STUCK_NORMALIZING_SECONDS = 1800;   // 30 phút concat treo

    // Watchdog: replay 'normalizing' quá 30 phút (không có stream_uid) → mark failed.
    const { data: stuckNorm } = await (admin as any)
      .from('live_replays')
      .select('id, live_session_id, concat_started_at')
      .eq('status', 'normalizing')
      .eq('cloudflare_vod_enabled', true)
      .lt('concat_started_at', new Date(Date.now() - STUCK_NORMALIZING_SECONDS * 1000).toISOString())
      .limit(20);
    for (const sr of stuckNorm || []) {
      console.info('[CF_STREAM] [POLL] normalizing requires reconciliation', { replay_id: sr.id });
      await (admin as any).from('live_replays').update({
        last_cf_status: 'normalizing_stuck_review',
      }).eq('id', sr.id);
    }

    // Fallback post: replay 'failed'/'skipped_legacy' nhưng post vẫn còn 'cloudflare_stream_pending'.
    // Chuyển post sang 'chunked_fallback' để feed phát manifest.json, tránh kẹt "đang xử lý".
    const { data: needFallback } = await (admin as any)
      .from('live_replays')
      .select('id, live_session_id')
      .in('status', ['failed', 'skipped_legacy'])
      .not('live_session_id', 'is', null)
      .limit(50);
    for (const fr of needFallback || []) {
      const { data: ls } = await admin
        .from('live_sessions').select('post_id').eq('id', fr.live_session_id).maybeSingle();
      if (!ls?.post_id) continue;
      const { data: post } = await admin
        .from('posts').select('metadata').eq('id', ls.post_id).maybeSingle();
      const meta: any = (post?.metadata && typeof post.metadata === 'object') ? { ...post.metadata } : {};
      if (meta.playback_type === 'cloudflare_stream' || meta.playback_type === 'chunked_fallback') continue;
      meta.playback_type = 'chunked_fallback';
      meta.allow_chunked_fallback = true;
      meta.live_status = 'ended';
      await admin.from('posts').update({ metadata: meta }).eq('id', ls.post_id);
    }

    const results: any[] = [];
    for (const replay of pending || []) {
      const uid = replay.stream_uid as string;
      const cfResp = await fetch(`https://api.cloudflare.com/client/v4/accounts/${accountId}/stream/${uid}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await cfResp.json().catch(() => null);
      console.log('[CF_STREAM] [POLL] video status', { uid, httpStatus: cfResp.status, success: data?.success });
      if (!cfResp.ok || !data?.success) {
        await (admin as any).from('live_replays').update({
          last_cf_status: `poll_${cfResp.status}`,
          last_cf_response: data || { status: cfResp.status },
        }).eq('id', replay.id);
        results.push({ uid, status: 'poll_error', httpStatus: cfResp.status });
        continue;
      }

      const video = data.result;
      const state = String(video?.status?.state || 'processing').toLowerCase();
      if (video?.readyToStream === true || state === 'ready') {
        const mp4 = await requestMp4Download(uid).catch(() => null);
        const mp4Url = mp4?.url || null;
        await markStreamReadyAndArchive(admin, { replay, uid, video, mp4Url }).catch((error) => {
          console.error('[POLL] archive after ready failed; retry cron will handle it', error);
        });
        results.push({ uid, status: 'ready' });
      } else if (state === 'error' || state === 'failed') {
        const reason = video?.status?.errReasonText || video?.status?.errorReasonText || 'Stream encoding failed';
        await (admin as any).from('live_replays').update({
          status: 'failed',
          error_message: reason,
          last_error_at: new Date().toISOString(),
          last_cf_status: state,
          last_cf_response: video,
        }).eq('id', replay.id);
        await admin.from('live_sessions').update({
          recording_status: 'failed',
          recording_error: reason,
        }).eq('id', replay.live_session_id);
        results.push({ uid, status: 'failed', reason });
      } else {
        // `pendingupload` is a non-terminal provider state. Age alone is not
        // enough to fail the replay; keep polling/reconciliation eligible.
        await (admin as any).from('live_replays').update({
          last_cf_status: state,
          last_cf_response: video,
        }).eq('id', replay.id);
        results.push({ uid, status: replay.status, state });
      }
    }

    return json({ ok: true, processed: results.length, results });
  } catch (error) {
    const msg = error instanceof Error ? error.message : 'Unknown error';
    console.error('live-replay-poll-status error:', error);
    return json({ error: msg }, 500);
  }
});

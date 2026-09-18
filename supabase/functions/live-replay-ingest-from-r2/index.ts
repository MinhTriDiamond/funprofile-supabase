/* eslint-disable @typescript-eslint/no-explicit-any */
import { createClient } from 'npm:@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

function json(body: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

function streamToken(): string | null {
  return Deno.env.get('CLOUDFLARE_STREAM_TOKEN') || Deno.env.get('CLOUDFLARE_STREAM_API_TOKEN');
}

async function invokeReplayWorkers(): Promise<void> {
  const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
  const serviceKey = (Deno.env.get('SUPABASE_SECRET_KEY') ?? Deno.env.get('SUPABASE_SERVICE_ROLE_KEY'))!;
  const cronSecret = Deno.env.get('CRON_SECRET') || Deno.env.get('CRON_SHARED_SECRET');
  const headers: Record<string, string> = {
    Authorization: `Bearer ${serviceKey}`,
    'Content-Type': 'application/json',
  };
  if (cronSecret) headers['X-Cron-Secret'] = cronSecret;

  await Promise.allSettled([
    fetch(`${supabaseUrl}/functions/v1/auto-finalize-recordings`, {
      method: 'POST',
      headers,
      body: '{}',
    }),
    fetch(`${supabaseUrl}/functions/v1/live-replay-stream-ingest`, {
      method: 'POST',
      headers,
      body: '{}',
    }),
  ]);
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: corsHeaders });
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405);

  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader?.startsWith('Bearer ')) return json({ error: 'Unauthorized' }, 401);

    const accountId = Deno.env.get('CLOUDFLARE_STREAM_ACCOUNT_ID') ?? Deno.env.get('CLOUDFLARE_ACCOUNT_ID');
    const token = streamToken();
    const r2PublicUrl = Deno.env.get('CLOUDFLARE_R2_PUBLIC_URL');
    if (!accountId || !token || !r2PublicUrl) {
      return json({ error: 'Missing Cloudflare configuration' }, 500);
    }

    const supabaseUser = createClient(
      Deno.env.get('SUPABASE_URL')!,
      (Deno.env.get('SUPABASE_PUBLISHABLE_KEY') ?? Deno.env.get('SUPABASE_ANON_KEY'))!,
      { global: { headers: { Authorization: authHeader } }, auth: { autoRefreshToken: false, persistSession: false } },
    );
    const { data: { user }, error: userErr } = await supabaseUser.auth.getUser();
    if (userErr || !user) return json({ error: 'Unauthorized' }, 401);

    const { live_session_id, chunked_recording_id } = await req.json();
    if (!live_session_id || !chunked_recording_id) {
      return json({ error: 'Missing live_session_id or chunked_recording_id' }, 400);
    }

    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL')!,
      (Deno.env.get('SUPABASE_SECRET_KEY') ?? Deno.env.get('SUPABASE_SERVICE_ROLE_KEY'))!,
      { auth: { autoRefreshToken: false, persistSession: false } },
    );

    const { data: profile } = await supabaseAdmin
      .from('profiles')
      .select('is_banned')
      .eq('id', user.id)
      .maybeSingle();
    if (profile?.is_banned) return json({ error: 'Account is banned' }, 403);

    const { data: liveSession, error: sessErr } = await supabaseAdmin
      .from('live_sessions')
      .select('id, host_user_id, owner_id, post_id, title')
      .eq('id', live_session_id)
      .maybeSingle();
    if (sessErr || !liveSession) return json({ error: 'Live session not found' }, 404);
    if (liveSession.host_user_id !== user.id && liveSession.owner_id !== user.id) {
      return json({ error: 'Forbidden' }, 403);
    }

    const { data: recording, error: recErr } = await supabaseAdmin
      .from('chunked_recordings')
      .select('id, user_id, live_session_id, output_object_key, output_url, total_chunks')
      .eq('id', chunked_recording_id)
      .maybeSingle();
    if (recErr || !recording) return json({ error: 'Recording not found' }, 404);
    if (recording.user_id !== user.id || recording.live_session_id !== live_session_id) {
      return json({ error: 'Forbidden' }, 403);
    }

    const { data: existingReplay } = await (supabaseAdmin as any)
      .from('live_replays')
      .select('id, status, stream_uid')
      .eq('chunked_recording_id', chunked_recording_id)
      .in('status', ['queued', 'uploading', 'processing', 'ready', 'skipped_legacy'])
      .maybeSingle();
    if (existingReplay) {
      if (existingReplay.status === 'queued' || existingReplay.status === 'uploading') {
        invokeReplayWorkers().catch((err) => console.warn('[live-replay-ingest-from-r2] worker trigger failed:', err));
      }
      return json({
        replay_id: existingReplay.id,
        stream_uid: existingReplay.stream_uid,
        status: existingReplay.status,
        reused: true,
      });
    }

    let sourceUrl = recording.output_url || '';
    const outputKey = recording.output_object_key || '';
    const isManifest = outputKey.endsWith('manifest.json');
    if (!sourceUrl || isManifest) {
      sourceUrl = `${r2PublicUrl}/recordings/${chunked_recording_id}/replay.webm`;
    }

    let sourceReady = false;
    try {
      const headResp = await fetch(sourceUrl, { method: 'HEAD' });
      sourceReady = headResp.ok && parseInt(headResp.headers.get('content-length') || '0', 10) > 0;
    } catch {
      sourceReady = false;
    }

    if (!sourceReady) {
      const { data: replay, error: upsertErr } = await (supabaseAdmin as any)
        .from('live_replays')
        .upsert({
          user_id: user.id,
          live_session_id,
          chunked_recording_id,
          cloudflare_vod_enabled: true,
          source_webm_key: outputKey || `recordings/${chunked_recording_id}/manifest.json`,
          status: 'queued',
          error_message: null,
          last_error_at: null,
        }, { onConflict: 'chunked_recording_id' })
        .select('id, stream_uid, status')
        .single();
      if (upsertErr || !replay) {
        return json({ error: upsertErr?.message || 'Failed to enqueue replay ingest' }, 500);
      }

      await supabaseAdmin
        .from('live_sessions')
        .update({ recording_status: 'processing', recording_error: null })
        .eq('id', live_session_id);

      invokeReplayWorkers().catch((err) => console.warn('[live-replay-ingest-from-r2] worker trigger failed:', err));

      return json({
        replay_id: replay.id,
        stream_uid: replay.stream_uid,
        status: 'queued',
        message: 'Replay queued for Cloudflare Stream TUS ingest.',
        source_url: sourceUrl,
      }, 202);
    }

    const cfResp = await fetch(`https://api.cloudflare.com/client/v4/accounts/${accountId}/stream/copy`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
        'Upload-Creator': user.id.slice(0, 64),
      },
      body: JSON.stringify({
        url: sourceUrl,
        meta: {
          source: 'fun-profile-live-replay-ingest',
          userId: user.id,
          liveSessionId: live_session_id,
          chunkedRecordingId: chunked_recording_id,
          name: liveSession.title || 'FUN Profile live replay',
        },
        requireSignedURLs: false,
        allowedOrigins: ['*'],
      }),
    });

    const cfBody = await cfResp.text().catch(() => '');
    if (!cfResp.ok) {
      console.error('[CF_STREAM] [/copy] failed', { status: cfResp.status, body: cfBody.slice(0, 500) });
      return json({
        error: `Cloudflare Stream copy failed: ${cfResp.status}`,
        detail: cfBody.slice(0, 500),
      }, 502);
    }

    const cfData = JSON.parse(cfBody || '{}');
    const streamUid = cfData?.result?.uid;
    if (!streamUid) return json({ error: 'Invalid Cloudflare /copy response' }, 502);

    const { data: replay, error: upsertErr } = await (supabaseAdmin as any)
      .from('live_replays')
      .upsert({
        user_id: user.id,
        live_session_id,
        chunked_recording_id,
        cloudflare_vod_enabled: true,
        source_webm_key: outputKey || null,
        stream_uid: streamUid,
        status: 'processing',
        last_cf_status: 'copy_created',
        last_cf_response: cfData,
        error_message: null,
        last_error_at: null,
      }, { onConflict: 'chunked_recording_id' })
      .select('id')
      .single();
    if (upsertErr || !replay) {
      return json({ error: upsertErr?.message || 'Failed to create replay row' }, 500);
    }

    await supabaseAdmin
      .from('live_sessions')
      .update({ recording_status: 'processing', recording_error: null })
      .eq('id', live_session_id);

    return json({
      replay_id: replay.id,
      stream_uid: streamUid,
      status: 'processing',
      source_url: sourceUrl,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    console.error('live-replay-ingest-from-r2 error:', error);
    return json({ error: message }, 500);
  }
});

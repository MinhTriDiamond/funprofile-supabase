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

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: corsHeaders });
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405);

  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader?.startsWith('Bearer ')) return json({ error: 'Unauthorized' }, 401);

    const accountId = Deno.env.get('CLOUDFLARE_STREAM_ACCOUNT_ID') ?? Deno.env.get('CLOUDFLARE_ACCOUNT_ID');
    const token = streamToken();
    if (!accountId || !token) return json({ error: 'Missing Cloudflare Stream configuration' }, 500);

    const supabaseUser = createClient(
      Deno.env.get('SUPABASE_URL')!,
      (Deno.env.get('SUPABASE_PUBLISHABLE_KEY') ?? Deno.env.get('SUPABASE_ANON_KEY'))!,
      { global: { headers: { Authorization: authHeader } }, auth: { autoRefreshToken: false, persistSession: false } },
    );
    const { data: { user }, error: userErr } = await supabaseUser.auth.getUser();
    if (userErr || !user) return json({ error: 'Unauthorized' }, 401);

    const { live_session_id, chunked_recording_id, expected_size } = await req.json();
    if (!live_session_id || !chunked_recording_id || typeof expected_size !== 'number' || expected_size <= 0) {
      return json({ error: 'Missing live_session_id, chunked_recording_id, or expected_size' }, 400);
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

    const { data: liveSession, error: sessionErr } = await supabaseAdmin
      .from('live_sessions')
      .select('id, host_user_id, owner_id, post_id, title')
      .eq('id', live_session_id)
      .maybeSingle();
    if (sessionErr || !liveSession) return json({ error: 'Live session not found' }, 404);
    if (liveSession.host_user_id !== user.id && liveSession.owner_id !== user.id) {
      return json({ error: 'Forbidden' }, 403);
    }

    const { data: recording, error: recErr } = await supabaseAdmin
      .from('chunked_recordings')
      .select('id, user_id, live_session_id, output_object_key')
      .eq('id', chunked_recording_id)
      .maybeSingle();
    if (recErr || !recording) return json({ error: 'Recording not found' }, 404);
    if (recording.user_id !== user.id || recording.live_session_id !== live_session_id) {
      return json({ error: 'Forbidden' }, 403);
    }

    const cfResp = await fetch(`https://api.cloudflare.com/client/v4/accounts/${accountId}/stream/direct_upload`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
        'Upload-Creator': user.id.slice(0, 64),
      },
      body: JSON.stringify({
        maxDurationSeconds: 36000,
        requireSignedURLs: false,
        allowedOrigins: ['*'],
        meta: {
          source: 'fun-profile-live-replay',
          userId: user.id,
          liveSessionId: live_session_id,
          chunkedRecordingId: chunked_recording_id,
          title: liveSession.title || 'FUN Profile live replay',
        },
      }),
    });

    if (!cfResp.ok) {
      const detail = await cfResp.text().catch(() => '');
      return json({ error: `Cloudflare direct upload failed: ${cfResp.status}`, detail: detail.slice(0, 500) }, 502);
    }

    const cfData = await cfResp.json();
    const uploadURL = cfData?.result?.uploadURL;
    const streamUid = cfData?.result?.uid;
    if (!uploadURL || !streamUid) return json({ error: 'Invalid Cloudflare direct upload response' }, 502);

    const { data: replay, error: insertErr } = await supabaseAdmin
      .from('live_replays')
      .insert({
        user_id: user.id,
        live_session_id,
        chunked_recording_id,
        source_webm_key: recording.output_object_key || null,
        stream_uid: streamUid,
        filesize_bytes: expected_size,
        status: 'uploading',
      })
      .select('id')
      .single();
    if (insertErr || !replay) return json({ error: insertErr?.message || 'Failed to create replay row' }, 500);

    await supabaseAdmin
      .from('live_sessions')
      .update({ recording_status: 'processing', recording_error: null })
      .eq('id', live_session_id);

    return json({ uploadURL, stream_uid: streamUid, replay_id: replay.id });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    console.error('live-replay-create-upload error:', error);
    return json({ error: message }, 500);
  }
});

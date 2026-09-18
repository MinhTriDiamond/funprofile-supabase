/* eslint-disable @typescript-eslint/no-explicit-any */
import { tryDecryptStreamKey } from '../_shared/streamKeyCrypto.ts';
import { corsHeaders, createAdminClient, json, requireUser } from '../_shared/httpAuth.ts';

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: corsHeaders });
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405);

  try {
    const user = await requireUser(req);
    const body = await req.json().catch(() => ({}));
    const liveSessionId = typeof body.live_session_id === 'string' ? body.live_session_id : null;
    if (!liveSessionId) return json({ error: 'Missing live_session_id' }, 400);

    const admin = createAdminClient();
    const { data: session, error } = await (admin as any)
      .from('live_sessions')
      .select('id, owner_id, host_user_id, mode, status, rtmps_url, stream_key_encrypted, hls_url, playback_url, cloudflare_video_uid, rtmp_config_id, is_persistent_stream')
      .eq('id', liveSessionId)
      .maybeSingle();
    if (error) throw error;
    if (!session) return json({ error: 'Live session not found' }, 404);
    if (session.owner_id !== user.id && session.host_user_id !== user.id) return json({ error: 'Forbidden' }, 403);
    if (session.mode !== 'rtmp_obs') return json({ error: 'Not an OBS/RTMP live session' }, 400);

    const streamKey = await tryDecryptStreamKey(session.stream_key_encrypted);
    const keyResetRequired = !!session.stream_key_encrypted && streamKey === null;

    return json({
      ok: true,
      live_session_id: session.id,
      status: session.status,
      rtmps_url: session.rtmps_url,
      stream_key: streamKey,
      key_reset_required: keyResetRequired,
      hls_url: session.hls_url,
      playback_url: session.playback_url || session.hls_url || null,
      cloudflare_video_uid: session.cloudflare_video_uid || null,
      rtmp_config_id: session.rtmp_config_id || null,
      is_persistent_stream: !!session.is_persistent_stream,
      producer_url: `/live/obs/${session.id}`,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return json({ error: message }, message === 'Unauthorized' ? 401 : 500);
  }
});

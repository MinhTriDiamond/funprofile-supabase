/* eslint-disable @typescript-eslint/no-explicit-any */
import { createStreamLiveInput, deleteStreamLiveInput, getStreamPlaybackUrls } from '../_shared/cloudflareStreamService.ts';
import { encryptStreamKey } from '../_shared/streamKeyCrypto.ts';
import { corsHeaders, createAdminClient, json, requireUser } from '../_shared/httpAuth.ts';

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: corsHeaders });
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405);

  try {
    const user = await requireUser(req);
    const body = await req.json().catch(() => ({}));
    const liveSessionId = typeof body.live_session_id === 'string' ? body.live_session_id : null;
    if (!liveSessionId) return json({ error: 'Missing live_session_id' }, 400);

    const admin = createAdminClient() as any;
    const { data: session, error } = await admin
      .from('live_sessions')
      .select('id, owner_id, host_user_id, mode, title, status, cloudflare_live_input_id, rtmp_config_id, is_persistent_stream')
      .eq('id', liveSessionId)
      .maybeSingle();
    if (error) throw error;
    if (!session) return json({ error: 'Live session not found' }, 404);
    if (session.owner_id !== user.id && session.host_user_id !== user.id) return json({ error: 'Forbidden' }, 403);
    if (session.mode !== 'rtmp_obs') return json({ error: 'Not an OBS/RTMP live session' }, 400);
    const activeStatuses = ['source_connected', 'ready_to_go_live', 'live'];
    if (activeStatuses.includes(session.status) && body.confirm_reset !== true) {
      return json({ error: 'OBS đang kết nối hoặc đang live. Cần confirm_reset=true để đặt lại stream key.' }, 409);
    }

    const liveInput = await createStreamLiveInput({
      name: session.title || 'OBS Live',
      userId: user.id,
      liveSessionId: session.id,
    });
    if (!liveInput.rtmpsUrl || !liveInput.rtmpsStreamKey) throw new Error('Cloudflare did not return RTMPS credentials');

    const urls = getStreamPlaybackUrls(liveInput.uid);
    const encryptedKey = await encryptStreamKey(liveInput.rtmpsStreamKey);
    if (session.is_persistent_stream && session.rtmp_config_id) {
      await admin.from('rtmp_stream_configs').update({
        cloudflare_live_input_id: liveInput.uid,
        rtmps_url: liveInput.rtmpsUrl,
        stream_key_encrypted: encryptedKey,
        stream_key_last_reset_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      }).eq('id', session.rtmp_config_id).eq('user_id', user.id);
    }

    await admin.from('live_sessions').update({
      cloudflare_live_input_id: liveInput.uid,
      rtmps_url: liveInput.rtmpsUrl,
      stream_key_encrypted: encryptedKey,
      stream_key_last_reset_at: new Date().toISOString(),
      playback_url: urls.hls,
      hls_url: urls.hls,
      status: 'waiting_for_obs',
      source_connected_at: null,
      updated_at: new Date().toISOString(),
    }).eq('id', liveSessionId);

    if (session.cloudflare_live_input_id) {
      await deleteStreamLiveInput(session.cloudflare_live_input_id).catch((err) => {
        console.warn('[reset-rtmp-stream-key] old live input cleanup failed', String(err));
      });
    }

    return json({
      ok: true,
      live_session_id: session.id,
      rtmps_url: liveInput.rtmpsUrl,
      stream_key: liveInput.rtmpsStreamKey,
      hls_url: urls.hls,
      playback_url: urls.hls,
      rtmp_config_id: session.rtmp_config_id || null,
      is_persistent_stream: !!session.is_persistent_stream,
      status: 'waiting_for_obs',
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return json({ error: message }, message === 'Unauthorized' ? 401 : 500);
  }
});

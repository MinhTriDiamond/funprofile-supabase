/* eslint-disable @typescript-eslint/no-explicit-any */
import { corsHeaders, createAdminClient, json, requireUser } from '../_shared/httpAuth.ts';
import { disarmSession } from '../_shared/rtmpArmingService.ts';
import { endRtmpLiveSession } from '../_shared/rtmpEndLiveService.ts';
import { safeErrorText } from '../_shared/safeErrorText.ts';

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: corsHeaders });
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405);

  try {
    const user = await requireUser(req);
    const body = await req.json().catch(() => ({}));
    const liveSessionId = typeof body.live_session_id === 'string' ? body.live_session_id : null;
    const reason = typeof body.reason === 'string' ? body.reason.slice(0, 64) : 'producer_closed';
    if (!liveSessionId) return json({ error: 'Missing live_session_id' }, 400);

    const admin = createAdminClient() as any;
    const { data: session } = await admin
      .from('live_sessions')
      .select('id, status, mode, owner_id, host_user_id, cloudflare_live_input_id, post_id, live_post_id, ended_at')
      .eq('id', liveSessionId)
      .maybeSingle();
    if (!session) return json({ error: 'Live session not found' }, 404);
    if (session.owner_id !== user.id && session.host_user_id !== user.id) return json({ error: 'Forbidden' }, 403);
    if (session.mode !== 'rtmp_obs') return json({ error: 'Not an OBS/RTMP live session' }, 400);

    // Nếu đang LIVE đã public → KHÔNG end. Chỉ disarm (giữ stream chạy cho viewer).
    // Watchdog sẽ tự end khi grace timeout.
    if (session.status === 'live' && (session.post_id || session.live_post_id)) {
      const r = await disarmSession(admin, session, reason);
      return json({ ok: true, action: 'disarmed_only', live_session_id: session.id, ...r });
    }

    // Chưa go-live → end + disarm.
    const r = await endRtmpLiveSession(admin, session, 'manual');
    return json({ ok: true, action: 'ended', live_session_id: session.id, ...r });
  } catch (error) {
    const message = safeErrorText(error);
    console.error('[disarm-rtmp-live-session] failed', message);
    return json({ error: message }, message === 'Unauthorized' ? 401 : 500);
  }
});

/* eslint-disable @typescript-eslint/no-explicit-any */
import { corsHeaders, createAdminClient, json, requireUser } from '../_shared/httpAuth.ts';
import { isRtmpSessionEndedOrFrozen } from '../_shared/rtmpSessionStatus.ts';

function clean(value: unknown, max: number): string {
  return (typeof value === 'string' ? value.trim() : '').slice(0, max);
}

function producerStatus(session: any, title: string, description: string): string {
  // Bất kỳ status terminal/transition nào đều giữ nguyên, không được "tái sinh".
  if (isRtmpSessionEndedOrFrozen(session) || session.status === 'live') return session.status;
  // Session đã có ended_at ⇒ đã kết thúc rồi, không bao giờ chuyển ngược về ready_to_go_live.
  if (session.ended_at) return session.status;
  if (session.status === 'reconnecting' || session.connection_status === 'reconnecting') return 'reconnecting';
  if (session.status === 'disconnect_grace' || session.connection_status === 'disconnected') return 'reconnecting';
  const connected = session.source_connected === true || (!!session.source_connected_at && session.connection_status !== 'disconnected');
  if (connected && title && description) return 'ready_to_go_live';
  if (connected) return 'source_connected';
  return 'waiting_for_obs';
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: corsHeaders });
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405);

  try {
    const user = await requireUser(req);
    const body = await req.json().catch(() => ({}));
    const liveSessionId = typeof body.live_session_id === 'string' ? body.live_session_id : null;
    if (!liveSessionId) return json({ error: 'Missing live_session_id' }, 400);

    const title = clean(body.title, 5000);
    const description = clean(body.description, 5000);
    if (!title) return json({ error: 'Tiêu đề là bắt buộc' }, 400);
    if (!description) return json({ error: 'Mô tả là bắt buộc' }, 400);

    const admin = createAdminClient() as any;
    const { data: session, error } = await admin
      .from('live_sessions')
      .select('id, owner_id, host_user_id, mode, status, source_connected_at, source_connected, connection_status, ended_at, end_reason')
      .eq('id', liveSessionId)
      .maybeSingle();
    if (error) throw error;
    if (!session) return json({ error: 'Live session not found' }, 404);
    if (session.owner_id !== user.id && session.host_user_id !== user.id) return json({ error: 'Forbidden' }, 403);
    if (session.mode !== 'rtmp_obs') return json({ error: 'Not an OBS/RTMP live session' }, 400);

    const frozen = isRtmpSessionEndedOrFrozen(session) || session.status === 'live';
    const status = producerStatus(session, title, description);
    const { data: updated, error: updateError } = await admin
      .from('live_sessions')
      .update({ title, description, status, updated_at: new Date().toISOString() })
      .eq('id', liveSessionId)
      .select('id, title, description, status, source_connected_at, hls_url, playback_url, post_id, live_post_id')
      .single();
    if (updateError) throw updateError;
    return json({ ok: true, frozen, live_session: updated });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return json({ error: message }, message === 'Unauthorized' ? 401 : 500);
  }
});


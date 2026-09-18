/* eslint-disable @typescript-eslint/no-explicit-any */
import { corsHeaders, createAdminClient, json, requireUser } from '../_shared/httpAuth.ts';
import { queryRecording } from '../_shared/agoraCloudRecordingService.ts';

const HEARTBEAT_TIMEOUT_MS = 120_000;
const RECORDING_QUERY_THROTTLE_MS = 45_000;

function isAgoraNotFound(error: unknown): boolean {
  const anyErr = error as { status?: number; message?: string; raw?: string };
  const text = `${anyErr?.message || ''} ${anyErr?.raw || ''}`.toLowerCase();
  return anyErr?.status === 404 || text.includes('not found') || text.includes('not exist') || text.includes('invalid sid');
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: corsHeaders });
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405);

  try {
    const user = await requireUser(req);
    const body = await req.json().catch(() => ({}));
    const liveSessionId = body.live_session_id || body.liveSessionId || body.session_id || body.sessionId;
    if (!liveSessionId || typeof liveSessionId !== 'string') {
      return json({ error: 'Missing live_session_id' }, 400);
    }

    const admin = createAdminClient() as any;
    const { data: session, error } = await admin
      .from('live_sessions')
      .select('id, host_user_id, owner_id, status, mode, agora_channel_name, agora_channel, channel_name, recording_resource_id, resource_id, recording_sid, sid, recording_uid, recording_status, recording_last_query_at, ended_at')
      .eq('id', liveSessionId)
      .maybeSingle();
    if (error) throw error;
    if (!session) return json({ error: 'Live session not found' }, 404);
    if (session.host_user_id !== user.id && session.owner_id !== user.id) return json({ error: 'Forbidden' }, 403);

    const now = new Date().toISOString();
    if (['ending', 'recording_processing', 'recording_failed', 'ended'].includes(String(session.status || '')) || session.ended_at) {
      return json({ ok: true, status: session.status || 'ended', ended_at: session.ended_at || null });
    }

    const recovered = session.status === 'reconnecting';
    const heartbeatPatch: Record<string, unknown> = {
      status: recovered ? 'live' : session.status,
      last_host_heartbeat_at: now,
      last_seen_at: now,
      host_connection_status: 'online',
      last_host_reconnected_at: recovered ? now : undefined,
      updated_at: now,
    };
    await admin.from('live_sessions').update(heartbeatPatch)
      .eq('id', liveSessionId)
      .in('status', ['live', 'reconnecting', 'starting', 'created', 'recording', 'processing', 'processing_replay']);

    // B5-A′: KHÔNG ghi log nhịp thăm dò `heartbeat_received` (≈20k row/tuần, không ai đọc).
    // Chỉ ghi khi có chuyển trạng thái thật: host_reconnected.
    if (recovered) {
      await admin.from('live_session_events').insert({
        live_session_id: liveSessionId,
        from_status: session.status,
        to_status: 'live',
        source: 'live-heartbeat',
        reason: 'host_reconnected',
        payload: {
          live_session_id: liveSessionId,
          host_user_id: user.id,
          channel_name: session.agora_channel_name || session.agora_channel || session.channel_name || null,
          resource_id: session.recording_resource_id || session.resource_id || null,
          sid: session.recording_sid || session.sid || null,
          reason: 'host_reconnected',
          timestamp: now,
        },
      }).then(undefined, (eventError: unknown) => {
        console.warn('[live-heartbeat] event log failed', eventError);
      });
    }


    const resourceId = session.recording_resource_id || session.resource_id;
    const sid = session.recording_sid || session.sid;
    const channel = session.agora_channel_name || session.agora_channel || session.channel_name;
    const uid = session.recording_uid;
    const lastQueryMs = new Date(session.recording_last_query_at || 0).getTime();
    const shouldQueryRecording = session.recording_status === 'recording'
      && resourceId && sid && channel && uid
      && (!Number.isFinite(lastQueryMs) || Date.now() - lastQueryMs >= RECORDING_QUERY_THROTTLE_MS);
    if (shouldQueryRecording) {
      const queriedAt = new Date().toISOString();
      try {
        const response = await queryRecording(resourceId, sid, channel, uid);
        await admin.from('live_sessions').update({
          recording_last_query_at: queriedAt,
          last_agora_query_response: response,
          last_worker_response: response,
          updated_at: queriedAt,
        }).eq('id', liveSessionId);
        // B5-A′: KHÔNG ghi `cloud_recording_health_query` (thăm dò định kỳ 45s).
        // Snapshot phản hồi Agora vẫn lưu ở live_sessions.last_agora_query_response ở trên.
        // Trường hợp lỗi/not_found bên dưới VẪN ghi log vì đó là bất thường thật.

      } catch (queryError) {
        const message = queryError instanceof Error ? queryError.message : String(queryError);
        const notFound = isAgoraNotFound(queryError);
        await admin.from('live_sessions').update({
          recording_last_query_at: queriedAt,
          last_agora_query_response: { error: message, not_found: notFound },
          recording_error: notFound ? undefined : message,
          updated_at: queriedAt,
        }).eq('id', liveSessionId);
        await admin.from('live_session_events').insert({
          live_session_id: liveSessionId,
          from_status: recovered ? 'live' : session.status,
          to_status: recovered ? 'live' : session.status,
          source: 'live-heartbeat',
          reason: notFound ? 'cloud_recording_health_query_not_found' : 'cloud_recording_health_query_failed',
          payload: { live_session_id: liveSessionId, resource_id: resourceId, sid, error: message, timestamp: queriedAt },
        }).then(undefined, () => undefined);
      }
    }

    return json({ ok: true, status: recovered ? 'live' : session.status, timeout_ms: HEARTBEAT_TIMEOUT_MS });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return json({ error: message }, message === 'Unauthorized' ? 401 : 500);
  }
});

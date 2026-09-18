/* eslint-disable @typescript-eslint/no-explicit-any */
import { corsHeaders, createAdminClient, HttpError, json, normalizeError, requireUser } from '../_shared/httpAuth.ts';
import { ensureAgoraRecordingStarted } from '../_shared/agoraRecordingStarter.ts';

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: corsHeaders });
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405);

  const admin = createAdminClient() as any;
  try {
    const user = await requireUser(req);
    const body = await req.json().catch(() => ({}));
    const sessionId = body.live_session_id || body.sessionId || null;
    if (!sessionId) throw new HttpError(400, 'MISSING_SESSION_ID', 'Thiếu live_session_id');

    const { data: session, error } = await admin
      .from('live_sessions')
      .select('id, host_user_id, owner_id, user_id, mode, recording_status, recording_resource_id, recording_sid')
      .eq('id', sessionId)
      .maybeSingle();
    if (error) throw error;
    if (!session) throw new HttpError(404, 'SESSION_NOT_FOUND', 'Không tìm thấy phiên live');
    const ownerId = session.host_user_id || session.owner_id || session.user_id;
    if (ownerId !== user.id) throw new HttpError(403, 'FORBIDDEN', 'Không có quyền khởi động ghi hình phiên live này');

    const result = await ensureAgoraRecordingStarted(admin, sessionId, {
      source: 'live-webcam-recording-ensure',
      maxAttempts: 2,
    });

    return json({ ok: result.ok, ...result });
  } catch (error) {
    const normalized = normalizeError(error);
    const status = error instanceof HttpError ? error.status : 500;
    return json({ error: normalized.message, code: normalized.code || 'LIVE_WEBCAM_RECORDING_ENSURE_FAILED' }, status);
  }
});

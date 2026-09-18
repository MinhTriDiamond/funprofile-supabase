/* eslint-disable @typescript-eslint/no-explicit-any */
import { corsHeaders, createAdminClient, HttpError, json, normalizeError, requireUser } from '../_shared/httpAuth.ts';
import { forceEndLive } from '../_shared/liveEndService.ts';

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: corsHeaders });
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405);

  const admin = createAdminClient() as any;
  try {
    const user = await requireUser(req);
    const body = await req.json().catch(() => ({}));
    const sessionId = body.live_session_id || body.liveSessionId || body.session_id || body.sessionId;
    if (!sessionId || typeof sessionId !== 'string') {
      throw new HttpError(400, 'MISSING_SESSION_ID', 'Missing live_session_id');
    }

    const ALLOWED_REASONS = new Set([
      'host_clicked_end',
      'host_pagehide',
      'host_hidden_timeout',
      'host_network_lost',
      'route_change',
      'logout',
    ]);
    const rawReason = typeof body.reason === 'string' ? body.reason : '';
    const reason = ALLOWED_REASONS.has(rawReason) ? rawReason : 'host_clicked_end';

    const result = await forceEndLive(admin, sessionId, reason, {
      actorUserId: user.id,
      source: 'live-webcam-stop',
    });

    if (result.error === 'forbidden') return json({ error: 'Forbidden' }, 403);
    if (result.error === 'not_found') return json({ error: 'Live session not found' }, 404);
    return json(result as Record<string, unknown>);
  } catch (error) {
    const normalized = normalizeError(error);
    console.error('[live-webcam-stop] failed', normalized);
    const status = error instanceof HttpError ? error.status : 500;
    return json({ error: normalized.message, code: normalized.code || 'LIVE_WEBCAM_STOP_FAILED' }, status);
  }
});

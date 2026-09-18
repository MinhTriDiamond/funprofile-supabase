/* eslint-disable @typescript-eslint/no-explicit-any */
import { corsHeaders, createAdminClient, json, requireUser } from '../_shared/httpAuth.ts';
import { forceEndLive } from '../_shared/liveEndService.ts';

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: corsHeaders });
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405);

  try {
    const user = await requireUser(req);
    const body = await req.json().catch(() => ({}));
    const liveSessionId = body.live_session_id || body.liveSessionId || body.session_id || body.sessionId;
    const reason = typeof body.reason === 'string' && body.reason.trim()
      ? body.reason.trim()
      : 'host_clicked_end';
    if (!liveSessionId || typeof liveSessionId !== 'string') {
      return json({ error: 'Missing live_session_id' }, 400);
    }

    const admin = createAdminClient() as any;
    const result = await forceEndLive(admin, liveSessionId, reason, {
      actorUserId: user.id,
      source: 'live-end',
    });

    if (result.error === 'forbidden') return json({ error: 'Forbidden' }, 403);
    if (result.error === 'not_found') return json({ error: 'Live session not found' }, 404);
    return json(result as Record<string, unknown>);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return json({ error: message }, message === 'Unauthorized' ? 401 : 500);
  }
});

/* eslint-disable @typescript-eslint/no-explicit-any */
import { createClient } from 'npm:@supabase/supabase-js@2';
import { corsHeaders, createAdminClient, json } from '../_shared/httpAuth.ts';
import { forceEndLive, sessionNeedsForceEnd } from '../_shared/liveEndService.ts';

async function requireCronOrAdmin(req: Request) {
  const cronSecret = Deno.env.get('CRON_SHARED_SECRET') || Deno.env.get('CRON_SECRET');
  const provided = req.headers.get('X-Cron-Secret') || req.headers.get('x-cron-secret');
  const admin = createAdminClient() as any;
  if (cronSecret && provided === cronSecret) return { ok: true as const, admin };

  const authHeader = req.headers.get('Authorization') || req.headers.get('authorization');
  const anonKey = (Deno.env.get('SUPABASE_PUBLISHABLE_KEY') ?? Deno.env.get('SUPABASE_ANON_KEY')) || '';
  if (!authHeader && !cronSecret) return { ok: true as const, admin };
  if (!authHeader?.startsWith('Bearer ')) return { ok: false as const, status: 401, error: 'Unauthorized' };

  const token = authHeader.slice('Bearer '.length).trim();
  if (token && token === anonKey) return { ok: true as const, admin };

  const client = createClient(Deno.env.get('SUPABASE_URL')!, anonKey, {
    global: { headers: { Authorization: authHeader } },
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const { data: { user }, error } = await client.auth.getUser();
  if (error || !user) return { ok: false as const, status: 401, error: 'Unauthorized' };
  const { data: isAdmin } = await admin.rpc('has_role', { _user_id: user.id, _role: 'admin' });
  if (!isAdmin) return { ok: false as const, status: 403, error: 'Forbidden' };
  return { ok: true as const, admin };
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: corsHeaders });
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405);

  const guard = await requireCronOrAdmin(req);
  if (!guard.ok) return json({ error: guard.error }, guard.status);
  const admin = guard.admin as any;

  try {
    const body = await req.json().catch(() => ({}));
    const limit = Math.max(1, Math.min(100, Number(body.limit || 50)));
    const nowMs = Date.now();
    // Policy 60s đồng nhất (07/2026): mark `reconnecting` khi heartbeat trễ ≥ 30s
    // để UI phản ánh nhanh, force-end khi ≥ 60s.
    const reconnectCutoff = new Date(nowMs - 30_000).toISOString();
    const heartbeatCutoff = new Date(nowMs - 60_000).toISOString();
    const endingCutoff = new Date(nowMs - 60_000).toISOString();
    const longLiveCutoff = new Date(nowMs - 24 * 60 * 60 * 1000).toISOString();

    const { data: reconnectRows } = await admin
      .from('live_sessions')
      .select('id, status, last_seen_at, last_host_heartbeat_at, updated_at')
      .eq('mode', 'agora_webcam')
      .in('status', ['live', 'starting', 'created', 'recording', 'processing', 'processing_replay'])
      .or(`last_seen_at.lte.${reconnectCutoff},and(last_seen_at.is.null,last_host_heartbeat_at.lte.${reconnectCutoff}),and(last_seen_at.is.null,last_host_heartbeat_at.is.null,updated_at.lte.${reconnectCutoff})`)
      .limit(limit);

    for (const session of reconnectRows || []) {
      const heartbeatMs = new Date(session.last_seen_at || session.last_host_heartbeat_at || session.updated_at || 0).getTime();
      if (Number.isFinite(heartbeatMs) && nowMs - heartbeatMs >= 60_000) continue;
      const markedAt = new Date().toISOString();
      await admin.from('live_sessions').update({
        status: 'reconnecting',
        host_connection_status: 'reconnecting',
        last_disconnected_at: session.last_seen_at || session.last_host_heartbeat_at || session.updated_at || markedAt,
        updated_at: markedAt,
      }).eq('id', session.id).in('status', ['live', 'starting', 'created', 'recording', 'processing', 'processing_replay']);
      await admin.from('live_session_events').insert({
        live_session_id: session.id,
        from_status: session.status,
        to_status: 'reconnecting',
        source: 'live-zombie-cleanup',
        reason: 'host_reconnecting',
        payload: { live_session_id: session.id, timestamp: markedAt, reconnect_grace_ms: 30_000 },
      }).then(undefined, () => undefined);
    }

    const { data: rows, error } = await admin
      .from('live_sessions')
      .select('*')
      .eq('mode', 'agora_webcam')
      .or([
        `and(status.in.(live,reconnecting,starting,created,recording,processing,processing_replay),last_seen_at.lte.${heartbeatCutoff})`,
        `and(status.in.(live,reconnecting,starting,created,recording,processing,processing_replay),last_seen_at.is.null,last_host_heartbeat_at.lte.${heartbeatCutoff})`,
        `and(status.in.(live,reconnecting,starting,created,recording,processing,processing_replay),last_seen_at.is.null,last_host_heartbeat_at.is.null,updated_at.lte.${heartbeatCutoff})`,
        `and(status.eq.ending,updated_at.lte.${endingCutoff})`,
        `and(status.eq.ended,recording_stopped_at.is.null,recording_sid.not.is.null)`,
        `and(status.eq.live,started_at.lte.${longLiveCutoff})`,
      ].join(','))
      .order('updated_at', { ascending: true })
      .limit(limit);
    if (error) throw error;

    const candidates = (rows || []).filter((row: any) => sessionNeedsForceEnd(row, nowMs));
    const results: Array<Record<string, unknown>> = [];

    for (const session of candidates) {
      const timeout = session.status !== 'ended' && (
        (!session.last_seen_at && !session.last_host_heartbeat_at) ||
        new Date(session.last_seen_at || session.last_host_heartbeat_at).getTime() <= new Date(heartbeatCutoff).getTime()
      );
      const reason = timeout ? 'host_disconnected_timeout' : 'zombie_cleanup';
      await admin.from('live_session_events').insert({
        live_session_id: session.id,
        from_status: session.status,
        to_status: 'ending',
        source: 'live-zombie-cleanup',
        reason: timeout ? 'heartbeat_timeout' : 'zombie_cleanup_triggered',
        payload: {
          live_session_id: session.id,
          host_user_id: session.host_user_id || session.owner_id || null,
          channel_name: session.agora_channel_name || session.agora_channel || session.channel_name || null,
          resource_id: session.recording_resource_id || session.resource_id || null,
          sid: session.recording_sid || session.sid || null,
          reason,
          timestamp: new Date().toISOString(),
        },
      }).then(undefined, () => undefined);
      results.push(await forceEndLive(admin, session.id, reason, { source: 'live-zombie-cleanup' }));
    }

    return json({ ok: true, scanned: rows?.length || 0, candidates: candidates.length, results });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error('[live-zombie-cleanup] fatal', message);
    return json({ error: message }, 500);
  }
});

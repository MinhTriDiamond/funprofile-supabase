/* eslint-disable @typescript-eslint/no-explicit-any */
import { createClient } from 'npm:@supabase/supabase-js@2';
import { corsHeaders, createAdminClient, json } from '../_shared/httpAuth.ts';
import { forceEndLive, sessionNeedsForceEnd } from '../_shared/liveEndService.ts';

const RECONNECT_GRACE_MS = 120_000;
const AUTO_END_TIMEOUT_MS = 5 * 60_000;
const ACTIVE_STATUSES = [
  'live',
  'reconnecting',
  'starting',
  'created',
  'recording',
  'ending',
  'processing',
  'processing_replay',
];

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

function heartbeatMs(session: any): number {
  return new Date(
    session.last_seen_at
      || session.last_host_heartbeat_at
      || session.updated_at
      || session.started_at
      || 0,
  ).getTime();
}

function heartbeatAgeMs(session: any, nowMs: number): number {
  const ts = heartbeatMs(session);
  return Number.isFinite(ts) ? nowMs - ts : Number.POSITIVE_INFINITY;
}

async function logEvent(admin: any, session: any, reason: string, toStatus: string, payload: Record<string, unknown>) {
  await admin.from('live_session_events').insert({
    live_session_id: session.id,
    from_status: session.status || null,
    to_status: toStatus,
    source: 'live-session-watchdog',
    reason,
    payload: {
      live_session_id: session.id,
      host_user_id: session.host_user_id || session.owner_id || session.user_id || null,
      heartbeat_age_ms: payload.heartbeat_age_ms,
      reconnect_grace_ms: RECONNECT_GRACE_MS,
      auto_end_timeout_ms: AUTO_END_TIMEOUT_MS,
      timestamp: new Date().toISOString(),
      ...payload,
    },
  }).then(undefined, (error: unknown) => {
    console.warn('[live-session-watchdog] event log failed', error);
  });
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: corsHeaders });
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405);

  const guard = await requireCronOrAdmin(req);
  if (!guard.ok) return json({ error: guard.error }, guard.status);
  const admin = guard.admin as any;

  try {
    const body = await req.json().catch(() => ({}));
    const limit = Math.max(1, Math.min(200, Number(body.limit || 100)));
    const nowMs = Date.now();
    const nowIso = new Date(nowMs).toISOString();

    const { data: activeRows, error: activeError } = await admin
      .from('live_sessions')
      .select('*')
      .eq('mode', 'agora_webcam')
      .is('ended_at', null)
      .in('status', ACTIVE_STATUSES)
      .order('updated_at', { ascending: true })
      .limit(limit);
    if (activeError) throw activeError;

    const reconnected: any[] = [];
    const autoEnded: any[] = [];
    const sourceDown: any[] = [];
    const ignored: any[] = [];

    for (const session of activeRows || []) {
      const ageMs = heartbeatAgeMs(session, nowMs);

      // Nhánh mới: webcam đang 'live' nhưng source_connected=false + heartbeat > 5 phút
      // → nguồn đã tắt, không chờ reconnect nữa, force-end ngay.
      if (
        session.status === 'live'
        && session.source_connected === false
        && ageMs >= AUTO_END_TIMEOUT_MS
      ) {
        await logEvent(admin, session, 'webcam_source_down_timeout', 'ending', {
          heartbeat_age_ms: ageMs,
          previous_status: session.status,
          source_connected: false,
        });
        const result = await forceEndLive(admin, session.id, 'webcam_source_down_timeout', {
          source: 'live-session-watchdog',
        });
        sourceDown.push({ id: session.id, heartbeat_age_ms: ageMs, result });
        continue;
      }

      if (ageMs < RECONNECT_GRACE_MS) {
        ignored.push({ id: session.id, status: session.status, heartbeat_age_ms: ageMs, decision: 'fresh' });
        continue;
      }

      if (ageMs >= AUTO_END_TIMEOUT_MS) {
        await logEvent(admin, session, 'host_disconnected_timeout_detected', 'ending', {
          heartbeat_age_ms: ageMs,
          previous_status: session.status,
        });
        const result = await forceEndLive(admin, session.id, 'host_disconnected_timeout', {
          source: 'live-session-watchdog',
        });
        autoEnded.push({ id: session.id, heartbeat_age_ms: ageMs, result });
        continue;
      }

      if (session.status !== 'reconnecting') {
        const { data: updated } = await admin
          .from('live_sessions')
          .update({
            status: 'reconnecting',
            host_connection_status: 'reconnecting',
            last_disconnected_at: session.last_seen_at || session.last_host_heartbeat_at || session.updated_at || nowIso,
            updated_at: nowIso,
          })
          .eq('id', session.id)
          .is('ended_at', null)
          .in('status', ['live', 'starting', 'created', 'recording', 'processing', 'processing_replay'])
          .select('id, status')
          .maybeSingle();
        if (updated) {
          await logEvent(admin, session, 'host_reconnecting', 'reconnecting', {
            heartbeat_age_ms: ageMs,
            previous_status: session.status,
          });
          reconnected.push({ id: session.id, heartbeat_age_ms: ageMs });
        }
      } else {
        ignored.push({ id: session.id, status: session.status, heartbeat_age_ms: ageMs, decision: 'already_reconnecting' });
      }
    }

    const { data: recordingCleanupRows } = await admin
      .from('live_sessions')
      .select('*')
      .eq('mode', 'agora_webcam')
      .eq('status', 'ended')
      .is('recording_stopped_at', null)
      .not('recording_sid', 'is', null)
      .order('updated_at', { ascending: true })
      .limit(Math.max(1, Math.min(50, limit)));

    const recordingCleanup: any[] = [];
    for (const session of recordingCleanupRows || []) {
      if (!sessionNeedsForceEnd(session, nowMs)) continue;
      const result = await forceEndLive(admin, session.id, 'zombie_cleanup', {
        source: 'live-session-watchdog',
      });
      recordingCleanup.push({ id: session.id, result });
    }

    return json({
      ok: true,
      reconnect_grace_ms: RECONNECT_GRACE_MS,
      auto_end_timeout_ms: AUTO_END_TIMEOUT_MS,
      scanned: activeRows?.length || 0,
      reconnected_count: reconnected.length,
      auto_ended_count: autoEnded.length,
      source_down_count: sourceDown.length,
      recording_cleanup_count: recordingCleanup.length,
      reconnected,
      auto_ended: autoEnded,
      source_down: sourceDown,
      recording_cleanup: recordingCleanup,
      ignored_count: ignored.length,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error('[live-session-watchdog] fatal', message);
    return json({ error: message }, 500);
  }
});

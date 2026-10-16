/* eslint-disable @typescript-eslint/no-explicit-any */
import { createClient } from 'npm:@supabase/supabase-js@2';
import { corsHeaders, createAdminClient, json } from '../_shared/httpAuth.ts';
import { forceEndLive } from '../_shared/liveEndService.ts';
import { getLiveMaxDurationMinutes, isLiveDurationExpired } from '../_shared/liveDurationPolicy.ts';
import { isRtmpSessionEndedOrFrozen } from '../_shared/rtmpSessionStatus.ts';
import { shouldWatchdogForceEnd } from '../_shared/liveWatchdogIdempotency.ts';

const ACTIVE_STATUSES = [
  'live',
  'starting',
  'created',
  'recording',
  'processing',
  'processing_replay',
  'disconnect_grace',
  'source_connected',
  'ready_to_go_live',
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
    const webcamCutoff = new Date(nowMs - getLiveMaxDurationMinutes('agora_webcam') * 60_000).toISOString();
    const rtmpCutoff = new Date(nowMs - getLiveMaxDurationMinutes('rtmp_obs') * 60_000).toISOString();

    const { data: rows, error } = await admin
      .from('live_sessions')
      .select('*')
      .in('status', ACTIVE_STATUSES)
      .is('ended_at', null)
      .or(`and(mode.eq.agora_webcam,started_at.lte.${webcamCutoff}),and(mode.eq.rtmp_obs,started_at.lte.${rtmpCutoff})`)
      .order('started_at', { ascending: true })
      .limit(limit);
    if (error) throw error;

    const candidates = (rows || []).filter((session: any) => {
      if (!session?.started_at) return false;
      // B5-B: phiên đã settled (ended_at / status cuối / replay đã đăng) KHÔNG force-end lại.
      if (!shouldWatchdogForceEnd(session)) return false;
      if (session.mode === 'rtmp_obs' && isRtmpSessionEndedOrFrozen(session)) return false;
      return isLiveDurationExpired(session.started_at, session.mode, nowMs);
    });

    const results: Array<Record<string, unknown>> = [];
    for (const session of candidates) {
      const result = await forceEndLive(admin, session.id, 'duration_limit', { source: 'live-duration-watchdog' });
      if (session.mode !== 'rtmp_obs' || (result as any).idempotent !== true) {
        await admin.from('live_session_events').insert({
          live_session_id: session.id,
          from_status: session.status,
          to_status: 'ending',
          source: 'live-duration-watchdog',
          reason: 'duration_limit_triggered',
          payload: {
            live_session_id: session.id,
            mode: session.mode || 'agora_webcam',
            max_duration_minutes: getLiveMaxDurationMinutes(session.mode),
            started_at: session.started_at,
            timestamp: new Date().toISOString(),
          },
        }).then(undefined, () => undefined);
      }
      results.push(result);
    }

    // Nhánh phụ: webcam mode mất heartbeat > 8 phút (16 nhịp 30s) ⇒ force-end
    // Tránh user đóng tab/sập mạng mà recording chạy vô ích hàng giờ tới khi trần 2h kích hoạt.
    // Không áp dụng RTMP (OBS không gửi heartbeat HTTP).
    const heartbeatCutoff = new Date(nowMs - 60_000).toISOString();
    const { data: hbRows } = await admin
      .from('live_sessions')
      .select('id, status, mode, started_at, last_host_heartbeat_at')
      .eq('mode', 'agora_webcam')
      .in('status', ['live', 'reconnecting', 'starting', 'recording', 'processing'])
      .is('ended_at', null)
      .lt('last_host_heartbeat_at', heartbeatCutoff)
      .order('last_host_heartbeat_at', { ascending: true })
      .limit(limit);

    const alreadyEnded = new Set(candidates.map((c: any) => c.id));
    const hbCandidates = (hbRows || []).filter((s: any) => !alreadyEnded.has(s.id) && shouldWatchdogForceEnd(s));

    for (const session of hbCandidates) {
      await admin.from('live_session_events').insert({
        live_session_id: session.id,
        from_status: session.status,
        to_status: 'ending',
        source: 'live-duration-watchdog',
        reason: 'heartbeat_lost',
        payload: {
          live_session_id: session.id,
          mode: session.mode,
          last_host_heartbeat_at: session.last_host_heartbeat_at,
          threshold_seconds: 60,
          timestamp: new Date().toISOString(),
        },
      }).then(undefined, () => undefined);

      results.push(await forceEndLive(admin, session.id, 'heartbeat_lost', { source: 'live-duration-watchdog' }));
    }

    return json({
      ok: true,
      scanned: rows?.length || 0,
      candidates: candidates.length,
      heartbeat_lost: hbCandidates.length,
      results,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error('[live-duration-watchdog] fatal', message);
    return json({ error: message }, 500);
  }
});

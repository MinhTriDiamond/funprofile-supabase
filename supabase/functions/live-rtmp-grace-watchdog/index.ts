/* eslint-disable @typescript-eslint/no-explicit-any */
import { createClient } from 'npm:@supabase/supabase-js@2';
import { endRtmpLiveSession, getDisconnectGraceSeconds, getDisconnectGraceMinutes } from '../_shared/rtmpEndLiveService.ts';
import { detectRtmpLiveConnection } from '../_shared/cloudflareStreamService.ts';


const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

function json(body: Record<string, unknown>, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

function getMaxSessionHours(): number {
  // Default 4h — trùng với RTMP_LIVE_MAX_DURATION_MINUTES (FE tự end trước, đây là lưới an toàn).
  const raw = Number(Deno.env.get('RTMP_MAX_SESSION_HOURS') || '4');
  return Number.isFinite(raw) && raw > 0 ? raw : 4;
}

function getStaleNullMinutes(): number {
  const raw = Number(Deno.env.get('RTMP_STALE_NULL_MINUTES') || '30');
  return Number.isFinite(raw) && raw > 0 ? raw : 30;
}

async function requireAdminOrCron(req: Request) {
  const cronSecret = Deno.env.get('CRON_SHARED_SECRET') || Deno.env.get('CRON_SECRET');
  const provided = req.headers.get('X-Cron-Secret') || req.headers.get('x-cron-secret');
  if (cronSecret && provided && provided === cronSecret) {
    return {
      ok: true as const,
      admin: createClient(
        Deno.env.get('SUPABASE_URL')!,
        (Deno.env.get('SUPABASE_SECRET_KEY') ?? Deno.env.get('SUPABASE_SERVICE_ROLE_KEY'))!,
        { auth: { autoRefreshToken: false, persistSession: false } },
      ),
    };
  }
  const authHeader = req.headers.get('Authorization');
  if (!authHeader?.startsWith('Bearer ')) return { ok: false as const, status: 401, error: 'Unauthorized' };
  const token = authHeader.slice('Bearer '.length).trim();
  const anonKey = (Deno.env.get('SUPABASE_PUBLISHABLE_KEY') ?? Deno.env.get('SUPABASE_ANON_KEY'))!;
  const admin = createClient(
    Deno.env.get('SUPABASE_URL')!,
    (Deno.env.get('SUPABASE_SECRET_KEY') ?? Deno.env.get('SUPABASE_SERVICE_ROLE_KEY'))!,
    { auth: { autoRefreshToken: false, persistSession: false } },
  );
  // Cron gửi anon key trực tiếp như Bearer
  if (token === anonKey) return { ok: true as const, admin };
  const userClient = createClient(Deno.env.get('SUPABASE_URL')!, anonKey, {
    global: { headers: { Authorization: authHeader } },
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const { data: { user }, error } = await userClient.auth.getUser();
  if (error || !user) return { ok: false as const, status: 401, error: 'Unauthorized' };
  const { data: isAdmin } = await admin.rpc('has_role', { _user_id: user.id, _role: 'admin' });
  if (!isAdmin) return { ok: false as const, status: 403, error: 'Forbidden' };
  return { ok: true as const, admin };
}

async function notifyAutoEnded(admin: any, session: any, reason: string) {
  const userId = session.owner_id || session.host_user_id || session.user_id;
  if (!userId) return;
  // Idempotent: 1 noti / session
  const { data: existing } = await admin
    .from('notifications')
    .select('id')
    .eq('user_id', userId)
    .eq('type', 'live_auto_ended')
    .eq('metadata->>live_session_id', session.id)
    .maybeSingle();
  if (existing) return;
  const minutes = getDisconnectGraceMinutes();
  const body =
    reason === 'max_duration_exceeded'
      ? `Buổi live đã vượt quá ${getMaxSessionHours()} giờ nên hệ thống tự kết thúc. Bản ghi sẽ được lưu và đăng lên trang cá nhân sau ít phút.`
      : reason === 'source_disconnected_no_active_video'
        ? `Cloudflare không còn nhận tín hiệu video từ OBS quá ${Math.max(minutes * 2, 6)} phút nên buổi live đã tự kết thúc. Bản ghi sẽ được lưu và đăng lên trang cá nhân sau ít phút.`
        : `Nguồn OBS mất kết nối quá ${minutes} phút nên buổi live đã tự kết thúc. Bản ghi sẽ được lưu và đăng lên trang cá nhân sau ít phút.`;
  await admin.from('notifications').insert({
    user_id: userId,
    type: 'live_auto_ended',
    title: 'Live của bạn đã tự kết thúc',
    body,
    metadata: {
      live_session_id: session.id,
      post_id: session.post_id || session.live_post_id || null,
      reason,
      grace_minutes: minutes,
    },
  });
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: corsHeaders });
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405);

  const guard = await requireAdminOrCron(req);
  if (!guard.ok) return json({ error: guard.error }, guard.status);
  const admin = guard.admin as any;

  try {
    const graceSeconds = getDisconnectGraceSeconds();
    const minutes = getDisconnectGraceMinutes();
    const maxHours = getMaxSessionHours();
    const nowMs = Date.now();
    const nowIso = new Date(nowMs).toISOString();
    const graceCutoff = new Date(nowMs - graceSeconds * 1000).toISOString();
    // Fallback cutoff: webhook có thể miss disconnect event → quét status='live' mà
    // last_source_seen_at/last_connection_check_at quá 2 * grace, verify Cloudflare API trước khi end.
    const fallbackCutoff = new Date(nowMs - graceSeconds * 2 * 1000).toISOString();
    const maxDurationCutoff = new Date(nowMs - maxHours * 3600 * 1000).toISOString();

    // 1) Legacy auto_end_at expired
    const { data: legacy } = await admin
      .from('live_sessions')
      .select('*')
      .eq('mode', 'rtmp_obs')
      .eq('status', 'live')
      .not('auto_end_at', 'is', null)
      .lte('auto_end_at', nowIso)
      .limit(50);

    // 2) disconnect_grace state machine expired
    const { data: graceExpired } = await admin
      .from('live_sessions')
      .select('*')
      .eq('mode', 'rtmp_obs')
      .eq('status', 'disconnect_grace')
      .not('last_disconnected_at', 'is', null)
      .lte('last_disconnected_at', graceCutoff)
      .limit(50);

    // 3) Stale live: status='live' nhưng last_source_seen_at/last_connection_check_at quá cũ
    //    (webhook miss disconnect event). Sẽ recheck Cloudflare bên dưới.
    const { data: stalePublic } = await admin
      .from('live_sessions')
      .select('*')
      .eq('mode', 'rtmp_obs')
      .eq('status', 'live')
      .is('auto_end_at', null)
      .or(`last_source_seen_at.lte.${fallbackCutoff},last_connection_check_at.lte.${fallbackCutoff}`)
      .not('cloudflare_live_input_id', 'is', null)
      .limit(50);

    // 3b) Stale-NULL: status='live' nhưng CẢ last_source_seen_at LẪN last_disconnected_at đều NULL
    //     (persistent live input + webhook miss disconnect ngay từ đầu). Threshold = STALE_NULL_MINUTES.
    const staleNullCutoff = new Date(nowMs - getStaleNullMinutes() * 60 * 1000).toISOString();
    const { data: staleNull } = await admin
      .from('live_sessions')
      .select('*')
      .eq('mode', 'rtmp_obs')
      .eq('status', 'live')
      .is('auto_end_at', null)
      .is('last_source_seen_at', null)
      .is('last_disconnected_at', null)
      .lte('started_at', staleNullCutoff)
      .not('cloudflare_live_input_id', 'is', null)
      .limit(50);

    // 4) Trần thời lượng tuyệt đối: bất kể detection trả gì, đóng cứng
    const { data: maxDurationExpired } = await admin
      .from('live_sessions')
      .select('*')
      .eq('mode', 'rtmp_obs')
      .eq('status', 'live')
      .lte('started_at', maxDurationCutoff)
      .limit(50);

    // Verify nhánh stalePublic với Cloudflare API trước khi end:
    // - Coi là CÒN live chỉ khi inputConnected && videoStreaming (cả 2 đều true).
    // - Nếu Cloudflare soft-fail → bỏ qua phiên này, đợi tick sau.
    const verifiedFallback: any[] = [];
    const keptAlive: any[] = [];
    // Gộp stalePublic + staleNull, dedupe theo id, áp dụng cùng quy tắc verify strict
    const stalePool = new Map<string, any>();
    for (const s of stalePublic || []) stalePool.set(s.id, s);
    for (const s of staleNull || []) if (!stalePool.has(s.id)) stalePool.set(s.id, s);
    for (const s of stalePool.values()) {
      try {
        const detection = await detectRtmpLiveConnection(s, { skewSeconds: 60 });
        const reasonStr = (detection as any).reason || '';
        if (reasonStr === 'cloudflare_soft_fail' || reasonStr === 'unknown_input_state') {
          console.log('[grace-watchdog] skip cloudflare_soft_fail', s.id);
          continue;
        }
        const inputConnected = !!(detection as any).inputConnected;
        const videoStreaming = !!(detection as any).videoStreaming;
        if (inputConnected || videoStreaming) {
          await admin
            .from('live_sessions')
            .update({
              last_source_seen_at: nowIso,
              last_connection_check_at: nowIso,
              connection_status: 'connected',
              source_connected: true,
              updated_at: nowIso,
            })
            .eq('id', s.id);
          keptAlive.push({ session_id: s.id, reason: inputConnected ? 'input_connected' : 'current_session_video_active' });
          continue;
        }
        if (!(detection as any).confirmedDisconnected || (detection as any).errors?.length) continue;
        // input "connected" nhưng KHÔNG có active video — case stuck của persistent input
        verifiedFallback.push({ session: s, detection });
      } catch (e) {
        console.warn('[grace-watchdog] detect failed', s.id, e instanceof Error ? e.message : String(e));
      }
    }

    // Merge danh sách xử lý end. Tag mỗi session với reason rõ ràng.
    const toEnd: Array<{ session: any; reason: string }> = [];
    for (const s of legacy || []) toEnd.push({ session: s, reason: 'disconnect_timeout' });
    for (const s of graceExpired || []) toEnd.push({ session: s, reason: 'disconnect_timeout' });
    for (const v of verifiedFallback) toEnd.push({ session: v.session, reason: 'source_disconnected_no_active_video' });
    for (const s of maxDurationExpired || []) {
      if (!toEnd.some((t) => t.session.id === s.id)) toEnd.push({ session: s, reason: 'max_duration_exceeded' });
    }

    const results: Array<Record<string, unknown>> = [];
    for (const { session, reason } of toEnd) {
      try {
        // Recheck cuối cùng cho nhánh KHÔNG phải max_duration (không bao giờ recheck cho max_duration)
        if (reason !== 'max_duration_exceeded' && session.cloudflare_live_input_id) {
          let detection: any = null;
          try {
            detection = await detectRtmpLiveConnection(session, { skewSeconds: 60 });
          } catch (error) {
            console.warn('[grace-watchdog] skip end: final Cloudflare recheck failed', {
              live_session_id: session.id,
              error: error instanceof Error ? error.message : String(error),
            });
            results.push({ session_id: session.id, ok: true, skipped: 'cloudflare_recheck_failed', reason });
            continue;
          }

          const inputConnected = !!(detection as any).inputConnected;
          const videoStreaming = !!(detection as any).videoStreaming;
          const confirmedDisconnected = !!(detection as any).confirmedDisconnected;
          const hasReadError = (detection as any).errors?.length > 0
            || detection.reason === 'cloudflare_soft_fail'
            || detection.reason === 'unknown_input_state';
          if (inputConnected || videoStreaming) {
            await admin.from('live_sessions').update({
              status: session.post_id || session.live_post_id
                ? 'live'
                : (session.title?.trim() && session.description?.trim() ? 'ready_to_go_live' : 'source_connected'),
              connection_status: 'connected',
              source_connected: true,
              last_disconnected_at: null,
              last_source_seen_at: nowIso,
              last_connection_check_at: nowIso,
              auto_end_at: null,
              live_input_status: 'live',
              updated_at: nowIso,
            }).eq('id', session.id);
            keptAlive.push({ session_id: session.id, reason: inputConnected ? 'recheck_input_connected' : 'recheck_current_session_video_active' });
            results.push({ session_id: session.id, ok: true, skipped: 'source_reconnected', detection_reason: detection.reason, reason });
            continue;
          }
          if (!confirmedDisconnected || hasReadError) {
            results.push({ session_id: session.id, ok: true, skipped: 'cloudflare_disconnect_not_confirmed', reason });
            continue;
          }
        }

        const r = await endRtmpLiveSession(admin, session, reason);
        await notifyAutoEnded(admin, session, reason).catch((e) => console.warn('[grace-watchdog] notify failed', String(e)));
        console.log('[grace-watchdog] force_end', { session_id: session.id, reason, ...r });
        results.push({ session_id: session.id, reason, ...r });
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        console.error('[grace-watchdog] end failed', session.id, msg);
        results.push({ session_id: session.id, ok: false, error: msg, reason });
      }
    }

    const summary = {
      ok: true,
      scanned: {
        legacy: (legacy || []).length,
        grace_expired: (graceExpired || []).length,
        stale_public: (stalePublic || []).length,
        stale_null: (staleNull || []).length,
        max_duration_expired: (maxDurationExpired || []).length,
      },
      ended: results.filter((r) => !r.skipped && !r.error).length,
      kept_alive: keptAlive.length,
      results,
      kept_alive_details: keptAlive,
      grace_minutes: minutes,
      grace_seconds: graceSeconds,
      max_session_hours: maxHours,
    };
    console.log('[grace-watchdog] summary', summary);
    return json(summary);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error('[grace-watchdog] fatal', msg);
    return json({ error: msg }, 500);
  }
});

/* eslint-disable @typescript-eslint/no-explicit-any */
import { createClient } from 'npm:@supabase/supabase-js@2';
import { endRtmpLiveSession, getDisconnectGraceSeconds, getDisconnectGraceMinutes, retryPendingRtmpLiveInputDisables, type RtmpEndReason } from '../_shared/rtmpEndLiveService.ts';
import { RTMP_END_CLAIM_LEASE_MS } from '../_shared/rtmpEndTransition.ts';
import { safeErrorText } from '../_shared/safeErrorText.ts';
import { detectRtmpLiveConnection } from '../_shared/cloudflareStreamService.ts';
import { classifyRtmpVideoSignal } from '../_shared/rtmpDisconnectPolicy.ts';
import { reconcileRtmpSessionVideoSignal } from '../_shared/rtmpVideoSignalGraceService.ts';


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
        ? `Cloudflare không còn nhận tín hiệu video từ OBS quá ${minutes} phút nên buổi live đã tự kết thúc. Bản ghi sẽ được lưu và đăng lên trang cá nhân sau ít phút.`
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
    const staleEndClaimCutoff = new Date(nowMs - RTMP_END_CLAIM_LEASE_MS).toISOString();

    // A worker can die after claiming `ending`. Reclaim only claims older than
    // the bounded lease; active workers keep exclusive ownership until then.
    const { data: staleEnding, error: staleEndingError } = await admin
      .from('live_sessions')
      .select('*')
      .eq('mode', 'rtmp_obs')
      .eq('status', 'ending')
      .is('ended_at', null)
      .lt('updated_at', staleEndClaimCutoff)
      .order('updated_at', { ascending: true })
      .limit(30);
    if (staleEndingError) throw staleEndingError;

    // 1) Legacy auto_end_at expired
    const { data: legacy, error: legacyError } = await admin
      .from('live_sessions')
      .select('*')
      .eq('mode', 'rtmp_obs')
      .eq('status', 'live')
      .not('auto_end_at', 'is', null)
      .lte('auto_end_at', nowIso)
      .limit(50);
    if (legacyError) throw legacyError;

    // 2) disconnect_grace state machine expired
    const { data: graceExpired, error: graceExpiredError } = await admin
      .from('live_sessions')
      .select('*')
      .eq('mode', 'rtmp_obs')
      .eq('status', 'disconnect_grace')
      .not('last_disconnected_at', 'is', null)
      .lte('last_disconnected_at', graceCutoff)
      .limit(50);
    if (graceExpiredError) throw graceExpiredError;

    // 3) Stale live: status='live' nhưng last_source_seen_at/last_connection_check_at quá cũ
    //    (webhook miss disconnect event). Sẽ recheck Cloudflare bên dưới.
    const { data: stalePublic, error: stalePublicError } = await admin
      .from('live_sessions')
      .select('*')
      .eq('mode', 'rtmp_obs')
      .eq('status', 'live')
      .is('auto_end_at', null)
      .or(`last_source_seen_at.lte.${fallbackCutoff},last_connection_check_at.lte.${fallbackCutoff}`)
      .not('cloudflare_live_input_id', 'is', null)
      .limit(50);
    if (stalePublicError) throw stalePublicError;

    // 3b) Stale-NULL: status='live' nhưng CẢ last_source_seen_at LẪN last_disconnected_at đều NULL
    //     (persistent live input + webhook miss disconnect ngay từ đầu). Threshold = STALE_NULL_MINUTES.
    const staleNullCutoff = new Date(nowMs - getStaleNullMinutes() * 60 * 1000).toISOString();
    const { data: staleNull, error: staleNullError } = await admin
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
    if (staleNullError) throw staleNullError;

    const { data: pendingNoVideo, error: pendingNoVideoError } = await admin
      .from('live_sessions')
      .select('*')
      .eq('mode', 'rtmp_obs')
      .in('status', ['live', 'disconnect_grace', 'reconnecting'])
      .is('ended_at', null)
      .not('video_signal_lost_at', 'is', null)
      .order('video_signal_lost_at', { ascending: true })
      .limit(50);
    if (pendingNoVideoError) throw pendingNoVideoError;

    // 4) Trần thời lượng tuyệt đối: bất kể detection trả gì, đóng cứng
    const { data: maxDurationExpired, error: maxDurationError } = await admin
      .from('live_sessions')
      .select('*')
      .eq('mode', 'rtmp_obs')
      .eq('status', 'live')
      .lte('started_at', maxDurationCutoff)
      .limit(50);
    if (maxDurationError) throw maxDurationError;

    // Verify nhánh stalePublic với Cloudflare API trước khi end:
    // - Coi là CÒN live chỉ khi inputConnected && videoStreaming (cả 2 đều true).
    // - Nếu Cloudflare soft-fail → bỏ qua phiên này, đợi tick sau.
    const verifiedFallback: any[] = [];
    const keptAlive: any[] = [];
    // Gộp stalePublic + staleNull, dedupe theo id, áp dụng cùng quy tắc verify strict
    const stalePool = new Map<string, any>();
    for (const s of stalePublic || []) stalePool.set(s.id, s);
    for (const s of staleNull || []) if (!stalePool.has(s.id)) stalePool.set(s.id, s);
    for (const s of pendingNoVideo || []) if (!stalePool.has(s.id)) stalePool.set(s.id, s);
    const resultsForNoVideo: Array<Record<string, unknown>> = [];
    for (const s of stalePool.values()) {
      try {
        const detection = await detectRtmpLiveConnection(s, { skewSeconds: 60 });
        const signalState = classifyRtmpVideoSignal(detection);
        if (signalState === 'unknown') {
          console.log('[grace-watchdog] skip cloudflare_soft_fail', s.id);
          resultsForNoVideo.push({ session_id: s.id, ok: false, skipped: 'cloudflare_state_unknown' });
          continue;
        }
        if (signalState === 'current_video') {
          const { error: recoverError } = await admin
            .from('live_sessions')
            .update({
              status: s.status === 'live' || ((s.status === 'disconnect_grace' || s.status === 'reconnecting') && (s.post_id || s.live_post_id)) ? 'live' : s.status,
              last_source_seen_at: nowIso,
              last_connection_check_at: nowIso,
              connection_status: 'connected',
              source_connected: true,
              video_signal_lost_at: null,
              live_input_status: 'live',
              signal_lost_at: null,
              reconnect_deadline_at: null,
              last_disconnected_at: null,
              updated_at: nowIso,
            })
            .eq('id', s.id)
            .is('ended_at', null);
          if (recoverError) throw recoverError;
          keptAlive.push({ session_id: s.id, reason: 'current_session_video_active' });
          continue;
        }
        if (signalState === 'input_connected_no_video') {
          const result = await reconcileRtmpSessionVideoSignal(admin, s, detection, { now: nowIso, graceSeconds });
          if (result.action === 'ended' && result.endResult && !result.endResult.idempotent && !result.endResult.in_progress) {
            await notifyAutoEnded(admin, s, 'source_disconnected_no_active_video').catch((e) => console.warn('[grace-watchdog] notify failed', String(e)));
            resultsForNoVideo.push({ session_id: s.id, reason: 'source_disconnected_no_active_video', ...result.endResult });
          }
          continue;
        }
        if (signalState === 'input_disconnected') {
          const { error: disconnectUpdateError } = await admin.from('live_sessions').update({
            video_signal_lost_at: null,
            last_connection_check_at: nowIso,
          }).eq('id', s.id).is('ended_at', null);
          if (disconnectUpdateError) throw disconnectUpdateError;
          verifiedFallback.push({ session: { ...s, video_signal_lost_at: null }, detection });
        }
      } catch (e) {
        console.warn('[grace-watchdog] detect failed', s.id, safeErrorText(e));
        resultsForNoVideo.push({ session_id: s.id, ok: false, skipped: 'processing_error' });
      }
    }

    // Merge danh sách xử lý end. Tag mỗi session với reason rõ ràng.
    const toEnd: Array<{ session: any; reason: RtmpEndReason }> = [];
    for (const s of legacy || []) toEnd.push({ session: s, reason: 'disconnect_timeout' });
    for (const s of graceExpired || []) toEnd.push({ session: s, reason: 'disconnect_timeout' });
    for (const v of verifiedFallback) toEnd.push({ session: v.session, reason: 'obs_signal_lost_timeout' });
    for (const s of maxDurationExpired || []) {
      if (!toEnd.some((t) => t.session.id === s.id)) toEnd.push({ session: s, reason: 'max_duration_exceeded' });
    }
    const validEndReasons = new Set<RtmpEndReason>([
      'manual', 'disconnect_timeout', 'obs_signal_lost_timeout', 'cloudflare_error', 'admin_force', 'duration_limit',
      'max_duration_exceeded', 'source_disconnected_no_active_video', 'host_clicked_end',
    ]);
    for (const s of staleEnding || []) {
      if (toEnd.some((t) => t.session.id === s.id)) continue;
      const persistedReason = validEndReasons.has(s.end_reason) ? s.end_reason as RtmpEndReason : 'manual';
      toEnd.push({ session: s, reason: persistedReason });
    }

    const results: Array<Record<string, unknown>> = [...resultsForNoVideo];
    for (const { session, reason } of toEnd) {
      try {
        // Recheck cuối cùng cho nhánh KHÔNG phải max_duration (không bao giờ recheck cho max_duration)
        if (session.status !== 'ending' && reason !== 'max_duration_exceeded' && session.cloudflare_live_input_id) {
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

          const finalState = classifyRtmpVideoSignal(detection);
          if (finalState === 'current_video') {
            const { error: recoverError } = await admin.from('live_sessions').update({
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
              video_signal_lost_at: null,
              updated_at: nowIso,
            }).eq('id', session.id).is('ended_at', null);
            if (recoverError) throw recoverError;
            keptAlive.push({ session_id: session.id, reason: 'recheck_current_session_video_active' });
            results.push({ session_id: session.id, ok: true, skipped: 'source_reconnected', detection_reason: detection.reason, reason });
            continue;
          }
          if (finalState === 'input_connected_no_video') {
            const noVideoResult = await reconcileRtmpSessionVideoSignal(admin, session, detection, { now: nowIso, graceSeconds });
            if (noVideoResult.action === 'ended' && noVideoResult.endResult && !noVideoResult.endResult.idempotent && !noVideoResult.endResult.in_progress) {
              await notifyAutoEnded(admin, session, 'source_disconnected_no_active_video').catch((e) => console.warn('[grace-watchdog] notify failed', String(e)));
              results.push({ session_id: session.id, reason: 'source_disconnected_no_active_video', ...noVideoResult.endResult });
            } else {
              results.push({ session_id: session.id, ok: false, skipped: noVideoResult.action === 'grace' ? 'no_video_grace' : noVideoResult.action, reason });
            }
            continue;
          }
          if (finalState !== 'input_disconnected') {
            results.push({ session_id: session.id, ok: true, skipped: 'cloudflare_disconnect_not_confirmed', reason });
            continue;
          }
        }

        const r = await endRtmpLiveSession(admin, session, reason);
        if (reason !== 'manual' && !r.idempotent && !r.in_progress) {
          await notifyAutoEnded(admin, session, reason).catch((e) => console.warn('[grace-watchdog] notify failed', String(e)));
        }
        console.log('[grace-watchdog] force_end', { session_id: session.id, reason, ...r });
        results.push({ session_id: session.id, reason, ...r });
      } catch (e) {
        const msg = safeErrorText(e);
        console.error('[grace-watchdog] end failed', session.id, msg);
        results.push({ session_id: session.id, ok: false, error: msg, reason });
      }
    }

    const liveInputDisableRetries = await retryPendingRtmpLiveInputDisables(admin, 30);

    const summary = {
      ok: true,
      scanned: {
        legacy: (legacy || []).length,
        grace_expired: (graceExpired || []).length,
        stale_public: (stalePublic || []).length,
        stale_null: (staleNull || []).length,
        pending_no_video: (pendingNoVideo || []).length,
        max_duration_expired: (maxDurationExpired || []).length,
        stale_ending_claims: (staleEnding || []).length,
      },
      ended: results.filter((r) => !r.skipped && !r.error).length,
      live_input_disable_retries: liveInputDisableRetries,
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
    const msg = safeErrorText(e);
    console.error('[grace-watchdog] fatal', msg);
    return json({ error: msg }, 500);
  }
});

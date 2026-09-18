/* eslint-disable @typescript-eslint/no-explicit-any */
import type { SupabaseClient } from 'npm:@supabase/supabase-js@2';
import { setStreamLiveInputEnabled } from './cloudflareStreamService.ts';

/**
 * Trả về true nếu cơ chế "armed" RTMP đang bật. Có thể tắt khẩn cấp qua env
 * RTMP_INPUT_ARMING_ENABLED=false để fallback hành vi cũ (Live Input luôn enabled).
 */
export function isInputArmingEnabled(): boolean {
  const v = (Deno.env.get('RTMP_INPUT_ARMING_ENABLED') || 'true').toLowerCase();
  return v !== 'false' && v !== '0' && v !== 'off';
}

const ARMING_TIMEOUT_MINUTES = (() => {
  const raw = Number(Deno.env.get('RTMP_ARMING_TIMEOUT_MINUTES') || '30');
  return Number.isFinite(raw) && raw > 0 ? raw : 30;
})();

export function getArmingTimeoutMinutes(): number {
  return ARMING_TIMEOUT_MINUTES;
}

/**
 * Session lock 1-active: ĐÓNG HẲN mọi session armed cũ của user (trừ session hiện hành).
 * - Session đang LIVE đã public: chỉ disarm (giữ stream cho viewer, watchdog sẽ end khi grace hết hạn).
 * - Session ở waiting_for_obs / source_connected / ready_to_go_live: end + disarm.
 * Không xoá Live Input (persistent stream key được tái dùng).
 */
export async function supersedeOtherArmedSessions(
  admin: SupabaseClient,
  userId: string,
  keepSessionId: string | null,
): Promise<number> {
  let q = (admin as any)
    .from('live_sessions')
    .select('id, status, cloudflare_live_input_id, post_id, live_post_id')
    .eq('owner_id', userId)
    .eq('mode', 'rtmp_obs')
    .eq('is_input_armed', true);
  if (keepSessionId) q = q.neq('id', keepSessionId);
  const { data: rows } = await q;
  if (!rows || rows.length === 0) return 0;

  const now = new Date().toISOString();
  for (const row of rows) {
    const isPublicLive = row.status === 'live' && (row.post_id || row.live_post_id);
    if (isPublicLive) {
      // Public LIVE: chỉ disarm, KHÔNG end (viewer đang xem).
      await (admin as any).from('live_sessions').update({
        is_input_armed: false,
        armed_session_token: null,
        last_armed_heartbeat_at: null,
        updated_at: now,
      }).eq('id', row.id);
      console.log('[RTMP_SUPERSEDE_DISARM_PUBLIC_LIVE]', { sessionId: row.id });
      continue;
    }
    // Pre-live session: end hẳn để giải phóng input.
    await (admin as any).from('live_sessions').update({
      status: 'ended',
      ended_at: now,
      end_reason: 'superseded',
      is_input_armed: false,
      armed_session_token: null,
      last_armed_heartbeat_at: null,
      source_connected: false,
      preview_ready: false,
      updated_at: now,
    }).eq('id', row.id)
      .in('status', ['waiting_for_obs', 'source_connected', 'ready_to_go_live', 'preparing', 'failed', 'idle']);
    console.log('[RTMP_SUPERSEDE_END]', { sessionId: row.id, prevStatus: row.status });
  }
  return rows.length;
}

export interface ArmResult {
  armed: boolean;
  armed_session_token: string;
  enable_error: string | null;
}

/**
 * Mark session as armed + bật Cloudflare Live Input. Idempotent.
 *
 * QUAN TRỌNG (refactor 13/05/2026): KHÔNG bump `armed_at` nếu session đã được arm trong
 * `ARMING_TIMEOUT_MINUTES` gần đây. Nếu bump, status poll sẽ filter video Cloudflare hiện
 * tại là "stale phiên cũ" → preview/source_connected mất sai khi user reload Live Producer.
 */
export async function armSession(
  admin: SupabaseClient,
  session: {
    id: string;
    cloudflare_live_input_id: string | null;
    armed_session_token?: string | null;
    is_input_armed?: boolean | null;
    armed_at?: string | null;
  },
): Promise<ArmResult> {
  const armingEnabled = isInputArmingEnabled();
  const now = new Date().toISOString();
  let enableError: string | null = null;

  // Idempotent guard: nếu đã armed và armed_at còn hợp lệ → giữ nguyên token + armed_at,
  // chỉ verify Cloudflare input còn enable. KHÔNG ghi đè armed_at để tránh stale-filter.
  const armedAtMs = session.armed_at ? Date.parse(session.armed_at) : 0;
  const armedAtFresh = Number.isFinite(armedAtMs)
    && armedAtMs > 0
    && (Date.now() - armedAtMs) < ARMING_TIMEOUT_MINUTES * 60_000;
  const reuseExisting = !!session.is_input_armed && armedAtFresh && !!session.armed_session_token;
  const token = reuseExisting ? session.armed_session_token! : (session.armed_session_token || crypto.randomUUID());

  if (armingEnabled && session.cloudflare_live_input_id) {
    try {
      await setStreamLiveInputEnabled(session.cloudflare_live_input_id, true);
    } catch (error) {
      enableError = error instanceof Error ? error.message : String(error);
      console.warn('[RTMP_ARM_ENABLE_FAILED]', {
        live_session_id: session.id,
        live_input_id: session.cloudflare_live_input_id,
        error: enableError,
      });
    }
  }

  if (reuseExisting) {
    // Chỉ heartbeat — không đụng armed_at hay token.
    await (admin as any).from('live_sessions').update({
      last_armed_heartbeat_at: now,
      live_input_disabled_at: null,
      updated_at: now,
    }).eq('id', session.id);
    console.log('[RTMP_ARM_REUSED]', {
      live_session_id: session.id,
      armed_at: session.armed_at,
      ageSeconds: Math.round((Date.now() - armedAtMs) / 1000),
    });
    return { armed: true, armed_session_token: token, enable_error: enableError };
  }

  await (admin as any).from('live_sessions').update({
    is_input_armed: true,
    armed_at: now,
    armed_session_token: token,
    last_armed_heartbeat_at: now,
    live_input_disabled_at: null,
    updated_at: now,
  }).eq('id', session.id);
  console.log('[RTMP_ARM_FRESH]', { live_session_id: session.id, armed_at: now });

  return { armed: true, armed_session_token: token, enable_error: enableError };
}

/**
 * Disarm session (KHÔNG end session — chỉ gỡ cờ armed + disable input).
 * Dùng khi producer đóng tab, heartbeat timeout, hoặc bị superseded.
 */
export async function disarmSession(
  admin: SupabaseClient,
  session: { id: string; cloudflare_live_input_id: string | null; status?: string | null },
  reason: string,
): Promise<{ disabled: boolean; error: string | null }> {
  const now = new Date().toISOString();
  let disableError: string | null = null;

  if (session.cloudflare_live_input_id) {
    try {
      await setStreamLiveInputEnabled(session.cloudflare_live_input_id, false);
    } catch (error) {
      disableError = error instanceof Error ? error.message : String(error);
      console.warn('[RTMP_DISARM_DISABLE_FAILED]', {
        live_session_id: session.id,
        live_input_id: session.cloudflare_live_input_id,
        reason,
        error: disableError,
      });
    }
  }

  await (admin as any).from('live_sessions').update({
    is_input_armed: false,
    armed_session_token: null,
    last_armed_heartbeat_at: null,
    live_input_disabled_at: session.cloudflare_live_input_id ? now : null,
    live_input_disable_error: disableError,
    updated_at: now,
  }).eq('id', session.id);

  console.log('[RTMP_DISARM]', {
    live_session_id: session.id,
    reason,
    inputDisabled: !!session.cloudflare_live_input_id && !disableError,
  });

  return { disabled: !!session.cloudflare_live_input_id && !disableError, error: disableError };
}

/* eslint-disable @typescript-eslint/no-explicit-any */
import type { SupabaseClient } from 'npm:@supabase/supabase-js@2';
import { isRtmpFrozenStatus } from './rtmpSessionStatus.ts';

export type RtmpStateSource = 'create' | 'poll' | 'webhook' | 'user' | 'cron' | 'system';

export type RtmpLiveStatus =
  | 'idle' | 'preparing' | 'waiting_for_obs' | 'source_connected'
  | 'ready_to_go_live' | 'live' | 'disconnect_grace'
  | 'ended' | 'processing_replay' | 'archived' | 'failed';

/**
 * Ghi nhật ký 1 dòng vào live_session_events. Bỏ qua lỗi để không vỡ pipeline chính.
 */
export async function logLiveSessionEvent(
  admin: SupabaseClient,
  liveSessionId: string,
  fromStatus: string | null,
  toStatus: string | null,
  source: RtmpStateSource,
  reason?: string,
  payload?: Record<string, unknown>,
): Promise<void> {
  try {
    await (admin as any).from('live_session_events').insert({
      live_session_id: liveSessionId,
      from_status: fromStatus,
      to_status: toStatus,
      source,
      reason: reason || null,
      payload: payload || null,
    });
  } catch (err) {
    console.warn('[RTMP_AUDIT_LOG_FAILED]', String((err as Error)?.message || err));
  }
}

/**
 * Chuyển trạng thái live session có guard (chỉ chấp nhận `fromAllowed` khi cung cấp).
 * Trả về row đã update, hoặc null nếu transition bị bỏ (status hiện tại không nằm trong fromAllowed).
 *
 * Nếu DB trigger chặn (ví dụ ended -> live), ném lỗi để caller log.
 */
export async function transitionLiveSession(
  admin: SupabaseClient,
  liveSessionId: string,
  toStatus: RtmpLiveStatus,
  options: {
    fromAllowed?: ReadonlyArray<string> | null;
    source: RtmpStateSource;
    reason?: string;
    patch?: Record<string, unknown>;
    audit?: boolean;
  },
): Promise<{ row: any | null; transitioned: boolean }> {
  const { fromAllowed, source, reason, patch = {}, audit = true } = options;

  let q = (admin as any)
    .from('live_sessions')
    .update({ ...patch, status: toStatus, updated_at: new Date().toISOString() })
    .eq('id', liveSessionId);

  if (fromAllowed && fromAllowed.length > 0) {
    q = q.in('status', fromAllowed as string[]);
  }

  const { data, error } = await q.select('*').maybeSingle();
  if (error) {
    console.error('[RTMP_TRANSITION_FAILED]', { liveSessionId, toStatus, source, reason, error: error.message });
    throw error;
  }
  const transitioned = !!data;
  if (audit) {
    await logLiveSessionEvent(
      admin, liveSessionId,
      data?.status === toStatus ? (fromAllowed?.[0] ?? null) : (data?.status ?? null),
      toStatus, source, reason,
      { transitioned, patchKeys: Object.keys(patch) },
    );
  }
  console.log('[RTMP_TRANSITION]', { liveSessionId, toStatus, source, reason, transitioned });
  return { row: data, transitioned };
}

export function isTerminalStatus(status: string | null | undefined): boolean {
  return isRtmpFrozenStatus(status);
}

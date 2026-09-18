import { supabase } from '@/integrations/supabase/client';
import type { FriendlyLiveErrorCode } from './utils/liveErrors';

export type AgoraUsageStatus = 'connecting' | 'live' | 'failed' | 'ended';
export type AgoraEndReason =
  | 'user_ended'
  | 'agora_failed'
  | 'quota_limit'
  | 'network_error'
  | 'system_timeout';

interface StartAgoraUsageInput {
  liveSessionId: string;
  channelName: string;
  agoraUid?: number | string | null;
  streamType?: 'webcam' | 'mobile' | 'obs';
}

interface FinishAgoraUsageInput {
  liveSessionId: string;
  status?: AgoraUsageStatus;
  endReason?: AgoraEndReason;
  peakViewers?: number | null;
  totalViewerMinutes?: number | null;
}

interface RecordAgoraErrorInput {
  liveSessionId: string;
  errorCode: FriendlyLiveErrorCode | string;
  errorMessageInternal?: string | null;
  endReason?: AgoraEndReason;
}

export async function startAgoraUsageSession(input: StartAgoraUsageInput): Promise<string | null> {
  try {
    const { data, error } = await (supabase.rpc as any)('start_agora_usage_session', {
      p_live_session_id: input.liveSessionId,
      p_channel_name: input.channelName,
      p_agora_uid: input.agoraUid == null ? null : Number(input.agoraUid),
      p_stream_type: input.streamType ?? 'webcam',
    });
    if (error) throw error;
    return typeof data === 'string' ? data : null;
  } catch (error) {
    console.warn('[agoraUsage] start failed:', error);
    return null;
  }
}

export async function finishAgoraUsageSession(input: FinishAgoraUsageInput): Promise<void> {
  try {
    const { error } = await (supabase.rpc as any)('finish_agora_usage_session', {
      p_live_session_id: input.liveSessionId,
      p_status: input.status ?? 'ended',
      p_end_reason: input.endReason ?? 'user_ended',
      p_peak_viewers: input.peakViewers ?? null,
      p_total_viewer_minutes: input.totalViewerMinutes ?? null,
    });
    if (error) throw error;
  } catch (error) {
    console.warn('[agoraUsage] finish failed:', error);
  }
}

export async function recordAgoraUsageError(input: RecordAgoraErrorInput): Promise<void> {
  try {
    const { error } = await (supabase.rpc as any)('record_agora_usage_error', {
      p_live_session_id: input.liveSessionId,
      p_error_code: input.errorCode,
      p_error_message_internal: input.errorMessageInternal ?? null,
      p_end_reason: input.endReason ?? 'agora_failed',
    });
    if (error) throw error;
  } catch (error) {
    console.warn('[agoraUsage] record error failed:', error);
  }
}

export interface AgoraUsageAdminUserRow {
  user_id: string | null;
  username: string | null;
  full_name: string | null;
  avatar_url: string | null;
  live_sessions: number;
  total_minutes: number;
  viewer_minutes: number;
  latest_status: string | null;
  latest_error: string | null;
}

export interface AgoraUsageAdminRecentRow {
  id: string;
  user_id: string | null;
  username: string | null;
  full_name: string | null;
  live_session_id: string | null;
  channel_name: string | null;
  stream_type: string | null;
  status: string;
  started_at: string;
  ended_at: string | null;
  total_duration_minutes: number;
  peak_viewers: number;
  total_viewer_minutes: number;
  error_code: string | null;
  error_message_internal: string | null;
  end_reason: string | null;
}

export interface AgoraUsageAdminStats {
  today_minutes: number;
  month_minutes: number;
  quota_minutes: number;
  quota_percent: number;
  live_sessions: number;
  failed_sessions: number;
  active_sessions: number;
  top_users: AgoraUsageAdminUserRow[];
  recent_sessions: AgoraUsageAdminRecentRow[];
}

export async function getAgoraUsageAdminStats(): Promise<AgoraUsageAdminStats | null> {
  const now = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
  const monthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 1).toISOString();
  const { data, error } = await (supabase.rpc as any)('get_agora_usage_admin_stats', {
    p_month_start: monthStart,
    p_month_end: monthEnd,
  });
  if (error) throw error;
  return (data ?? null) as AgoraUsageAdminStats | null;
}

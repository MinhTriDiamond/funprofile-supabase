import { supabase } from '@/integrations/supabase/client';
export { evaluateAgoraCallTokenAccess } from '../../../supabase/functions/_shared/agoraCallTokenPolicy';

export interface AgoraCallToken {
  appId: string;
  token: string;
  uid: number;
  channel: string;
  expiresAt: number;
}

export async function getAgoraCallToken(callSessionId: string): Promise<AgoraCallToken> {
  const { data, error } = await supabase.functions.invoke('agora-call-token', { body: { call_session_id: callSessionId } });
  if (error) throw new Error('Không thể xác thực quyền tham gia cuộc gọi. Vui lòng thử lại.');
  const payload = data as { app_id?: unknown; token?: unknown; uid?: unknown; channel?: unknown; expires_at?: unknown };
  if (typeof payload?.app_id !== 'string' || typeof payload.token !== 'string' || !Number.isSafeInteger(payload.uid) || typeof payload.channel !== 'string' || typeof payload.expires_at !== 'number') {
    throw new Error('Dữ liệu cấp quyền cuộc gọi không hợp lệ.');
  }
  return { appId: payload.app_id, token: payload.token, uid: payload.uid as number, channel: payload.channel, expiresAt: payload.expires_at };
}


import AgoraRTC, { IAgoraRTCClient } from 'agora-rtc-sdk-ng';
import { supabase } from '@/integrations/supabase/client';

export type AgoraRtcRole = 'host' | 'audience' | 'publisher' | 'subscriber';

interface AgoraTokenResponse {
  appId: string;
  token: string;
  userAccount: string | number;
  expiresAt: number;
}

interface AgoraEdgeTokenResponse {
  token: string;
  app_id: string;
  uid: number;
  channel: string;
  expires_at: number;
}

async function withTimeout<T>(promise: Promise<T>, timeoutMs: number, message: string): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | null = null;
  try {
    return await Promise.race([
      promise,
      new Promise<T>((_, reject) => {
        timer = setTimeout(() => reject(new Error(message)), timeoutMs);
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

function ensureAgoraEdgePayload(payload: any): asserts payload is AgoraEdgeTokenResponse {
  if (!payload?.token || !payload?.app_id || payload?.uid === undefined) {
    throw new Error('Invalid Agora token response');
  }
}

export async function getAgoraRtcToken(
  channelName: string,
  _role: AgoraRtcRole
): Promise<AgoraTokenResponse> {
  const { data, error } = await withTimeout(
    supabase.functions.invoke('agora-token', {
      body: { channel_name: channelName },
    }),
    8000,
    'agora-token timeout'
  );
  if (error) throw error;
  const payload = data as AgoraEdgeTokenResponse;
  ensureAgoraEdgePayload(payload);
  return {
    appId: payload.app_id,
    token: payload.token,
    userAccount: payload.uid,
    expiresAt: payload.expires_at,
  };
}

export function createAgoraRtcClient(mode: 'rtc' | 'live' = 'rtc'): IAgoraRTCClient {
  return AgoraRTC.createClient({ mode, codec: 'vp8' });
}

export async function getAgoraRtcTokenFromEdge(channelName: string): Promise<{
  token: string;
  appId: string;
  uid: number;
}> {
  const { data, error } = await withTimeout(
    supabase.functions.invoke('agora-token', {
      body: { channel_name: channelName },
    }),
    8000,
    'agora-token timeout'
  );
  if (error) throw error;
  const payload = data as AgoraEdgeTokenResponse;
  ensureAgoraEdgePayload(payload);
  return {
    token: payload.token,
    appId: payload.app_id,
    uid: payload.uid,
  };
}

export async function getAgoraRtcTokenForLive(
  channelName: string,
  role: AgoraRtcRole = 'host'
): Promise<{ token: string; appId: string; userAccount: string | number }> {
  return getAgoraRtcToken(channelName, role);
}

export async function getLiveToken(
  sessionId: string,
  role: 'host' | 'audience'
): Promise<{ token: string; channel: string; uid: string; appId: string; expiresAt: number }> {
  try {
    const { data, error } = await withTimeout(
      supabase.functions.invoke('live-token', {
        body: { session_id: sessionId, role },
      }),
      8000,
      'live-token timeout'
    );
    if (error) throw error;

    const payload = data as {
      token?: string;
      channel?: string;
      uid?: string;
      appId?: string;
      expiresAt?: number;
    };

    if (!payload?.token || !payload?.channel || !payload?.uid || !payload?.appId) {
      throw new Error('Invalid live token response');
    }

    return {
      token: payload.token,
      channel: payload.channel,
      uid: payload.uid,
      appId: payload.appId,
      expiresAt: payload.expiresAt ?? Math.floor(Date.now() / 1000) + 3600,
    };
  } catch (error) {
    console.warn('[live-token] fallback -> agora-token', error);

    const { data: liveSession, error: sessionError } = await withTimeout(
      supabase
        .from('live_sessions')
        .select('channel_name, agora_channel, status, host_user_id')
        .eq('id', sessionId)
        .maybeSingle() as unknown as Promise<{ data: any; error: any }>,
      5000,
      'live session lookup timeout'
    );

    if (sessionError || !liveSession) {
      throw sessionError || new Error('Live session not found');
    }
    if (liveSession.status !== 'live') {
      throw new Error('Live session has ended');
    }

    const channel = liveSession.agora_channel || liveSession.channel_name;
    if (!channel) {
      throw new Error('Live channel not found');
    }
    if (role === 'host') {
      const {
        data: { session },
      } = await withTimeout(supabase.auth.getSession(), 5000, 'auth session timeout');
      if (!session?.user?.id) {
        throw new Error('Not authenticated');
      }
      if (liveSession.host_user_id !== session.user.id) {
        throw new Error('Only host can start this live');
      }
    }

    const fallback = await withTimeout(getAgoraRtcTokenFromEdge(channel), 8000, 'agora-token timeout');
    return {
      token: fallback.token,
      channel,
      uid: String(fallback.uid),
      appId: fallback.appId,
      expiresAt: Math.floor(Date.now() / 1000) + 24 * 60 * 60,
    };
  }
}

export function secondsUntilExpiry(expiresAt?: number): number {
  if (!expiresAt) return 0;
  return Math.max(0, expiresAt - Math.floor(Date.now() / 1000));
}

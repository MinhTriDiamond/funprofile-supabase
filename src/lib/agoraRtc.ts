
import AgoraRTC, { IAgoraRTCClient } from 'agora-rtc-sdk-ng';
import { supabase } from '@/integrations/supabase/client';

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

export function createAgoraRtcClient(mode: 'rtc' | 'live' = 'rtc'): IAgoraRTCClient {
  return AgoraRTC.createClient({ mode, codec: 'vp8' });
}

export async function getLiveToken(
  sessionId: string,
  role: 'host' | 'audience'
): Promise<{ token: string; channel: string; uid: string; appId: string; expiresAt: number }> {
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
}

export function secondsUntilExpiry(expiresAt?: number): number {
  if (!expiresAt) return 0;
  return Math.max(0, expiresAt - Math.floor(Date.now() / 1000));
}

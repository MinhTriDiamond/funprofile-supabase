import { supabase } from '@/integrations/supabase/client';

export type LiveRtcRole = 'host' | 'audience' | 'recorder';

export interface GetRtcTokenInput {
  sessionId?: string;
  channelName?: string;
  uid?: string | number;
  role: LiveRtcRole;
  expireSeconds?: number;
}

export interface RtcTokenResult {
  appId: string;
  token: string;
  uid: string | number;
  channel: string;
  expiresAt?: number;
}

export async function getRtcToken(input: GetRtcTokenInput): Promise<RtcTokenResult> {
  const { data, error } = await supabase.functions.invoke('live-token', {
    body: {
      sessionId: input.sessionId,
      channelName: input.channelName,
      uid: input.uid,
      role: input.role,
      expireSeconds: input.expireSeconds,
    },
  });

  if (error) {
    const context = (error as { context?: unknown })?.context;
    if (context instanceof Response) {
      const body = await context.json().catch(() => null) as { error?: string; message?: string } | null;
      if (body?.error || body?.message) {
        throw new Error([body.error, body.message].filter(Boolean).join(': '));
      }
    }
    const message = (error as { message?: string })?.message || String(error);
    throw new Error(message);
  }
  if (data?.error) throw new Error(String(data.error));
  if (!data?.token || !data?.appId || !data?.channel) {
    throw new Error('Invalid live-token response');
  }

  return {
    appId: data.appId,
    token: data.token,
    uid: data.uid,
    channel: data.channel,
    expiresAt: data.expiresAt,
  };
}

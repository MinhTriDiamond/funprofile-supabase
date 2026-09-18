export interface ProfileLiveFields {
  is_live?: boolean | null;
  current_live_session_id?: string | null;
  live_started_at?: string | null;
}

export interface ProfileLiveState {
  isLive: boolean;
  liveSessionId: string | null;
  liveStartedAt: string | null;
}

export function getProfileLiveState(profile?: ProfileLiveFields | null): ProfileLiveState {
  const liveSessionId = typeof profile?.current_live_session_id === 'string' && profile.current_live_session_id
    ? profile.current_live_session_id
    : null;

  return {
    isLive: profile?.is_live === true && !!liveSessionId,
    liveSessionId,
    liveStartedAt: profile?.live_started_at || null,
  };
}

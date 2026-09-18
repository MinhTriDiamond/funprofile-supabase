export type LivePrivacy = 'public' | 'friends';
export type LiveMode = 'agora_webcam' | 'rtmp_obs';
export type LiveEndReason =
  | 'manual'
  | 'host_clicked_end'
  | 'host_heartbeat_timeout'
  | 'host_disconnected_timeout'
  | 'host_hidden_timeout'
  | 'host_pagehide'
  | 'host_network_lost'
  | 'beforeunload_end_attempt'
  | 'route_change'
  | 'logout'
  | 'zombie_cleanup'
  | 'superseded_by_new_live'
  | 'auto_finalize'
  | 'recording_failed'
  | 'agora_failed'
  | 'quota_limit'
  | 'network_error'
  | 'system_timeout'
  | 'duration_limit'
  | 'auto_duration_limit'
  | 'obs_signal_lost_timeout';
export type LiveStatus =
  | 'idle'
  | 'preparing'
  | 'created'
  | 'starting'
  | 'recording'
  | 'waiting_for_obs'
  | 'source_connected'
  | 'ready_to_go_live'
  | 'live'
  | 'reconnecting'
  | 'ending'
  | 'recording_processing'
  | 'recording_failed'
  | 'disconnect_grace'
  | 'ended'
  | 'processing'
  | 'processing_replay'
  | 'archiving'
  | 'archived'
  | 'posted'
  | 'failed';

export interface LiveHostProfile {
  username: string | null;
  full_name: string | null;
  avatar_url: string | null;
}

export interface LiveSession {
  id: string;
  host_user_id: string;
  user_id?: string | null;
  mode?: LiveMode;
  agora_channel?: string | null;
  agora_channel_name?: string | null;
  channel_name: string;
  agora_uid_host?: number | null;
  agora_uid?: number | null;
  recording_uid?: number | null;
  recording_status?:
    | 'idle'
    | 'acquired'
    | 'acquiring'
    | 'starting'
    | 'recording'
    | 'stopping'
    | 'processing'
    | 'ready'
    | 'stopped'
    | 'failed'
    | null;
  recording_provider?: 'agora' | 'browser' | 'none' | string | null;
  recording_error_code?: string | null;
  recording_error_message?: string | null;
  browser_recording_status?: 'idle' | 'recording' | 'uploading' | 'uploaded' | 'failed' | string | null;
  browser_recording_warning?: string | null;
  browser_recording_chunk_count?: number | null;
  browser_recording_total_bytes?: number | null;
  title: string | null;
  description?: string | null;
  privacy: LivePrivacy;
  status: LiveStatus;
  cloudflare_live_input_id?: string | null;
  cloudflare_video_uid?: string | null;
  rtmps_url?: string | null;
  stream_key_last_reset_at?: string | null;
  source_connected_at?: string | null;
  signal_status?: 'connected' | 'lost' | 'reconnected' | 'timeout_auto_end' | string | null;
  signal_lost_at?: string | null;
  reconnect_deadline_at?: string | null;
  auto_end_reason?: string | null;
  go_live_clicked_at?: string | null;
  playback_url?: string | null;
  hls_url?: string | null;
  r2_video_url?: string | null;
  playback_provider?: string | null;
  storage_provider?: string | null;
  archive_status?: string | null;
  archive_error?: string | null;
  live_post_id?: string | null;
  replay_post_id?: string | null;
  viewer_count: number;
  started_at: string;
  ended_at: string | null;
  last_seen_at?: string | null;
  last_host_heartbeat_at?: string | null;
  host_connection_status?: string | null;
  end_reason?: LiveEndReason | string | null;
  created_at: string;
  updated_at: string;
  post_id: string | null;
  host_profile?: LiveHostProfile | null;
}

export interface CreateLiveSessionInput {
  title?: string;
  privacy: LivePrivacy;
}

import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';

export interface LiveReplayOverride {
  playback_hls?: string;
  playback_mp4?: string;
  r2_video_url?: string;
  temp_hls_url?: string;
  archive_mp4_url?: string;
  thumbnail_url?: string;
  stream_uid?: string;
  playback_type?: 'hls' | 'mp4' | 'processing';
  playback_provider?: 'r2' | 'r2_temp';
  storage_provider?: 'r2' | 'r2_temp';
  archive_status?: string | null;
  replay_status?: 'processing' | 'ready_hls' | 'archiving' | 'ready_mp4' | 'failed' | 'failed_no_recording';
  replay_ready?: boolean;
  processing_message?: string | null;
}

interface LiveReplayStatusRow {
  status: string;
  playback_hls: string | null;
  playback_mp4: string | null;
  r2_video_url: string | null;
  temp_hls_url: string | null;
  archive_mp4_url: string | null;
  playback_type: string | null;
  playback_provider: string | null;
  storage_provider: string | null;
  replay_status: string | null;
  archive_status: string | null;
  thumbnail_url: string | null;
  stream_uid: string | null;
  error_message: string | null;
}

interface LiveReplayChangePayload {
  new: LiveReplayStatusRow;
}

interface UseLiveReplayStatusOptions {
  subscriptionKey?: string | null;
  realtime?: boolean;
}

/**
 * Hydrates live replay posts only after the Stream output has been archived to R2.
 * Agora remains the realtime path; R2 MP4 is the durable replay source of truth.
 */
export function useLiveReplayStatus(
  liveSessionId: string | undefined | null,
  enabled: boolean,
  options: UseLiveReplayStatusOptions = {},
): LiveReplayOverride | null {
  const [override, setOverride] = useState<LiveReplayOverride | null>(null);
  const realtimeEnabled = options.realtime ?? true;
  const subscriptionKey = options.subscriptionKey ?? liveSessionId;

  useEffect(() => {
    if (!enabled || !liveSessionId) return;

    let cancelled = false;
    let channel: ReturnType<typeof supabase.channel> | null = null;

    const applyReplay = (row: LiveReplayStatusRow) => {
      if (cancelled) return false;
      const status = row.replay_status || (row.r2_video_url ? 'ready_mp4' : row.playback_hls ? 'ready_hls' : row.status);
      const mp4Url = row.archive_mp4_url || row.r2_video_url || row.playback_mp4;
      const hlsUrl = row.temp_hls_url || row.playback_hls;

      // URL MP4/R2 is the source of truth. Production can briefly leave
      // replay_status stale as processing/archiving after the archive URL exists.
      if (mp4Url) {
        setOverride({
          playback_hls: hlsUrl ?? undefined,
          playback_mp4: mp4Url,
          r2_video_url: mp4Url,
          archive_mp4_url: mp4Url,
          temp_hls_url: hlsUrl ?? undefined,
          thumbnail_url: row.thumbnail_url ?? undefined,
          stream_uid: row.stream_uid ?? undefined,
          playback_type: 'mp4',
          playback_provider: 'r2',
          storage_provider: 'r2',
          archive_status: row.archive_status,
          replay_status: 'ready_mp4',
          replay_ready: true,
          processing_message: null,
        });
        return true;
      }

      if ((status === 'ready_hls' || status === 'archiving') && hlsUrl) {
        setOverride({
          archive_mp4_url: mp4Url ?? undefined,
          r2_video_url: mp4Url ?? undefined,
          thumbnail_url: row.thumbnail_url ?? undefined,
          stream_uid: row.stream_uid ?? undefined,
          playback_type: 'processing',
          playback_provider: 'r2',
          storage_provider: 'r2',
          archive_status: row.archive_status,
          replay_status: 'processing',
          replay_ready: false,
          processing_message: 'Video đang được xử lý',
        });
        return false;
      }

      if (status === 'failed' && hlsUrl && row.archive_status === 'failed') {
        setOverride({
          archive_mp4_url: mp4Url ?? undefined,
          r2_video_url: mp4Url ?? undefined,
          thumbnail_url: row.thumbnail_url ?? undefined,
          stream_uid: row.stream_uid ?? undefined,
          playback_type: 'processing',
          playback_provider: 'r2',
          storage_provider: 'r2',
          archive_status: row.archive_status,
          replay_status: 'failed',
          replay_ready: false,
          processing_message: row.error_message || 'Video đang xử lý lỗi, vui lòng thử lại sau.',
        });
        return false;
      }

      if (status === 'failed' || status === 'failed_no_recording') {
        setOverride({
          playback_type: 'processing',
          archive_status: row.archive_status,
          replay_status: status as LiveReplayOverride['replay_status'],
          replay_ready: false,
          processing_message: row.error_message || 'Video đang xử lý lỗi, vui lòng thử lại sau.',
        });
        return false;
      }

      setOverride({
        playback_type: 'processing',
        archive_status: row.archive_status,
        replay_status: 'processing',
        replay_ready: false,
          processing_message: 'Video đang được xử lý',
      });
      return false;
    };

    (async () => {
      const { data, error } = await supabase
        .from('live_replays')
        .select('status, playback_hls, playback_mp4, r2_video_url, temp_hls_url, archive_mp4_url, playback_type, playback_provider, storage_provider, replay_status, archive_status, thumbnail_url, stream_uid, error_message')
        .eq('live_session_id', liveSessionId)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (error) {
        console.warn('[useLiveReplayStatus] Failed to hydrate replay status:', error);
        return;
      }

      if (data) applyReplay(data);
    })();

    if (realtimeEnabled) {
      try {
        channel = supabase
          .channel(`live-replay-status-${liveSessionId}-${subscriptionKey}`)
          .on(
            'postgres_changes',
            {
              event: '*',
              schema: 'public',
              table: 'live_replays',
              filter: `live_session_id=eq.${liveSessionId}`,
            },
            (payload) => {
              const row = (payload as unknown as LiveReplayChangePayload).new;
              if (!row || !applyReplay(row) || !channel) return;

              const readyChannel = channel;
              channel = null;
              supabase.removeChannel(readyChannel).catch((error) => {
                console.warn('[useLiveReplayStatus] Failed to remove ready replay channel:', error);
              });
            },
          )
          .subscribe((status, error) => {
            if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
              console.warn('[useLiveReplayStatus] Realtime subscription warning:', {
                status,
                error,
                liveSessionId,
              });
            }
          });
      } catch (error) {
        channel = null;
        console.warn('[useLiveReplayStatus] Failed to subscribe to replay status:', error);
      }
    }

    // Polling fallback: realtime đôi khi bị WS rớt sau khi tab vào background,
    // hoặc UPDATE bị miss. Poll mỗi 15s trong 8 phút sau mount để đảm bảo
    // FE đảo HLS → MP4 ngay cả khi WS không nhận được UPDATE.
    const startedAt = Date.now();
    const POLL_INTERVAL_MS = 15_000;
    const POLL_DURATION_MS = 8 * 60 * 1000;
    const pollTimer = setInterval(async () => {
      if (cancelled || Date.now() - startedAt > POLL_DURATION_MS) {
        clearInterval(pollTimer);
        return;
      }
      const { data } = await supabase
        .from('live_replays')
        .select('status, playback_hls, playback_mp4, r2_video_url, temp_hls_url, archive_mp4_url, playback_type, playback_provider, storage_provider, replay_status, archive_status, thumbnail_url, stream_uid, error_message')
        .eq('live_session_id', liveSessionId)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();
      if (!data || cancelled) return;
      if (applyReplay(data)) {
        clearInterval(pollTimer);
      }
    }, POLL_INTERVAL_MS);

    return () => {
      cancelled = true;
      clearInterval(pollTimer);
      if (channel) {
        supabase.removeChannel(channel).catch((error) => {
          console.warn('[useLiveReplayStatus] Failed to cleanup replay channel:', error);
        });
      }
    };
  }, [liveSessionId, enabled, realtimeEnabled, subscriptionKey]);

  return override;
}


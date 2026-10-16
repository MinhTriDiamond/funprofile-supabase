-- Keep the first successful observation of a connected Live Input without
-- current-session video. The timestamp is independent from transport loss.
ALTER TABLE public.live_sessions
  ADD COLUMN IF NOT EXISTS video_signal_lost_at timestamptz;

CREATE INDEX IF NOT EXISTS idx_live_sessions_rtmp_video_signal_lost
  ON public.live_sessions (video_signal_lost_at)
  WHERE mode = 'rtmp_obs'
    AND ended_at IS NULL
    AND video_signal_lost_at IS NOT NULL;

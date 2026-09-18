-- Live Session Watchdog Lifecycle Refactor
-- Keeps webcam live sessions from ending on short drops, and auto-ends true abandoned sessions.

ALTER TABLE public.live_sessions
  ADD COLUMN IF NOT EXISTS last_seen_at timestamptz,
  ADD COLUMN IF NOT EXISTS last_host_heartbeat_at timestamptz,
  ADD COLUMN IF NOT EXISTS host_connection_status text NOT NULL DEFAULT 'offline',
  ADD COLUMN IF NOT EXISTS end_reason text,
  ADD COLUMN IF NOT EXISTS recording_stop_requested_at timestamptz,
  ADD COLUMN IF NOT EXISTS recording_last_query_at timestamptz,
  ADD COLUMN IF NOT EXISTS recording_error text,
  ADD COLUMN IF NOT EXISTS cleanup_attempts integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS last_cleanup_at timestamptz,
  ADD COLUMN IF NOT EXISTS ended_at timestamptz,
  ADD COLUMN IF NOT EXISTS archive_status text,
  ADD COLUMN IF NOT EXISTS recording_status text,
  ADD COLUMN IF NOT EXISTS last_host_disconnected_at timestamptz,
  ADD COLUMN IF NOT EXISTS last_host_reconnected_at timestamptz;

ALTER TABLE public.live_sessions
  DROP CONSTRAINT IF EXISTS live_sessions_status_check;

ALTER TABLE public.live_sessions
  ADD CONSTRAINT live_sessions_status_check
  CHECK (status IN (
    'idle',
    'preparing',
    'created',
    'starting',
    'recording',
    'waiting_for_obs',
    'source_connected',
    'ready_to_go_live',
    'live',
    'reconnecting',
    'disconnect_grace',
    'ending',
    'recording_processing',
    'recording_failed',
    'ended',
    'processing',
    'processing_replay',
    'archiving',
    'archived',
    'posted',
    'processing_stream',
    'stream_ready',
    'exporting_mp4',
    'uploading_r2',
    'verifying_r2',
    'archived',
    'replay_posted',
    'stream_deleted',
    'replay_temp_ready',
    'archiving_r2',
    'r2_ready',
    'stream_delete_pending',
    'failed'
  ));

ALTER TABLE public.live_sessions
  DROP CONSTRAINT IF EXISTS live_sessions_host_connection_status_check;

ALTER TABLE public.live_sessions
  ADD CONSTRAINT live_sessions_host_connection_status_check
  CHECK (host_connection_status IN ('online', 'offline', 'unknown', 'reconnecting'));

UPDATE public.live_sessions
SET
  last_seen_at = COALESCE(last_seen_at, last_host_heartbeat_at, updated_at, started_at),
  host_connection_status = CASE
    WHEN status = 'live' AND ended_at IS NULL THEN COALESCE(NULLIF(host_connection_status, ''), 'online')
    WHEN status = 'reconnecting' THEN 'reconnecting'
    WHEN ended_at IS NOT NULL OR status IN ('ended', 'recording_processing', 'recording_failed') THEN 'offline'
    ELSE COALESCE(NULLIF(host_connection_status, ''), 'offline')
  END
WHERE last_seen_at IS NULL OR host_connection_status IS NULL;

CREATE INDEX IF NOT EXISTS idx_live_sessions_watchdog_active
  ON public.live_sessions (mode, status, ended_at, last_seen_at, last_host_heartbeat_at, updated_at)
  WHERE mode = 'agora_webcam';

DROP FUNCTION IF EXISTS public.resolve_live_session_route_id(uuid);

CREATE OR REPLACE FUNCTION public.resolve_live_session_route_id(p_id uuid)
RETURNS TABLE (
  live_session_id uuid,
  status text,
  post_id uuid,
  live_post_id uuid,
  replay_post_id uuid,
  playback_url text,
  r2_video_url text,
  archive_url text,
  replay_url text,
  recording_status text,
  archive_status text,
  host_connection_status text,
  last_seen_at timestamptz,
  last_host_heartbeat_at timestamptz,
  ended_at timestamptz,
  end_reason text
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  WITH input_posts AS (
    SELECT p_id AS id
    UNION
    SELECT sp.original_post_id
    FROM public.shared_posts sp
    WHERE sp.id = p_id
  ),
  post_metadata_sessions AS (
    SELECT
      CASE
        WHEN p.metadata ? 'live_session_id'
          AND (p.metadata->>'live_session_id') ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
        THEN (p.metadata->>'live_session_id')::uuid
        ELSE NULL
      END AS id
    FROM public.posts p
    WHERE p.id IN (SELECT id FROM input_posts)
  ),
  candidates AS (
    SELECT ls.*
    FROM public.live_sessions ls
    WHERE ls.id = p_id

    UNION

    SELECT ls.*
    FROM public.live_sessions ls
    WHERE ls.id IN (SELECT id FROM post_metadata_sessions WHERE id IS NOT NULL)

    UNION

    SELECT ls.*
    FROM public.live_sessions ls
    WHERE ls.post_id IN (SELECT id FROM input_posts)
       OR ls.live_post_id IN (SELECT id FROM input_posts)
       OR ls.replay_post_id IN (SELECT id FROM input_posts)

    UNION

    SELECT ls.*
    FROM public.live_sessions ls
    JOIN public.live_replays lr ON lr.live_session_id = ls.id
    WHERE lr.replay_post_id IN (SELECT id FROM input_posts)
  )
  SELECT
    c.id AS live_session_id,
    c.status::text,
    c.post_id,
    c.live_post_id,
    c.replay_post_id,
    c.playback_url,
    c.r2_video_url,
    c.archive_url,
    c.replay_url,
    c.recording_status::text,
    c.archive_status::text,
    c.host_connection_status::text,
    c.last_seen_at,
    c.last_host_heartbeat_at,
    c.ended_at,
    c.end_reason
  FROM candidates c
  WHERE c.status IN (
      'live',
      'reconnecting',
      'ending',
      'recording_processing',
      'recording_failed',
      'disconnect_grace',
      'ended',
      'processing',
      'processing_replay',
      'archiving',
      'posted',
      'processing_stream',
      'stream_ready',
      'exporting_mp4',
      'uploading_r2',
      'verifying_r2',
      'archived',
      'replay_posted',
      'stream_deleted',
      'failed'
    )
    AND (
      c.privacy = 'public'
      OR auth.uid() IN (c.host_user_id, c.owner_id, c.user_id)
      OR EXISTS (
        SELECT 1
        FROM public.posts p
        WHERE p.id IN (c.post_id, c.live_post_id, c.replay_post_id)
          AND COALESCE(p.visibility, 'public') <> 'private'
      )
    )
  ORDER BY
    CASE c.status
      WHEN 'live' THEN 0
      WHEN 'reconnecting' THEN 1
      WHEN 'disconnect_grace' THEN 2
      WHEN 'ending' THEN 3
      WHEN 'recording_processing' THEN 4
      WHEN 'ended' THEN 5
      ELSE 6
    END,
    c.updated_at DESC
  LIMIT 1;
END;
$$;

GRANT EXECUTE ON FUNCTION public.resolve_live_session_route_id(uuid) TO anon, authenticated;

SELECT cron.unschedule('agora-webcam-zombie-cleanup-every-1min')
 WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname='agora-webcam-zombie-cleanup-every-1min');

SELECT cron.unschedule('agora-webcam-stuck-promoter-every-1min')
 WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname='agora-webcam-stuck-promoter-every-1min');

SELECT cron.unschedule('live-session-watchdog-every-1min')
 WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname='live-session-watchdog-every-1min');

SELECT cron.schedule(
  'live-session-watchdog-every-1min',
  '* * * * *',
  $$
  SELECT net.http_post(
    url:='https://bhtsnervqiwchluwuxki.supabase.co/functions/v1/live-session-watchdog',
    headers:='{"Content-Type":"application/json","Authorization":"Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJodHNuZXJ2cWl3Y2hsdXd1eGtpIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjIzNDAxMzksImV4cCI6MjA3NzkxNjEzOX0.YccI5Y5qKKt1FzPt8g2C2lm0WADVQ0m21HZEKNn82Sw"}'::jsonb,
    body:='{"limit":100,"source":"cron_1min"}'::jsonb
  );
  $$
);

-- Backfill stuck agora_webcam sessions; cast enum values
WITH stuck AS (
  SELECT s.*
  FROM public.live_sessions s
  WHERE s.mode = 'agora_webcam'
    AND s.status IN ('live','starting','created','recording','ending','processing','processing_replay')
    AND (s.last_host_heartbeat_at IS NULL OR s.last_host_heartbeat_at < now() - interval '5 minutes')
), updated_sessions AS (
  UPDATE public.live_sessions s
     SET status = 'ended',
         ended_at = COALESCE(s.ended_at, now()),
         end_reason = COALESCE(s.end_reason, 'host_heartbeat_timeout'),
         host_connection_status = 'offline',
         recording_status = CASE
           WHEN s.recording_status IN ('ready','stopped','failed','missed') THEN s.recording_status
           WHEN (s.recording_resource_id IS NOT NULL OR s.resource_id IS NOT NULL)
             AND (s.recording_sid IS NOT NULL OR s.sid IS NOT NULL) THEN 'stopped'
           ELSE 'missed'
         END,
         recording_error = COALESCE(s.recording_error,
           CASE WHEN (s.recording_resource_id IS NULL AND s.resource_id IS NULL)
             OR (s.recording_sid IS NULL AND s.sid IS NULL)
             THEN 'recording_never_started' ELSE NULL END),
         archive_status = CASE
           WHEN (s.recording_resource_id IS NOT NULL OR s.resource_id IS NOT NULL)
             AND (s.recording_sid IS NOT NULL OR s.sid IS NOT NULL)
             AND s.archive_status IS DISTINCT FROM 'archived' THEN COALESCE(s.archive_status,'pending')
           ELSE 'unrecoverable'
         END,
         recovery_attempts = COALESCE(s.recovery_attempts,0) + 1,
         last_recovery_at = now(),
         updated_at = now(),
         last_cleanup_at = now()
   FROM stuck
   WHERE s.id = stuck.id
   RETURNING s.id, s.host_user_id, s.owner_id, s.user_id, s.post_id, s.live_post_id, s.mode,
             s.r2_video_url, s.playback_url, s.playback_provider
)
INSERT INTO public.live_replays(
  user_id, live_session_id, chunked_recording_id, status, replay_status,
  playback_type, playback_hls, temp_hls_url, playback_mp4, r2_video_url,
  archive_mp4_url, playback_provider, storage_provider, archive_status,
  error_message, updated_at
)
SELECT
  COALESCE(host_user_id, owner_id, user_id),
  id, id,
  (CASE WHEN r2_video_url IS NOT NULL THEN 'ready' ELSE 'failed' END)::live_replay_status,
  CASE
    WHEN r2_video_url IS NOT NULL THEN 'ready_mp4'
    WHEN playback_url LIKE '%.m3u8%' THEN 'ready_hls'
    ELSE 'failed_no_recording'
  END,
  CASE
    WHEN r2_video_url IS NOT NULL THEN 'mp4'
    WHEN playback_url LIKE '%.m3u8%' THEN 'hls'
    ELSE 'processing'
  END,
  CASE WHEN playback_url LIKE '%.m3u8%' THEN playback_url END,
  CASE WHEN playback_url LIKE '%.m3u8%' THEN playback_url END,
  CASE WHEN r2_video_url IS NOT NULL THEN r2_video_url END,
  r2_video_url,
  CASE WHEN r2_video_url IS NOT NULL THEN r2_video_url END,
  COALESCE(playback_provider,
    CASE WHEN r2_video_url IS NOT NULL THEN 'r2'
         WHEN playback_url LIKE '%.m3u8%' THEN 'r2_temp'
         ELSE 'r2_temp' END),
  CASE WHEN r2_video_url IS NOT NULL THEN 'r2'
       WHEN playback_url LIKE '%.m3u8%' THEN 'r2_temp'
       ELSE 'r2_temp' END,
  CASE WHEN r2_video_url IS NOT NULL THEN 'r2_ready'
       WHEN playback_url LIKE '%.m3u8%' THEN 'pending'
       ELSE 'failed' END,
  CASE WHEN r2_video_url IS NULL AND (playback_url IS NULL OR playback_url NOT LIKE '%.m3u8%')
       THEN 'Khong luu duoc video replay cho phien live nay.' END,
  now()
FROM updated_sessions
WHERE COALESCE(host_user_id, owner_id, user_id) IS NOT NULL
ON CONFLICT (chunked_recording_id) DO UPDATE
   SET replay_status = EXCLUDED.replay_status,
       status = EXCLUDED.status,
       playback_type = EXCLUDED.playback_type,
       playback_hls = COALESCE(public.live_replays.playback_hls, EXCLUDED.playback_hls),
       temp_hls_url = COALESCE(public.live_replays.temp_hls_url, EXCLUDED.temp_hls_url),
       playback_mp4 = COALESCE(public.live_replays.playback_mp4, EXCLUDED.playback_mp4),
       r2_video_url = COALESCE(public.live_replays.r2_video_url, EXCLUDED.r2_video_url),
       archive_mp4_url = COALESCE(public.live_replays.archive_mp4_url, EXCLUDED.archive_mp4_url),
       archive_status = EXCLUDED.archive_status,
       error_message = EXCLUDED.error_message,
       updated_at = now();

-- Sync post sang live_replay
UPDATE public.posts p
   SET post_type = 'live_replay',
       video_url = COALESCE(p.video_url, s.r2_video_url,
         CASE WHEN s.playback_url LIKE '%.m3u8%' THEN s.playback_url END),
       metadata = COALESCE(p.metadata,'{}'::jsonb) || jsonb_build_object(
         'live_status','ended',
         'live_mode', COALESCE(s.mode,'agora_webcam'),
         'live_session_id', s.id,
         'ended_at', COALESCE(s.ended_at, now()),
         'end_reason', COALESCE(s.end_reason,'host_heartbeat_timeout'),
         'replay_status',
           CASE WHEN s.r2_video_url IS NOT NULL THEN 'ready_mp4'
                WHEN s.playback_url LIKE '%.m3u8%' THEN 'ready_hls'
                ELSE 'failed_no_recording' END,
         'replay_ready', (s.r2_video_url IS NOT NULL OR s.playback_url LIKE '%.m3u8%'),
         'recording_status', s.recording_status,
         'processing_message',
           CASE WHEN s.r2_video_url IS NULL AND (s.playback_url IS NULL OR s.playback_url NOT LIKE '%.m3u8%')
                THEN 'Khong luu duoc video replay cho phien live nay.' END
       ),
       replay_status = CASE
         WHEN s.r2_video_url IS NOT NULL THEN 'ready_mp4'
         WHEN s.playback_url LIKE '%.m3u8%' THEN 'ready_hls'
         ELSE 'failed_no_recording' END,
       replay_ready = (s.r2_video_url IS NOT NULL OR s.playback_url LIKE '%.m3u8%'),
       playback_provider = CASE
         WHEN s.r2_video_url IS NOT NULL THEN 'r2'
         WHEN s.playback_url LIKE '%.m3u8%' THEN 'r2_temp'
         ELSE COALESCE(s.playback_provider,'r2_temp') END,
       updated_at = now()
  FROM public.live_sessions s
 WHERE s.mode = 'agora_webcam'
   AND s.status = 'ended'
   AND s.last_recovery_at > now() - interval '5 minutes'
   AND (p.id = s.post_id OR p.id = s.live_post_id)
   AND (p.post_type = 'live' OR (p.metadata->>'live_status') = 'live');

-- Reschedule cron jobs
SELECT cron.unschedule('agora-webcam-zombie-cleanup-every-1min')
 WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname='agora-webcam-zombie-cleanup-every-1min');

SELECT cron.schedule(
  'agora-webcam-zombie-cleanup-every-1min',
  '* * * * *',
  $$
  SELECT net.http_post(
    url:='https://bhtsnervqiwchluwuxki.supabase.co/functions/v1/live-zombie-cleanup',
    headers:='{"Content-Type":"application/json","Authorization":"Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJodHNuZXJ2cWl3Y2hsdXd1eGtpIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjIzNDAxMzksImV4cCI6MjA3NzkxNjEzOX0.YccI5Y5qKKt1FzPt8g2C2lm0WADVQ0m21HZEKNn82Sw"}'::jsonb,
    body:='{"limit":50,"source":"cron_1min"}'::jsonb
  );
  $$
);

SELECT cron.unschedule('agora-webcam-stuck-promoter-every-1min')
 WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname='agora-webcam-stuck-promoter-every-1min');

SELECT cron.schedule(
  'agora-webcam-stuck-promoter-every-1min',
  '* * * * *',
  $$
  SELECT net.http_post(
    url:='https://bhtsnervqiwchluwuxki.supabase.co/functions/v1/live-stuck-session-promoter',
    headers:='{"Content-Type":"application/json","Authorization":"Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJodHNuZXJ2cWl3Y2hsdXd1eGtpIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjIzNDAxMzksImV4cCI6MjA3NzkxNjEzOX0.YccI5Y5qKKt1FzPt8g2C2lm0WADVQ0m21HZEKNn82Sw"}'::jsonb,
    body:='{"limit":50,"source":"cron_1min"}'::jsonb
  );
  $$
);
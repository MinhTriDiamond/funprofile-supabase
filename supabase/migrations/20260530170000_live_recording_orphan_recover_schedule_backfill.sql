-- Wire the Agora webcam orphan recovery cron and silently classify old stuck rows.

SELECT cron.unschedule('live-recording-orphan-recover-every-10min')
WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'live-recording-orphan-recover-every-10min');

SELECT cron.schedule(
  'live-recording-orphan-recover-every-10min',
  '*/10 * * * *',
  $$
  select net.http_post(
    url:='https://bhtsnervqiwchluwuxki.supabase.co/functions/v1/live-recording-orphan-recover',
    headers:=jsonb_build_object(
      'Content-Type','application/json',
      'X-Cron-Secret', current_setting('app.cron_secret', true)
    ),
    body:='{"source":"pg_cron","limit":50}'::jsonb
  );
  $$
);

-- Recent processing sessions with real Agora ids can still be retried by the processor.
INSERT INTO public.live_session_events(live_session_id, from_status, to_status, source, reason, payload)
SELECT
  id,
  status,
  status,
  'migration:live_recording_orphan_recover_schedule_backfill',
  'silent_backfill_processing_retry',
  jsonb_build_object(
    'live_session_id', id,
    'previous_recording_status', recording_status,
    'previous_archive_status', archive_status,
    'timestamp', now()
  )
FROM public.live_sessions
WHERE mode = 'agora_webcam'
  AND recording_provider = 'agora'
  AND status = 'ended'
  AND recording_status = 'processing'
  AND recording_sid IS NOT NULL
  AND recording_resource_id IS NOT NULL
  AND COALESCE(ended_at, updated_at, created_at) > now() - interval '24 hours';

UPDATE public.live_sessions
SET
  recording_status = 'stopped',
  archive_status = 'pending',
  archive_retry_count = 0,
  archive_next_retry_at = now(),
  archive_error = NULL,
  recovery_attempts = 0,
  last_recovery_at = now(),
  updated_at = now()
WHERE mode = 'agora_webcam'
  AND recording_provider = 'agora'
  AND status = 'ended'
  AND recording_status = 'processing'
  AND recording_sid IS NOT NULL
  AND recording_resource_id IS NOT NULL
  AND COALESCE(ended_at, updated_at, created_at) > now() - interval '24 hours';

-- Old idle rows with no Agora ids never started recording; classify silently.
INSERT INTO public.live_session_events(live_session_id, from_status, to_status, source, reason, payload)
SELECT
  id,
  status,
  status,
  'migration:live_recording_orphan_recover_schedule_backfill',
  'silent_backfill_marked_missed',
  jsonb_build_object(
    'live_session_id', id,
    'previous_recording_status', recording_status,
    'reason', 'recording_never_started',
    'timestamp', now()
  )
FROM public.live_sessions
WHERE mode = 'agora_webcam'
  AND recording_provider = 'agora'
  AND status = 'ended'
  AND recording_status = 'idle'
  AND (recording_sid IS NULL OR recording_resource_id IS NULL);

UPDATE public.live_sessions
SET
  recording_status = 'missed',
  recording_error = COALESCE(recording_error, 'recording_never_started'),
  archive_status = 'unrecoverable',
  archive_next_retry_at = NULL,
  archive_error = COALESCE(archive_error, 'recording_never_started'),
  recovery_attempts = GREATEST(COALESCE(recovery_attempts, 0), 1),
  last_recovery_at = now(),
  updated_at = now()
WHERE mode = 'agora_webcam'
  AND recording_provider = 'agora'
  AND status = 'ended'
  AND recording_status = 'idle'
  AND (recording_sid IS NULL OR recording_resource_id IS NULL);

-- Very old processing rows have exhausted the useful recovery window; classify silently.
INSERT INTO public.live_session_events(live_session_id, from_status, to_status, source, reason, payload)
SELECT
  id,
  status,
  status,
  'migration:live_recording_orphan_recover_schedule_backfill',
  'silent_backfill_processing_failed',
  jsonb_build_object(
    'live_session_id', id,
    'previous_recording_status', recording_status,
    'previous_recovery_attempts', recovery_attempts,
    'reason', 'processing_stuck_backfill',
    'timestamp', now()
  )
FROM public.live_sessions
WHERE mode = 'agora_webcam'
  AND recording_provider = 'agora'
  AND status = 'ended'
  AND recording_status = 'processing'
  AND (
    COALESCE(ended_at, updated_at, created_at) <= now() - interval '24 hours'
    OR COALESCE(recovery_attempts, 0) >= 5
  );

UPDATE public.live_sessions
SET
  recording_status = 'failed',
  recording_error = COALESCE(recording_error, 'processing_stuck_backfill'),
  archive_status = 'unrecoverable',
  archive_next_retry_at = NULL,
  archive_error = COALESCE(archive_error, 'processing_stuck_backfill'),
  recovery_attempts = GREATEST(COALESCE(recovery_attempts, 0), 5),
  last_recovery_at = now(),
  updated_at = now()
WHERE mode = 'agora_webcam'
  AND recording_provider = 'agora'
  AND status = 'ended'
  AND recording_status = 'processing'
  AND (
    COALESCE(ended_at, updated_at, created_at) <= now() - interval '24 hours'
    OR COALESCE(recovery_attempts, 0) >= 5
  );

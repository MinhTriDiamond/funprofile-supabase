ALTER TABLE public.live_sessions
  ADD COLUMN IF NOT EXISTS temp_bucket text,
  ADD COLUMN IF NOT EXISTS temp_object_key text,
  ADD COLUMN IF NOT EXISTS archive_bucket text,
  ADD COLUMN IF NOT EXISTS archive_object_key text,
  ADD COLUMN IF NOT EXISTS replay_url text,
  ADD COLUMN IF NOT EXISTS thumbnail_url text,
  ADD COLUMN IF NOT EXISTS error_message text,
  ADD COLUMN IF NOT EXISTS recording_files jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS recording_uid integer,
  ADD COLUMN IF NOT EXISTS recording_started_at timestamptz,
  ADD COLUMN IF NOT EXISTS recording_error text;

ALTER TABLE public.live_sessions
  DROP CONSTRAINT IF EXISTS live_sessions_recording_status_check;

ALTER TABLE public.live_sessions
  ADD CONSTRAINT live_sessions_recording_status_check
  CHECK (
    recording_status IS NULL OR recording_status = ANY (ARRAY[
      'idle','acquiring','starting','recording','started','stopping','stopped',
      'processing','ready','failed','error','skipped','missing_ids'
    ])
  );

CREATE INDEX IF NOT EXISTS idx_live_sessions_webcam_recording_processor
  ON public.live_sessions (mode, status, recording_status, updated_at)
  WHERE mode = 'agora_webcam' AND deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_live_sessions_temp_object_key
  ON public.live_sessions (temp_object_key)
  WHERE temp_object_key IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_live_sessions_archive_object_key
  ON public.live_sessions (archive_object_key)
  WHERE archive_object_key IS NOT NULL;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'agora-webcam-recording-processor-every-1min') THEN
    PERFORM cron.unschedule('agora-webcam-recording-processor-every-1min');
  END IF;
END $$;

SELECT cron.schedule(
  'agora-webcam-recording-processor-every-1min',
  '* * * * *',
  $cron$
  select net.http_post(
    url:='https://bhtsnervqiwchluwuxki.supabase.co/functions/v1/live-webcam-recording-processor',
    headers:='{"Content-Type":"application/json"}'::jsonb,
    body:='{"source":"pg_cron"}'::jsonb
  );
  $cron$
);
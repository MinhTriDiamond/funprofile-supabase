-- Rollback for 20261015091000_reduce_agora_processor_cron_after_parity.sql.
-- Run only against the same verified production project after confirming this
-- job is currently on the Stage B five-minute cadence.
DO $$
DECLARE
  target_job_id bigint;
  current_schedule text;
  target_command text;
BEGIN
  SELECT jobid, schedule, command
    INTO target_job_id, current_schedule, target_command
  FROM cron.job
  WHERE jobname = 'agora-webcam-recording-processor-every-1min'
    AND active;

  IF target_job_id IS NULL THEN
    RAISE EXCEPTION 'Expected active Agora recording processor cron job was not found';
  END IF;
  IF current_schedule <> '*/5 * * * *' THEN
    RAISE EXCEPTION 'Expected Stage B schedule */5 * * * *, found %', current_schedule;
  END IF;
  IF position('https://tljfqavndndfsvtazibe.supabase.co/functions/v1/live-webcam-recording-processor' IN target_command) = 0 THEN
    RAISE EXCEPTION 'Cron target does not match the verified production project/function';
  END IF;

  PERFORM cron.alter_job(target_job_id, schedule => '* * * * *');
END;
$$;

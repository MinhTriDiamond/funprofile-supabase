
ALTER TABLE public.live_sessions DROP CONSTRAINT IF EXISTS live_sessions_recording_status_check;
ALTER TABLE public.live_sessions ADD CONSTRAINT live_sessions_recording_status_check
  CHECK (
    recording_status IS NULL OR recording_status = ANY (ARRAY[
      'idle','acquiring','starting','recording','started','stopping','stopped',
      'processing','ready','failed','error','skipped','missing_ids','missed',
      'failed_credentials','failed_no_recording'
    ])
  );

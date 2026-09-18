
ALTER TABLE public.live_sessions DROP CONSTRAINT IF EXISTS live_sessions_status_check;
ALTER TABLE public.live_sessions ADD CONSTRAINT live_sessions_status_check
  CHECK (status = ANY (ARRAY[
    'idle','preparing','waiting_for_obs','source_connected','ready_to_go_live',
    'live','disconnect_grace','ended','processing_replay','archived','failed',
    'created','processing','processing_stream','stream_ready','exporting_mp4',
    'uploading_r2','verifying_r2','replay_posted','stream_deleted','posted','archiving',
    -- Hybrid replay state machine (new):
    'replay_temp_ready','archiving_r2','r2_ready','stream_delete_pending'
  ]));

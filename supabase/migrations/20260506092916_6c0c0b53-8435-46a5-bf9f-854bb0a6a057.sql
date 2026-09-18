UPDATE public.live_replays
SET status = 'awaiting_chunks',
    last_cf_status = 'reset_for_uniform_part_fix',
    error_message = NULL,
    last_error_at = NULL,
    concat_upload_id = NULL,
    concat_plan = NULL,
    concat_completed_parts = '[]'::jsonb,
    concat_next_part = 0,
    concat_started_at = NULL,
    source_webm_key = NULL
WHERE id = '3beb335f-7737-4a4e-b3ee-d90518d44d54';
CREATE UNIQUE INDEX IF NOT EXISTS live_replays_recording_uniq
ON public.live_replays(chunked_recording_id)
WHERE chunked_recording_id IS NOT NULL;
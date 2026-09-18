DROP INDEX IF EXISTS public.live_replays_recording_uniq;
ALTER TABLE public.live_replays ALTER COLUMN chunked_recording_id SET NOT NULL;
ALTER TABLE public.live_replays ADD CONSTRAINT live_replays_recording_uniq UNIQUE (chunked_recording_id);
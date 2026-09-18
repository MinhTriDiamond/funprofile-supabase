-- Allow terminal "no recording" replay state without hiding the feed post.

ALTER TABLE public.live_replays
  DROP CONSTRAINT IF EXISTS live_replays_replay_status_check;

ALTER TABLE public.live_replays
  ADD CONSTRAINT live_replays_replay_status_check
  CHECK (replay_status = ANY (ARRAY[
    'processing',
    'ready_hls',
    'archiving',
    'ready_mp4',
    'failed',
    'failed_no_recording'
  ]));

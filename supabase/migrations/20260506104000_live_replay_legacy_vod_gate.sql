-- Gate Cloudflare Stream VOD ingest so old live recordings can stay on chunked playback.
-- New rows default to Cloudflare VOD enabled; a follow-up migration marks existing
-- unfinished replays as legacy-skipped.

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_enum e
    JOIN pg_type t ON t.oid = e.enumtypid
    WHERE t.typname = 'live_replay_status'
      AND e.enumlabel = 'skipped_legacy'
  ) THEN
    ALTER TYPE public.live_replay_status ADD VALUE 'skipped_legacy';
  END IF;
END $$;

ALTER TABLE public.live_replays
  ADD COLUMN IF NOT EXISTS cloudflare_vod_enabled BOOLEAN NOT NULL DEFAULT true;

CREATE INDEX IF NOT EXISTS idx_live_replays_vod_enabled_status
  ON public.live_replays(cloudflare_vod_enabled, status, last_ingest_at);

ALTER TABLE public.live_replays
  ADD COLUMN IF NOT EXISTS source_webm_size BIGINT,
  ADD COLUMN IF NOT EXISTS concat_started_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS concat_completed_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_live_replays_normalizing
  ON public.live_replays (status, cloudflare_vod_enabled)
  WHERE status = 'normalizing';

CREATE INDEX IF NOT EXISTS idx_live_replays_queued_for_copy
  ON public.live_replays (status, cloudflare_vod_enabled)
  WHERE status = 'queued' AND stream_uid IS NULL;
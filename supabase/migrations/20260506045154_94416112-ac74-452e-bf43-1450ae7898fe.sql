-- 1. Add new enum value
ALTER TYPE live_replay_status ADD VALUE IF NOT EXISTS 'skipped_legacy';

-- 2. Add cloudflare_vod_enabled column
ALTER TABLE public.live_replays
  ADD COLUMN IF NOT EXISTS cloudflare_vod_enabled boolean NOT NULL DEFAULT true;

CREATE INDEX IF NOT EXISTS idx_live_replays_vod_enabled_status
  ON public.live_replays (cloudflare_vod_enabled, status)
  WHERE cloudflare_vod_enabled = true;

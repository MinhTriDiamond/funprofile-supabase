ALTER TABLE public.live_replays
  ADD COLUMN IF NOT EXISTS posted_at timestamptz;

ALTER TABLE public.creator_library
  ADD COLUMN IF NOT EXISTS posted_at timestamptz;

UPDATE public.live_replays
SET posted_at = COALESCE(posted_at, auto_posted_at)
WHERE posted_at IS NULL AND auto_posted_at IS NOT NULL;

UPDATE public.creator_library
SET posted_at = COALESCE(posted_at, archived_at)
WHERE posted_at IS NULL AND archived_at IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_live_replays_posted_at
  ON public.live_replays(posted_at DESC)
  WHERE posted_at IS NOT NULL;
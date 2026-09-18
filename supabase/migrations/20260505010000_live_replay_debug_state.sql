ALTER TABLE public.live_replays
  ADD COLUMN IF NOT EXISTS webhook_received_at timestamptz,
  ADD COLUMN IF NOT EXISTS last_webhook_event text,
  ADD COLUMN IF NOT EXISTS last_cf_status text,
  ADD COLUMN IF NOT EXISTS last_cf_response jsonb,
  ADD COLUMN IF NOT EXISTS last_error_at timestamptz;

CREATE INDEX IF NOT EXISTS idx_live_replays_webhook_received
  ON public.live_replays(webhook_received_at DESC)
  WHERE webhook_received_at IS NOT NULL;

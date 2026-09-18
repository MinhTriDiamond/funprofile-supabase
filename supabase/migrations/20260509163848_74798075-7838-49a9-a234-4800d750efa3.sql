-- Facebook-style RTMP/OBS Live Producer state.

ALTER TABLE public.live_sessions
  ADD COLUMN IF NOT EXISTS stream_key_last_reset_at timestamptz,
  ADD COLUMN IF NOT EXISTS source_connected_at timestamptz,
  ADD COLUMN IF NOT EXISTS go_live_clicked_at timestamptz,
  ADD COLUMN IF NOT EXISTS live_post_id uuid REFERENCES public.posts(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS replay_post_id uuid REFERENCES public.posts(id) ON DELETE SET NULL;

UPDATE public.live_sessions
SET live_post_id = COALESCE(live_post_id, post_id)
WHERE live_post_id IS NULL AND post_id IS NOT NULL;

ALTER TABLE public.live_sessions DROP CONSTRAINT IF EXISTS live_sessions_status_check;

ALTER TABLE public.live_sessions
  ADD CONSTRAINT live_sessions_status_check
  CHECK (status IN (
    'created',
    'waiting_for_obs',
    'source_connected',
    'ready_to_go_live',
    'live',
    'ended',
    'processing',
    'archiving',
    'posted',
    'failed'
  ));

DROP POLICY IF EXISTS "public can read live sessions" ON public.live_sessions;
CREATE POLICY "public can read live sessions"
  ON public.live_sessions FOR SELECT
  TO anon, authenticated
  USING (status IN ('live', 'ended', 'processing', 'archiving', 'posted'));

CREATE INDEX IF NOT EXISTS idx_live_sessions_rtmp_producer_status
  ON public.live_sessions(owner_id, mode, status, updated_at DESC)
  WHERE mode = 'rtmp_obs' AND deleted_at IS NULL;
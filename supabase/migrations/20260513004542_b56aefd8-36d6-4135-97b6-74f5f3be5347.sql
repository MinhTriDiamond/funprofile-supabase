
-- 1) Mở rộng CHECK constraint cho status (giữ tương thích status cũ)
ALTER TABLE public.live_sessions
  DROP CONSTRAINT IF EXISTS live_sessions_status_check;

ALTER TABLE public.live_sessions
  ADD CONSTRAINT live_sessions_status_check CHECK (status IN (
    'idle','preparing','waiting_for_obs','source_connected',
    'ready_to_go_live','live','disconnect_grace',
    'ended','processing_replay','archived','failed',
    -- legacy
    'created','processing','processing_stream','stream_ready',
    'exporting_mp4','uploading_r2','verifying_r2','replay_posted','stream_deleted','posted','archiving'
  ));

-- 2) Audit table cho mọi state transition
CREATE TABLE IF NOT EXISTS public.live_session_events (
  id BIGSERIAL PRIMARY KEY,
  live_session_id UUID NOT NULL REFERENCES public.live_sessions(id) ON DELETE CASCADE,
  from_status TEXT,
  to_status TEXT,
  source TEXT, -- 'create' | 'poll' | 'webhook' | 'user' | 'cron' | 'system'
  reason TEXT,
  payload JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_live_session_events_session_created
  ON public.live_session_events(live_session_id, created_at DESC);

ALTER TABLE public.live_session_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS live_session_events_owner_read ON public.live_session_events;
CREATE POLICY live_session_events_owner_read ON public.live_session_events
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.live_sessions s
      WHERE s.id = live_session_events.live_session_id
        AND (s.owner_id = auth.uid() OR s.host_user_id = auth.uid())
    )
  );

-- service role bypass RLS — không cần policy insert cho client.

-- 3) Trigger guard chặn transition không hợp lệ
CREATE OR REPLACE FUNCTION public.live_sessions_state_guard()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF OLD.status IS DISTINCT FROM NEW.status THEN
    -- Phiên đã archived là terminal hoàn toàn
    IF OLD.status = 'archived' AND NEW.status <> 'archived' THEN
      RAISE EXCEPTION 'invalid_transition: archived -> %', NEW.status;
    END IF;
    -- Phiên đã ended/processing_replay không được quay lại các trạng thái live-active
    IF OLD.status IN ('ended','processing_replay','archived','posted','replay_posted')
       AND NEW.status IN ('live','source_connected','ready_to_go_live','waiting_for_obs','disconnect_grace','preparing','idle') THEN
      RAISE EXCEPTION 'invalid_transition: % -> %', OLD.status, NEW.status;
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_live_sessions_state_guard ON public.live_sessions;
CREATE TRIGGER trg_live_sessions_state_guard
  BEFORE UPDATE ON public.live_sessions
  FOR EACH ROW
  WHEN (OLD.status IS DISTINCT FROM NEW.status)
  EXECUTE FUNCTION public.live_sessions_state_guard();

-- 4) Backfill chuẩn hoá phiên RTMP cũ đang treo status='created'
UPDATE public.live_sessions
   SET status = 'waiting_for_obs', updated_at = now()
 WHERE status = 'created'
   AND mode = 'rtmp_obs'
   AND ended_at IS NULL;

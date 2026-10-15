-- Durable idempotency for Agora Cloud Recording Notifications.
-- The existing live_session_events retention job removes receipts after 45 days.
CREATE UNIQUE INDEX IF NOT EXISTS idx_live_session_events_agora_event_key
  ON public.live_session_events ((payload->>'agora_event_key'))
  WHERE source = 'agora-cloud-recording-webhook'
    AND payload ? 'agora_event_key';

-- Rollback:
-- DROP INDEX IF EXISTS public.idx_live_session_events_agora_event_key;

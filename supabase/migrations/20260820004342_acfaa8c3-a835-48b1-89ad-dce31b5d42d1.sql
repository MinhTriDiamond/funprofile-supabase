UPDATE public.live_sessions
SET status = 'ended',
    updated_at = now()
WHERE ended_at IS NOT NULL
  AND status IN ('live','starting','created','recording','processing','processing_replay','disconnect_grace','source_connected','ready_to_go_live');
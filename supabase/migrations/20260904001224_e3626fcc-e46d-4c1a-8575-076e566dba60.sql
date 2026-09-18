ALTER TABLE public.scanner_tick_log
  ADD COLUMN IF NOT EXISTS rpc_endpoint_stats jsonb NOT NULL DEFAULT '[]'::jsonb;
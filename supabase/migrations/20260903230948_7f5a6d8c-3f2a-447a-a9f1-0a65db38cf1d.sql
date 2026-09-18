ALTER TABLE public.scanner_block_gaps DROP CONSTRAINT IF EXISTS scanner_block_gaps_reason_check;
ALTER TABLE public.scanner_block_gaps ADD CONSTRAINT scanner_block_gaps_reason_check
  CHECK (reason = ANY (ARRAY['null_from_node'::text, 'rpc_error'::text, 'erc20_getlogs_error'::text]));

CREATE TABLE IF NOT EXISTS public.scanner_tick_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  chain_id integer NOT NULL DEFAULT 56,
  mode text NOT NULL DEFAULT 'compare_only_phase1',
  head_block bigint,
  safe_head bigint,
  scanned_ranges jsonb NOT NULL DEFAULT '{}'::jsonb,
  candidates integer NOT NULL DEFAULT 0,
  missing_in_db integer NOT NULL DEFAULT 0,
  gap_blocks_added integer NOT NULL DEFAULT 0,
  gaps_resolved integer NOT NULL DEFAULT 0,
  watermark_advanced boolean NOT NULL DEFAULT false,
  wallets_tracked integer NOT NULL DEFAULT 0,
  rpc_healthy integer NOT NULL DEFAULT 0,
  duration_ms integer,
  ok boolean NOT NULL DEFAULT true,
  error_message text,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.scanner_tick_log TO authenticated;
GRANT ALL ON public.scanner_tick_log TO service_role;

ALTER TABLE public.scanner_tick_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can read scanner tick log"
  ON public.scanner_tick_log FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

CREATE INDEX IF NOT EXISTS idx_scanner_tick_log_created_at
  ON public.scanner_tick_log (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_scanner_tick_log_missing
  ON public.scanner_tick_log (created_at DESC) WHERE missing_in_db > 0;
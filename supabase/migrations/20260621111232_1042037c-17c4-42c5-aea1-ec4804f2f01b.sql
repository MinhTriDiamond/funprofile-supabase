CREATE TABLE IF NOT EXISTS public.btc_blocktime_staging_20260621 (
  tx_hash text PRIMARY KEY,
  block_time timestamptz NOT NULL
);
GRANT SELECT, INSERT ON public.btc_blocktime_staging_20260621 TO authenticated;
GRANT ALL ON public.btc_blocktime_staging_20260621 TO service_role;
ALTER TABLE public.btc_blocktime_staging_20260621 ENABLE ROW LEVEL SECURITY;
CREATE POLICY "admin_only_staging" ON public.btc_blocktime_staging_20260621
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin'))
  WITH CHECK (public.has_role(auth.uid(),'admin'));
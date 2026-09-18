DROP POLICY IF EXISTS "admin_only_staging" ON public.btc_blocktime_staging_20260621;
ALTER TABLE public.btc_blocktime_staging_20260621 DISABLE ROW LEVEL SECURITY;
GRANT INSERT, SELECT ON public.btc_blocktime_staging_20260621 TO PUBLIC;
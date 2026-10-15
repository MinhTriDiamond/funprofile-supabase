DROP POLICY "suspicious user read own" ON public.suspicious_wallet_events;
CREATE POLICY "suspicious user read own" ON public.suspicious_wallet_events
  FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.user_watched_wallets uw
                 WHERE uw.user_id = auth.uid() AND lower(uw.address) = lower(suspicious_wallet_events.watched_address)));
DROP VIEW IF EXISTS public.user_custodial_wallets;
DROP TABLE IF EXISTS public.custodial_wallets;
SELECT (SELECT COUNT(*) FROM information_schema.tables WHERE table_schema='public' AND table_name='custodial_wallets') AS live_table_left,
       (SELECT COUNT(*) FROM information_schema.views WHERE table_schema='public' AND table_name='user_custodial_wallets') AS live_view_left,
       (SELECT COUNT(*) FROM public.custodial_wallets_archive_20261015) AS archive_rows,
       (SELECT COUNT(*) FROM pg_policies WHERE schemaname='public' AND (qual ILIKE '%custodial\_wallets%' ESCAPE '\' OR with_check ILIKE '%custodial\_wallets%' ESCAPE '\')) AS policies_still_referencing;

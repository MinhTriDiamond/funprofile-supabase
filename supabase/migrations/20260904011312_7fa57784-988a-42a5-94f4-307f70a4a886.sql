REVOKE ALL ON public.scanner_tick_log FROM anon;
REVOKE ALL ON public.scanner_tick_log FROM authenticated;
REVOKE ALL ON public.scanner_tick_log FROM PUBLIC;
GRANT SELECT ON public.scanner_tick_log TO authenticated;
GRANT ALL ON public.scanner_tick_log TO service_role;
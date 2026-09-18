ALTER PUBLICATION supabase_realtime ADD TABLE public.pplp_v2_event_log;
ALTER TABLE public.pplp_v2_event_log REPLICA IDENTITY FULL;
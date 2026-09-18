ALTER TABLE public.live_replays ADD COLUMN _schema_reload_ping text;
ALTER TABLE public.live_replays DROP COLUMN _schema_reload_ping;
NOTIFY pgrst, 'reload schema';
NOTIFY pgrst, 'reload config';
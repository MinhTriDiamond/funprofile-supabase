-- Incident 2026-10-22 follow-up (approved by Tri): ban the 14 sibling probe accounts + build the watchlist
-- 1) Ban every @tanpony.com account (15 total incl. elqs3fz012) and kill any sessions
UPDATE auth.users
SET banned_until = now() + interval '100 years', updated_at = now()
WHERE email LIKE '%@tanpony.com';
DELETE FROM auth.refresh_tokens
WHERE session_id IN (SELECT s.id FROM auth.sessions s JOIN auth.users u ON u.id = s.user_id WHERE u.email LIKE '%@tanpony.com');
DELETE FROM auth.sessions
WHERE user_id IN (SELECT id FROM auth.users WHERE email LIKE '%@tanpony.com');
-- 2) Watchlist tables (RLS on, no API grants - internal only)
CREATE TABLE IF NOT EXISTS public.security_watchlist (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  kind text NOT NULL,
  value text NOT NULL,
  note text,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (kind, value)
);
ALTER TABLE public.security_watchlist ENABLE ROW LEVEL SECURITY;
INSERT INTO public.security_watchlist (kind, value, note) VALUES
  ('email_domain', 'tanpony.com', 'Disposable-mail domain used by the 2026-10-17..22 probe campaign (15 accounts)'),
  ('ip', '187.15.103.54', 'Attack session IP, Brazil AS269233, python tooling, 2026-10-22'),
  ('ip', '187.15.100.104', 'Attack session IP, same Brazil range, 2026-10-22')
ON CONFLICT (kind, value) DO NOTHING;
INSERT INTO public.security_watchlist (kind, value, note)
SELECT 'username', p.username, 'Probe-campaign account, banned 2026-10-22'
FROM public.profiles p JOIN auth.users u ON u.id = p.id
WHERE u.email LIKE '%@tanpony.com'
ON CONFLICT (kind, value) DO NOTHING;
CREATE TABLE IF NOT EXISTS public.security_watchlist_hits (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  kind text NOT NULL,
  subject_id uuid,
  detail jsonb,
  detected_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.security_watchlist_hits ENABLE ROW LEVEL SECURITY;
CREATE UNIQUE INDEX IF NOT EXISTS sw_hits_signup_uniq
  ON public.security_watchlist_hits (kind, subject_id) WHERE kind = 'watched_domain_signup';
CREATE UNIQUE INDEX IF NOT EXISTS sw_hits_ip_uniq
  ON public.security_watchlist_hits (kind, subject_id, ((detail->>'ip'))) WHERE kind = 'watched_ip_session';
-- 3) Hourly scan: new signups from watched domains + new sessions from watched IPs
CREATE OR REPLACE FUNCTION public.scan_security_watchlist()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE n integer := 0; m integer := 0;
BEGIN
  INSERT INTO public.security_watchlist_hits (kind, subject_id, detail)
  SELECT 'watched_domain_signup', u.id,
         jsonb_build_object('email', u.email, 'username', p.username, 'user_created_at', u.created_at)
  FROM auth.users u
  LEFT JOIN public.profiles p ON p.id = u.id
  WHERE split_part(u.email, '@', 2) IN (SELECT value FROM public.security_watchlist WHERE kind = 'email_domain')
  ON CONFLICT DO NOTHING;
  GET DIAGNOSTICS n = ROW_COUNT;
  INSERT INTO public.security_watchlist_hits (kind, subject_id, detail)
  SELECT 'watched_ip_session', s.user_id,
         jsonb_build_object('ip', s.ip::text, 'session_created_at', s.created_at, 'user_agent', s.user_agent)
  FROM auth.sessions s
  WHERE s.ip::text IN (SELECT value FROM public.security_watchlist WHERE kind = 'ip')
  ON CONFLICT DO NOTHING;
  GET DIAGNOSTICS m = ROW_COUNT;
  RETURN n + m;
END;
$function$;
SELECT cron.schedule('security-watchlist-scan', '17 * * * *', 'SELECT public.scan_security_watchlist()');
-- Summary
SELECT (SELECT count(*) FROM auth.users WHERE email LIKE '%@tanpony.com' AND banned_until > now()) AS tanpony_banned,
       (SELECT count(*) FROM auth.sessions s JOIN auth.users u ON u.id = s.user_id WHERE u.email LIKE '%@tanpony.com') AS tanpony_sessions_left,
       (SELECT count(*) FROM public.security_watchlist) AS watchlist_entries,
       (SELECT jobid FROM cron.job WHERE jobname = 'security-watchlist-scan') AS cron_jobid;

CREATE TABLE public.stale_unaccepted_accounts_log (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid NOT NULL,
  email text,
  account_created_at timestamptz,
  last_signed_in_at timestamptz,
  days_stale integer,
  threshold_days integer NOT NULL DEFAULT 90,
  scanned_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.stale_unaccepted_accounts_log TO authenticated;
GRANT ALL ON public.stale_unaccepted_accounts_log TO service_role;

ALTER TABLE public.stale_unaccepted_accounts_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can read stale unaccepted log"
ON public.stale_unaccepted_accounts_log
FOR SELECT
TO authenticated
USING (public.has_role(auth.uid(), 'admin'));

CREATE INDEX idx_stale_unaccepted_log_scanned_at ON public.stale_unaccepted_accounts_log (scanned_at DESC);
CREATE INDEX idx_stale_unaccepted_log_user ON public.stale_unaccepted_accounts_log (user_id);

CREATE OR REPLACE FUNCTION public.scan_stale_unaccepted_accounts(p_threshold_days integer DEFAULT 90)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_count integer := 0;
  v_now timestamptz := now();
BEGIN
  INSERT INTO public.stale_unaccepted_accounts_log
    (user_id, email, account_created_at, last_signed_in_at, days_stale, threshold_days, scanned_at)
  SELECT
    p.id,
    p.email,
    p.created_at,
    u.last_sign_in_at,
    EXTRACT(DAY FROM (v_now - p.created_at))::integer,
    p_threshold_days,
    v_now
  FROM public.profiles p
  JOIN auth.users u ON u.id = p.id
  WHERE COALESCE(p.law_of_light_accepted, false) = false
    AND p.created_at < v_now - make_interval(days => p_threshold_days)
    AND (u.last_sign_in_at IS NULL OR u.last_sign_in_at < v_now - make_interval(days => p_threshold_days));

  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END;
$$;

REVOKE ALL ON FUNCTION public.scan_stale_unaccepted_accounts(integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.scan_stale_unaccepted_accounts(integer) TO service_role;

SELECT cron.schedule(
  'stale-unaccepted-accounts-log-daily',
  '45 3 * * *',
  $$SELECT public.scan_stale_unaccepted_accounts(90);$$
);
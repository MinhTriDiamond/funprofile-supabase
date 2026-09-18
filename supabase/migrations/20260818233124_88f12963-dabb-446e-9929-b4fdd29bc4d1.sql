CREATE TABLE IF NOT EXISTS public.job_leases (
  job_name text PRIMARY KEY,
  owner_token text NOT NULL,
  acquired_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.job_leases TO authenticated;
GRANT ALL ON public.job_leases TO service_role;

ALTER TABLE public.job_leases ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can read job leases"
  ON public.job_leases FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Service role manages job leases"
  ON public.job_leases FOR ALL TO service_role
  USING (true) WITH CHECK (true);

CREATE OR REPLACE FUNCTION public.job_acquire_lease(p_job_name text, p_owner_token text, p_ttl_seconds integer DEFAULT 600)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_ok boolean := false;
BEGIN
  IF p_job_name IS NULL OR p_owner_token IS NULL THEN
    RETURN false;
  END IF;

  INSERT INTO public.job_leases (job_name, owner_token, acquired_at, expires_at, updated_at)
  VALUES (p_job_name, p_owner_token, now(), now() + make_interval(secs => greatest(p_ttl_seconds, 10)), now())
  ON CONFLICT (job_name) DO UPDATE
    SET owner_token = EXCLUDED.owner_token,
        acquired_at = now(),
        expires_at  = EXCLUDED.expires_at,
        updated_at  = now()
    WHERE public.job_leases.expires_at < now()
       OR public.job_leases.owner_token = EXCLUDED.owner_token;

  SELECT (owner_token = p_owner_token AND expires_at > now())
    INTO v_ok
  FROM public.job_leases
  WHERE job_name = p_job_name;

  RETURN coalesce(v_ok, false);
END;
$$;

CREATE OR REPLACE FUNCTION public.job_release_lease(p_job_name text, p_owner_token text)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_deleted integer;
BEGIN
  DELETE FROM public.job_leases
  WHERE job_name = p_job_name AND owner_token = p_owner_token;
  GET DIAGNOSTICS v_deleted = ROW_COUNT;
  RETURN v_deleted > 0;
END;
$$;

REVOKE ALL ON FUNCTION public.job_acquire_lease(text, text, integer) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.job_release_lease(text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.job_acquire_lease(text, text, integer) TO service_role;
GRANT EXECUTE ON FUNCTION public.job_release_lease(text, text) TO service_role;

ALTER TABLE public.mint_epochs
  ADD COLUMN IF NOT EXISTS guard_bypassed boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS guard_report jsonb,
  ADD COLUMN IF NOT EXISTS guard_bypassed_by uuid,
  ADD COLUMN IF NOT EXISTS guard_bypassed_at timestamptz;
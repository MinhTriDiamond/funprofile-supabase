CREATE TABLE IF NOT EXISTS public.moralis_api_usage (
  usage_date date PRIMARY KEY,
  call_count bigint NOT NULL DEFAULT 0,
  daily_limit bigint NOT NULL DEFAULT 40000,
  alert_threshold_pct numeric NOT NULL DEFAULT 80,
  alerted_at timestamptz,
  last_source text,
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.moralis_api_usage TO authenticated;
GRANT ALL ON public.moralis_api_usage TO service_role;

ALTER TABLE public.moralis_api_usage ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admins can read moralis usage" ON public.moralis_api_usage;
CREATE POLICY "Admins can read moralis usage"
ON public.moralis_api_usage
FOR SELECT
TO authenticated
USING (public.has_role(auth.uid(), 'admin'));

CREATE OR REPLACE FUNCTION public.moralis_usage_record(
  p_calls integer,
  p_source text DEFAULT NULL
)
RETURNS TABLE (
  call_count bigint,
  daily_limit bigint,
  pct_used numeric,
  should_alert boolean
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_row public.moralis_api_usage;
  v_pct numeric;
  v_alert boolean := false;
BEGIN
  IF p_calls IS NULL OR p_calls <= 0 THEN
    RAISE EXCEPTION 'p_calls must be > 0';
  END IF;

  INSERT INTO public.moralis_api_usage AS m (usage_date, call_count, last_source)
  VALUES ((now() AT TIME ZONE 'utc')::date, p_calls, p_source)
  ON CONFLICT (usage_date) DO UPDATE
    SET call_count = m.call_count + EXCLUDED.call_count,
        last_source = COALESCE(EXCLUDED.last_source, m.last_source),
        updated_at = now()
  RETURNING * INTO v_row;

  v_pct := CASE WHEN v_row.daily_limit > 0
                THEN (v_row.call_count::numeric * 100) / v_row.daily_limit
                ELSE 0 END;

  IF v_pct >= v_row.alert_threshold_pct AND v_row.alerted_at IS NULL THEN
    UPDATE public.moralis_api_usage
       SET alerted_at = now()
     WHERE usage_date = v_row.usage_date;
    v_alert := true;
  END IF;

  RETURN QUERY SELECT v_row.call_count, v_row.daily_limit, round(v_pct, 2), v_alert;
END;
$$;

REVOKE ALL ON FUNCTION public.moralis_usage_record(integer, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.moralis_usage_record(integer, text) FROM anon;
REVOKE ALL ON FUNCTION public.moralis_usage_record(integer, text) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.moralis_usage_record(integer, text) TO service_role;

DO $$
DECLARE v_jobid bigint;
BEGIN
  SELECT jobid INTO v_jobid FROM cron.job WHERE jobname = 'fast-scan-donations-every-minute';
  IF v_jobid IS NOT NULL THEN
    PERFORM cron.alter_job(v_jobid, schedule => '*/3 * * * *');
  END IF;
END $$;
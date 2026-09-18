CREATE OR REPLACE FUNCTION public.get_donation_global_stats(p_time_range text DEFAULT 'all')
RETURNS TABLE(
  total_donated_usd numeric,
  total_donors bigint,
  total_recipients bigint,
  total_donations bigint,
  total_light_score numeric
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_since timestamptz;
BEGIN
  v_since := CASE p_time_range
    WHEN 'day' THEN now() - interval '1 day'
    WHEN 'week' THEN now() - interval '7 days'
    WHEN 'month' THEN now() - interval '30 days'
    ELSE NULL
  END;

  RETURN QUERY
  SELECT
    COALESCE(SUM(d.amount_usd), 0)::numeric AS total_donated_usd,
    COUNT(DISTINCT d.sender_id)::bigint AS total_donors,
    COUNT(DISTINCT d.recipient_id)::bigint AS total_recipients,
    COUNT(*)::bigint AS total_donations,
    COALESCE(SUM(d.light_score_earned), 0)::numeric AS total_light_score
  FROM donations d
  WHERE (d.status = 'confirmed' OR d.status IS NULL)
    AND (v_since IS NULL OR d.created_at >= v_since);
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_donation_global_stats(text) TO anon, authenticated;
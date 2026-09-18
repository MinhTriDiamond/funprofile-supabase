pg_get_functiondef
CREATE OR REPLACE FUNCTION public.get_donation_global_stats(p_time_range text DEFAULT 'all'::text, p_from timestamp with time zone DEFAULT NULL::timestamp with time zone, p_to timestamp with time zone DEFAULT NULL::timestamp with time zone)
 RETURNS TABLE(totals_by_token jsonb, total_donated_usd numeric, total_donations bigint, total_donors bigint, total_recipients bigint, total_light_score numeric)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_since timestamptz;
  v_until timestamptz;
BEGIN
  IF p_from IS NOT NULL OR p_to IS NOT NULL THEN
    v_since := p_from;
    v_until := p_to;
  ELSE
    v_until := NULL;
    v_since := CASE p_time_range
      WHEN 'day' THEN now() - interval '1 day'
      WHEN 'week' THEN now() - interval '7 days'
      WHEN 'month' THEN now() - interval '30 days'
      ELSE NULL
    END;
  END IF;

  RETURN QUERY
  WITH base AS (
    SELECT
      d.token_symbol,
      d.amount::numeric AS amount,
      COALESCE(d.amount_usd, 0)::numeric AS amount_usd,
      d.sender_id,
      d.recipient_id,
      d.tx_hash,
      COALESCE(d.light_score_earned, 0)::numeric AS light_score_earned
    FROM public.donations d
    JOIN public.profiles ps ON ps.id = d.sender_id
    JOIN public.profiles pr ON pr.id = d.recipient_id
    WHERE (d.status = 'confirmed' OR d.status IS NULL)
      AND d.sender_id IS NOT NULL
      AND d.recipient_id IS NOT NULL
      AND COALESCE(d.is_external, false) = false
      AND d.leaderboard_eligibility = 'internal'
      AND NOT COALESCE(ps.exclude_from_leaderboard, false)
      AND NOT COALESCE(pr.exclude_from_leaderboard, false)
      AND (v_since IS NULL OR d.created_at >= v_since)
      AND (v_until IS NULL OR d.created_at <= v_until)
  ), per_token AS (
    SELECT
      token_symbol,
      SUM(amount) AS token_amount,
      SUM(amount_usd) AS token_usd,
      COUNT(DISTINCT tx_hash) AS token_transactions
    FROM base
    GROUP BY token_symbol
  )
  SELECT
    (
      SELECT COALESCE(
        jsonb_object_agg(
          token_symbol,
          jsonb_build_object(
            'amount', token_amount,
            'usd', token_usd,
            'transactions', token_transactions
          )
          ORDER BY token_symbol
        ),
        '{}'::jsonb
      )
      FROM per_token
    ),
    (SELECT COALESCE(SUM(amount_usd), 0)::numeric FROM base),
    (SELECT COUNT(DISTINCT tx_hash) FROM base)::bigint,
    (SELECT COUNT(DISTINCT sender_id) FROM base)::bigint,
    (SELECT COUNT(DISTINCT recipient_id) FROM base)::bigint,
    (SELECT COALESCE(SUM(light_score_earned), 0)::numeric FROM base);
END;
$function$

(1 row)

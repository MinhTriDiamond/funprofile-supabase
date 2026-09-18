CREATE OR REPLACE FUNCTION public.get_recipient_leaderboard(p_limit integer DEFAULT 50, p_offset integer DEFAULT 0, p_time_range text DEFAULT 'all'::text, p_token_symbol text DEFAULT NULL::text, p_from timestamp with time zone DEFAULT NULL::timestamp with time zone, p_to timestamp with time zone DEFAULT NULL::timestamp with time zone)
 RETURNS TABLE(user_id uuid, username text, avatar_url text, full_name text, token_symbol text, total_amount numeric, total_transactions bigint, includes_external boolean, rank bigint)
 LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE v_since timestamptz; v_until timestamptz;
BEGIN
  IF p_from IS NOT NULL OR p_to IS NOT NULL THEN
    v_since := p_from; v_until := p_to;
  ELSE
    v_until := NULL;
    v_since := CASE p_time_range
      WHEN 'day' THEN now() - interval '1 day'
      WHEN 'week' THEN now() - interval '7 days'
      WHEN 'month' THEN now() - interval '30 days'
      ELSE NULL END;
  END IF;
  RETURN QUERY
  WITH agg AS (
    SELECT d.recipient_id AS uid, d.token_symbol AS sym,
      SUM(d.amount::numeric) AS total_amt,
      COUNT(DISTINCT d.tx_hash) AS total_tx,
      false AS has_ext
    FROM donations d
    WHERE (d.status = 'confirmed' OR d.status IS NULL)
      AND d.recipient_id IS NOT NULL
      AND d.sender_id IS NOT NULL
      AND COALESCE(d.is_external, false) = false
      AND d.leaderboard_eligibility = 'internal'
      AND (v_since IS NULL OR d.created_at >= v_since)
      AND (v_until IS NULL OR d.created_at <= v_until)
      AND (p_token_symbol IS NULL OR d.token_symbol = p_token_symbol)
    GROUP BY d.recipient_id, d.token_symbol
  )
  SELECT a.uid, p.username, p.avatar_url, p.full_name,
    a.sym, a.total_amt, a.total_tx, a.has_ext,
    ROW_NUMBER() OVER (PARTITION BY a.sym ORDER BY a.total_amt DESC NULLS LAST)
  FROM agg a JOIN profiles p ON p.id = a.uid
  WHERE NOT COALESCE(p.exclude_from_leaderboard, false)
  ORDER BY a.sym, a.total_amt DESC NULLS LAST
  LIMIT p_limit OFFSET p_offset;
END; $function$;

CREATE OR REPLACE FUNCTION public.get_donation_global_stats(p_time_range text DEFAULT 'all'::text, p_from timestamp with time zone DEFAULT NULL::timestamp with time zone, p_to timestamp with time zone DEFAULT NULL::timestamp with time zone)
 RETURNS TABLE(totals_by_token jsonb, total_donations bigint, total_donors bigint, total_recipients bigint, total_light_score numeric)
 LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE v_since timestamptz; v_until timestamptz;
BEGIN
  IF p_from IS NOT NULL OR p_to IS NOT NULL THEN
    v_since := p_from; v_until := p_to;
  ELSE
    v_until := NULL;
    v_since := CASE p_time_range
      WHEN 'day' THEN now() - interval '1 day'
      WHEN 'week' THEN now() - interval '7 days'
      WHEN 'month' THEN now() - interval '30 days'
      ELSE NULL END;
  END IF;
  RETURN QUERY
  WITH base AS (
    SELECT d.token_symbol, d.amount::numeric AS amt, d.sender_id, d.recipient_id,
           d.tx_hash, d.light_score_earned
    FROM donations d
    LEFT JOIN profiles pr ON pr.id = d.recipient_id
    LEFT JOIN profiles ps ON ps.id = d.sender_id
    WHERE (d.status = 'confirmed' OR d.status IS NULL)
      AND d.sender_id IS NOT NULL
      AND d.recipient_id IS NOT NULL
      AND COALESCE(d.is_external, false) = false
      AND d.leaderboard_eligibility = 'internal'
      AND NOT COALESCE(pr.exclude_from_leaderboard, false)
      AND NOT COALESCE(ps.exclude_from_leaderboard, false)
      AND (v_since IS NULL OR d.created_at >= v_since)
      AND (v_until IS NULL OR d.created_at <= v_until)
  ), per_token AS (
    SELECT token_symbol, SUM(amt) AS total FROM base GROUP BY token_symbol
  )
  SELECT
    (SELECT COALESCE(jsonb_object_agg(token_symbol, total), '{}'::jsonb) FROM per_token),
    (SELECT COUNT(DISTINCT tx_hash) FROM base)::bigint,
    (SELECT COUNT(DISTINCT sender_id) FROM base)::bigint,
    (SELECT COUNT(DISTINCT recipient_id) FROM base)::bigint,
    (SELECT COALESCE(SUM(light_score_earned), 0)::numeric FROM base);
END; $function$;
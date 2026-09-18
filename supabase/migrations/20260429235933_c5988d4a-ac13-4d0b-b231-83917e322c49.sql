CREATE OR REPLACE FUNCTION public.get_benefactor_leaderboard(
  p_limit integer DEFAULT 50,
  p_offset integer DEFAULT 0,
  p_time_range text DEFAULT 'all',
  p_token_symbol text DEFAULT NULL,
  p_from timestamptz DEFAULT NULL,
  p_to timestamptz DEFAULT NULL
)
RETURNS TABLE (
  user_id uuid,
  username text,
  avatar_url text,
  full_name text,
  total_donated numeric,
  total_donated_usd numeric,
  total_donations bigint,
  total_light_score numeric,
  rank bigint
)
LANGUAGE plpgsql
STABLE SECURITY DEFINER SET search_path = public
AS $$
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
      WHEN 'day'   THEN now() - interval '1 day'
      WHEN 'week'  THEN now() - interval '7 days'
      WHEN 'month' THEN now() - interval '30 days'
      ELSE NULL
    END;
  END IF;

  RETURN QUERY
  WITH agg AS (
    SELECT
      d.sender_id AS user_id,
      SUM(d.amount::numeric) AS total_donated,
      SUM(d.amount_usd)::numeric AS total_donated_usd,
      COUNT(*)::bigint AS total_donations,
      COALESCE(SUM(d.light_score_earned), 0)::numeric AS total_light_score
    FROM donations d
    WHERE (d.status = 'confirmed' OR d.status IS NULL)
      AND d.sender_id IS NOT NULL
      AND (v_since IS NULL OR d.created_at >= v_since)
      AND (v_until IS NULL OR d.created_at <= v_until)
      AND (p_token_symbol IS NULL OR d.token_symbol = p_token_symbol)
    GROUP BY d.sender_id
  )
  SELECT
    a.user_id,
    p.username,
    p.avatar_url,
    p.full_name,
    a.total_donated,
    a.total_donated_usd,
    a.total_donations,
    a.total_light_score,
    ROW_NUMBER() OVER (ORDER BY a.total_donated_usd DESC NULLS LAST) AS rank
  FROM agg a
  JOIN profiles p ON p.id = a.user_id
  ORDER BY a.total_donated_usd DESC NULLS LAST
  LIMIT p_limit OFFSET p_offset;
END;
$$;

CREATE OR REPLACE FUNCTION public.get_recipient_leaderboard(
  p_limit integer DEFAULT 50,
  p_offset integer DEFAULT 0,
  p_time_range text DEFAULT 'all',
  p_from timestamptz DEFAULT NULL,
  p_to timestamptz DEFAULT NULL
)
RETURNS TABLE (
  user_id uuid,
  username text,
  avatar_url text,
  full_name text,
  total_received numeric,
  total_received_usd numeric,
  total_donations bigint,
  rank bigint
)
LANGUAGE plpgsql
STABLE SECURITY DEFINER SET search_path = public
AS $$
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
      WHEN 'day'   THEN now() - interval '1 day'
      WHEN 'week'  THEN now() - interval '7 days'
      WHEN 'month' THEN now() - interval '30 days'
      ELSE NULL
    END;
  END IF;

  RETURN QUERY
  WITH agg AS (
    SELECT
      d.recipient_id AS user_id,
      SUM(d.amount::numeric) AS total_received,
      SUM(d.amount_usd)::numeric AS total_received_usd,
      COUNT(*)::bigint AS total_donations
    FROM donations d
    WHERE (d.status = 'confirmed' OR d.status IS NULL)
      AND d.recipient_id IS NOT NULL
      AND (v_since IS NULL OR d.created_at >= v_since)
      AND (v_until IS NULL OR d.created_at <= v_until)
    GROUP BY d.recipient_id
  )
  SELECT
    a.user_id,
    p.username,
    p.avatar_url,
    p.full_name,
    a.total_received,
    a.total_received_usd,
    a.total_donations,
    ROW_NUMBER() OVER (ORDER BY a.total_received_usd DESC NULLS LAST) AS rank
  FROM agg a
  JOIN profiles p ON p.id = a.user_id
  ORDER BY a.total_received_usd DESC NULLS LAST
  LIMIT p_limit OFFSET p_offset;
END;
$$;
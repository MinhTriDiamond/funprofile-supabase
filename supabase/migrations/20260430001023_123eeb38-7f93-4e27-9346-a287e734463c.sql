DROP FUNCTION IF EXISTS public.get_donation_global_stats(text, timestamptz, timestamptz);
DROP FUNCTION IF EXISTS public.get_benefactor_leaderboard(integer, integer, text, text, timestamptz, timestamptz);
DROP FUNCTION IF EXISTS public.get_recipient_leaderboard(integer, integer, text, timestamptz, timestamptz);

CREATE FUNCTION public.get_donation_global_stats(
  p_time_range text DEFAULT 'all',
  p_from timestamptz DEFAULT NULL,
  p_to timestamptz DEFAULT NULL
)
RETURNS TABLE (
  total_donated_usd numeric, total_donations bigint,
  total_donors bigint, total_recipients bigint, total_light_score numeric
)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
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
  SELECT
    COALESCE(SUM(d.amount_usd), 0)::numeric,
    COUNT(*)::bigint,
    COUNT(DISTINCT d.sender_id)::bigint,
    COUNT(DISTINCT d.recipient_id)::bigint,
    COALESCE(SUM(d.light_score_earned), 0)::numeric
  FROM donations d
  WHERE (d.status = 'confirmed' OR d.status IS NULL)
    AND d.is_external IS NOT TRUE
    AND d.sender_id IS NOT NULL
    AND (v_since IS NULL OR d.created_at >= v_since)
    AND (v_until IS NULL OR d.created_at <= v_until);
END; $$;

CREATE FUNCTION public.get_benefactor_leaderboard(
  p_limit integer DEFAULT 50, p_offset integer DEFAULT 0,
  p_time_range text DEFAULT 'all', p_token_symbol text DEFAULT NULL,
  p_from timestamptz DEFAULT NULL, p_to timestamptz DEFAULT NULL
)
RETURNS TABLE (
  user_id uuid, username text, avatar_url text, full_name text,
  total_donated numeric, total_donated_usd numeric,
  total_donations bigint, total_light_score numeric, rank bigint
)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
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
    SELECT d.sender_id AS uid,
      SUM(d.amount::numeric) AS td,
      SUM(d.amount_usd)::numeric AS tdu,
      COUNT(*)::bigint AS tc,
      COALESCE(SUM(d.light_score_earned), 0)::numeric AS tls
    FROM donations d
    WHERE (d.status = 'confirmed' OR d.status IS NULL)
      AND d.is_external IS NOT TRUE
      AND d.sender_id IS NOT NULL
      AND (v_since IS NULL OR d.created_at >= v_since)
      AND (v_until IS NULL OR d.created_at <= v_until)
      AND (p_token_symbol IS NULL OR d.token_symbol = p_token_symbol)
    GROUP BY d.sender_id
  )
  SELECT a.uid, p.username, p.avatar_url, p.full_name,
    a.td, a.tdu, a.tc, a.tls,
    ROW_NUMBER() OVER (ORDER BY a.tdu DESC NULLS LAST)
  FROM agg a JOIN profiles p ON p.id = a.uid
  ORDER BY a.tdu DESC NULLS LAST
  LIMIT p_limit OFFSET p_offset;
END; $$;

CREATE FUNCTION public.get_recipient_leaderboard(
  p_limit integer DEFAULT 50, p_offset integer DEFAULT 0,
  p_time_range text DEFAULT 'all',
  p_from timestamptz DEFAULT NULL, p_to timestamptz DEFAULT NULL
)
RETURNS TABLE (
  user_id uuid, username text, avatar_url text, full_name text,
  total_received numeric, total_received_usd numeric,
  total_donations bigint, rank bigint
)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
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
    SELECT d.recipient_id AS uid,
      SUM(d.amount::numeric) AS tr,
      SUM(d.amount_usd)::numeric AS tru,
      COUNT(*)::bigint AS tc
    FROM donations d
    WHERE (d.status = 'confirmed' OR d.status IS NULL)
      AND d.is_external IS NOT TRUE
      AND d.sender_id IS NOT NULL
      AND d.recipient_id IS NOT NULL
      AND (v_since IS NULL OR d.created_at >= v_since)
      AND (v_until IS NULL OR d.created_at <= v_until)
    GROUP BY d.recipient_id
  )
  SELECT a.uid, p.username, p.avatar_url, p.full_name,
    a.tr, a.tru, a.tc,
    ROW_NUMBER() OVER (ORDER BY a.tru DESC NULLS LAST)
  FROM agg a JOIN profiles p ON p.id = a.uid
  ORDER BY a.tru DESC NULLS LAST
  LIMIT p_limit OFFSET p_offset;
END; $$;

CREATE OR REPLACE FUNCTION public.get_contribution_dimension_stats(
  p_dimension  text DEFAULT 'ecosystem',
  p_time_range text DEFAULT 'all',
  p_from       timestamptz DEFAULT NULL,
  p_to         timestamptz DEFAULT NULL
)
RETURNS TABLE(
  token_symbol         text,
  token_icon           text,
  token_decimals       integer,
  ranking_dimension    text,
  total_sent           numeric,
  total_received       numeric,
  transactions         bigint,
  unique_participants  bigint,
  unique_senders       bigint,
  unique_recipients    bigint
)
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_since timestamptz;
  v_until timestamptz;
BEGIN
  IF p_dimension IS NULL OR p_dimension NOT IN ('usd','ecosystem','none') THEN
    RAISE EXCEPTION 'invalid_dimension: p_dimension must be usd|ecosystem|none, got %', p_dimension
      USING ERRCODE = '22023';
  END IF;

  IF p_from IS NOT NULL OR p_to IS NOT NULL THEN
    v_since := p_from; v_until := p_to;
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
  WITH dim_tokens AS (
    SELECT DISTINCT ON (tr.symbol)
      tr.symbol       AS t_symbol,
      tr.decimals     AS t_decimals,
      tr.token_icon   AS t_icon,
      tr.ranking_dimension AS t_dim
    FROM public.tokens_registry tr
    WHERE tr.ranking_dimension = p_dimension
    ORDER BY tr.symbol, (tr.chain_id = 56) DESC, tr.chain_id
  ), base AS (
    SELECT
      d.token_symbol,
      d.sender_id,
      d.recipient_id,
      d.amount::numeric AS amount,
      d.tx_hash,
      d.chain_id
    FROM public.donations d
    JOIN dim_tokens dt      ON dt.t_symbol = d.token_symbol
    JOIN public.profiles ps ON ps.id = d.sender_id
    JOIN public.profiles pr ON pr.id = d.recipient_id
    WHERE (d.status = 'confirmed' OR d.status IS NULL)
      AND d.sender_id IS NOT NULL
      AND d.recipient_id IS NOT NULL
      AND d.sender_id <> d.recipient_id
      AND COALESCE(d.is_external, false) = false
      AND d.leaderboard_eligibility = 'internal'
      AND NOT COALESCE(ps.exclude_from_leaderboard, false)
      AND NOT COALESCE(pr.exclude_from_leaderboard, false)
      AND (d.chain_id <> 97 OR dt.t_dim = 'ecosystem')
      AND (v_since IS NULL OR d.created_at >= v_since)
      AND (v_until IS NULL OR d.created_at <= v_until)
  ), agg AS (
    SELECT
      b.token_symbol AS t_symbol,
      SUM(b.amount)::numeric                     AS a_sent,
      SUM(b.amount)::numeric                     AS a_received,
      COUNT(DISTINCT b.tx_hash)::bigint          AS a_tx,
      COUNT(DISTINCT b.sender_id)::bigint        AS a_uniq_s,
      COUNT(DISTINCT b.recipient_id)::bigint     AS a_uniq_r,
      COUNT(DISTINCT parts.uid)::bigint          AS a_uniq_p
    FROM base b
    CROSS JOIN LATERAL (VALUES (b.sender_id), (b.recipient_id)) AS parts(uid)
    GROUP BY b.token_symbol
  )
  SELECT
    dt.t_symbol,
    dt.t_icon,
    dt.t_decimals,
    dt.t_dim,
    COALESCE(a.a_sent, 0),
    COALESCE(a.a_received, 0),
    COALESCE(a.a_tx, 0),
    COALESCE(a.a_uniq_p, 0),
    COALESCE(a.a_uniq_s, 0),
    COALESCE(a.a_uniq_r, 0)
  FROM dim_tokens dt
  LEFT JOIN agg a ON a.t_symbol = dt.t_symbol
  ORDER BY COALESCE(a.a_tx, 0) DESC, dt.t_symbol;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_contribution_dimension_stats(text, text, timestamptz, timestamptz)
  TO anon, authenticated;

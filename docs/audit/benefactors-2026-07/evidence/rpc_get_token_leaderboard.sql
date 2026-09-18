CREATE OR REPLACE FUNCTION public.get_token_leaderboard(p_token_symbol text, p_direction text DEFAULT 'sent'::text, p_time_range text DEFAULT 'all'::text, p_limit integer DEFAULT 20, p_offset integer DEFAULT 0, p_from timestamp with time zone DEFAULT NULL::timestamp with time zone, p_to timestamp with time zone DEFAULT NULL::timestamp with time zone)
 RETURNS TABLE(user_id uuid, username text, avatar_url text, full_name text, token_symbol text, token_icon text, token_decimals integer, ranking_dimension text, total_amount numeric, total_amount_usd numeric, total_transactions bigint, rank bigint)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_since timestamptz;
  v_until timestamptz;
  v_tok   record;
BEGIN
  IF p_direction NOT IN ('sent','received') THEN
    RAISE EXCEPTION 'invalid_direction: p_direction must be sent or received, got %', p_direction
      USING ERRCODE = '22023';
  END IF;

  SELECT tr.symbol, tr.decimals, tr.token_icon, tr.ranking_dimension
    INTO v_tok
    FROM public.tokens_registry tr
   WHERE tr.symbol = p_token_symbol
   ORDER BY (tr.ranking_dimension = 'usd') DESC,
            (tr.ranking_dimension = 'ecosystem') DESC
   LIMIT 1;

  IF v_tok.symbol IS NULL THEN
    RETURN;
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
  WITH base AS (
    SELECT
      CASE WHEN p_direction = 'sent' THEN d.sender_id ELSE d.recipient_id END AS uid,
      d.amount::numeric                          AS amount,
      COALESCE(d.amount_usd, 0)::numeric         AS amount_usd,
      d.tx_hash
    FROM public.donations d
    JOIN public.profiles ps ON ps.id = d.sender_id
    JOIN public.profiles pr ON pr.id = d.recipient_id
    WHERE d.token_symbol = v_tok.symbol
      AND (d.status = 'confirmed' OR d.status IS NULL)
      AND d.sender_id IS NOT NULL
      AND d.recipient_id IS NOT NULL
      AND d.sender_id <> d.recipient_id
      AND COALESCE(d.is_external, false) = false
      AND d.leaderboard_eligibility = 'internal'
      AND NOT COALESCE(ps.exclude_from_leaderboard, false)
      AND NOT COALESCE(pr.exclude_from_leaderboard, false)
      -- Testnet: cấm trừ khi token thuộc dimension ecosystem
      AND (d.chain_id <> 97 OR v_tok.ranking_dimension = 'ecosystem')
      AND (v_since IS NULL OR d.created_at >= v_since)
      AND (v_until IS NULL OR d.created_at <= v_until)
  ), per_user AS (
    SELECT
      b.uid,
      SUM(b.amount)::numeric                     AS total_amount,
      SUM(b.amount_usd)::numeric                 AS total_amount_usd,
      COUNT(DISTINCT b.tx_hash)::bigint          AS total_transactions,
      MAX(b.amount)::numeric                     AS max_amount
    FROM base b
    WHERE b.uid IS NOT NULL
    GROUP BY b.uid
  ), ranked AS (
    SELECT pu.*,
      ROW_NUMBER() OVER (ORDER BY pu.total_amount DESC NULLS LAST, pu.max_amount DESC NULLS LAST, pu.uid) AS row_rank
    FROM per_user pu
  )
  SELECT
    r.uid,
    p.username,
    p.avatar_url,
    p.full_name,
    v_tok.symbol,
    v_tok.token_icon,
    v_tok.decimals,
    v_tok.ranking_dimension,
    r.total_amount,
    r.total_amount_usd,
    r.total_transactions,
    r.row_rank
  FROM ranked r
  JOIN public.profiles p ON p.id = r.uid
  ORDER BY r.row_rank
  LIMIT p_limit OFFSET p_offset;
END;
$function$


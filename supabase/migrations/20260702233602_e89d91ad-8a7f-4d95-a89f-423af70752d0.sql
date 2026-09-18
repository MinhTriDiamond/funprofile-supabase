
-- ============================================================
-- A1. tokens_registry: ranking_dimension + token_icon
-- ============================================================
ALTER TABLE public.tokens_registry
  ADD COLUMN IF NOT EXISTS ranking_dimension text NOT NULL DEFAULT 'none';

ALTER TABLE public.tokens_registry
  DROP CONSTRAINT IF EXISTS tokens_registry_ranking_dimension_check;

ALTER TABLE public.tokens_registry
  ADD CONSTRAINT tokens_registry_ranking_dimension_check
  CHECK (ranking_dimension IN ('usd','ecosystem','none'));

ALTER TABLE public.tokens_registry
  ADD COLUMN IF NOT EXISTS token_icon text;

-- Seed hiện trạng
UPDATE public.tokens_registry
   SET ranking_dimension = 'usd'
 WHERE symbol IN ('BTC','BTCB','BNB','USDT','USDC','CAMLY')
   AND is_leaderboard_eligible = true;

UPDATE public.tokens_registry
   SET ranking_dimension = 'ecosystem'
 WHERE symbol = 'FUN';

-- ============================================================
-- A2. get_token_leaderboard — generic per-token leaderboard
-- ============================================================
CREATE OR REPLACE FUNCTION public.get_token_leaderboard(
  p_token_symbol text,
  p_direction    text DEFAULT 'sent',
  p_time_range   text DEFAULT 'all',
  p_limit        integer DEFAULT 20,
  p_offset       integer DEFAULT 0,
  p_from         timestamptz DEFAULT NULL,
  p_to           timestamptz DEFAULT NULL
)
RETURNS TABLE(
  user_id            uuid,
  username           text,
  avatar_url         text,
  full_name          text,
  token_symbol       text,
  token_icon         text,
  token_decimals     integer,
  ranking_dimension  text,
  total_amount       numeric,
  total_amount_usd   numeric,
  total_transactions bigint,
  rank               bigint
)
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
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
$$;

GRANT EXECUTE ON FUNCTION public.get_token_leaderboard(text, text, text, integer, integer, timestamptz, timestamptz)
  TO anon, authenticated;

-- ============================================================
-- A3. get_contribution_dimension_stats — generic dimension aggregate
-- ============================================================
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
    SELECT DISTINCT ON (symbol)
      symbol, decimals, token_icon, ranking_dimension
    FROM public.tokens_registry
    WHERE ranking_dimension = p_dimension
    ORDER BY symbol, (chain_id = 56) DESC, chain_id
  ), base AS (
    SELECT
      d.token_symbol,
      d.sender_id,
      d.recipient_id,
      d.amount::numeric AS amount,
      d.tx_hash,
      d.chain_id
    FROM public.donations d
    JOIN dim_tokens dt      ON dt.symbol = d.token_symbol
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
      AND (d.chain_id <> 97 OR dt.ranking_dimension = 'ecosystem')
      AND (v_since IS NULL OR d.created_at >= v_since)
      AND (v_until IS NULL OR d.created_at <= v_until)
  ), agg AS (
    SELECT
      b.token_symbol,
      SUM(b.amount)::numeric                                    AS total_sent,
      SUM(b.amount)::numeric                                    AS total_received,
      COUNT(DISTINCT b.tx_hash)::bigint                         AS transactions,
      COUNT(DISTINCT b.sender_id)::bigint                       AS unique_senders,
      COUNT(DISTINCT b.recipient_id)::bigint                    AS unique_recipients,
      COUNT(DISTINCT uid)::bigint                               AS unique_participants
    FROM base b
    CROSS JOIN LATERAL (VALUES (b.sender_id), (b.recipient_id)) AS parts(uid)
    GROUP BY b.token_symbol
  )
  SELECT
    dt.symbol,
    dt.token_icon,
    dt.decimals,
    dt.ranking_dimension,
    COALESCE(a.total_sent, 0),
    COALESCE(a.total_received, 0),
    COALESCE(a.transactions, 0),
    COALESCE(a.unique_participants, 0),
    COALESCE(a.unique_senders, 0),
    COALESCE(a.unique_recipients, 0)
  FROM dim_tokens dt
  LEFT JOIN agg a ON a.token_symbol = dt.symbol
  ORDER BY COALESCE(a.transactions, 0) DESC, dt.symbol;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_contribution_dimension_stats(text, text, timestamptz, timestamptz)
  TO anon, authenticated;

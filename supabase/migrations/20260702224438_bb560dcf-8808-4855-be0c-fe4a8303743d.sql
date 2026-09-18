
-- D1. get_benefactor_leaderboard
CREATE OR REPLACE FUNCTION public.get_benefactor_leaderboard(
  p_limit integer DEFAULT 50,
  p_offset integer DEFAULT 0,
  p_time_range text DEFAULT 'all',
  p_token_symbol text DEFAULT NULL,
  p_from timestamptz DEFAULT NULL,
  p_to timestamptz DEFAULT NULL
)
RETURNS TABLE(
  user_id uuid, username text, avatar_url text, full_name text,
  totals_by_token jsonb, total_amount_usd numeric, total_transactions bigint,
  total_light_score numeric, rank bigint
)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = 'public'
AS $$
DECLARE v_since timestamptz; v_until timestamptz;
BEGIN
  IF p_from IS NOT NULL OR p_to IS NOT NULL THEN
    v_since := p_from; v_until := p_to;
  ELSE
    v_until := NULL;
    v_since := CASE p_time_range
      WHEN 'day'   THEN now() - interval '1 day'
      WHEN 'week'  THEN now() - interval '7 days'
      WHEN 'month' THEN now() - interval '30 days'
      ELSE NULL END;
  END IF;

  RETURN QUERY
  WITH base AS (
    SELECT
      d.sender_id AS uid,
      d.token_symbol,
      d.amount::numeric AS amount,
      COALESCE(d.amount_usd, 0)::numeric AS amount_usd,
      d.tx_hash,
      COALESCE(d.light_score_earned, 0)::numeric AS light_score_earned
    FROM public.donations d
    JOIN public.profiles ps ON ps.id = d.sender_id
    JOIN public.profiles pr ON pr.id = d.recipient_id
    JOIN public.tokens_registry tr
      ON tr.chain_id = d.chain_id
     AND upper(tr.symbol) = upper(d.token_symbol)
     AND tr.is_leaderboard_eligible = true
     AND tr.is_active = true
    WHERE d.status = 'confirmed'
      AND d.sender_id IS NOT NULL
      AND d.recipient_id IS NOT NULL
      AND d.sender_id <> d.recipient_id
      AND COALESCE(d.is_external, false) = false
      AND d.leaderboard_eligibility = 'internal'
      AND d.chain_id <> 97
      AND COALESCE(d.amount_usd, 0) > 0
      AND (tr.max_single_usd IS NULL OR d.amount_usd <= tr.max_single_usd)
      AND NOT COALESCE(ps.exclude_from_leaderboard, false)
      AND NOT COALESCE(pr.exclude_from_leaderboard, false)
      AND (v_since IS NULL OR d.created_at >= v_since)
      AND (v_until IS NULL OR d.created_at <= v_until)
      AND (p_token_symbol IS NULL OR d.token_symbol = p_token_symbol)
  ), per_token AS (
    SELECT uid, token_symbol,
      SUM(amount) AS token_amount,
      SUM(amount_usd) AS token_usd,
      COUNT(DISTINCT tx_hash) AS token_transactions
    FROM base GROUP BY uid, token_symbol
  ), per_user AS (
    SELECT b.uid,
      COALESCE(SUM(b.amount_usd), 0)::numeric AS total_usd,
      COUNT(DISTINCT b.tx_hash)::bigint AS total_tx,
      COALESCE(SUM(b.light_score_earned), 0)::numeric AS total_ls,
      COALESCE(MAX(pt.token_amount), 0)::numeric AS max_token_amount
    FROM base b
    JOIN per_token pt ON pt.uid = b.uid AND pt.token_symbol = b.token_symbol
    GROUP BY b.uid
  ), ranked AS (
    SELECT pu.*,
      ROW_NUMBER() OVER (ORDER BY pu.total_usd DESC NULLS LAST, pu.max_token_amount DESC NULLS LAST, pu.uid) AS row_rank
    FROM per_user pu
  )
  SELECT r.uid, p.username, p.avatar_url, p.full_name,
    (SELECT COALESCE(jsonb_object_agg(pt.token_symbol,
        jsonb_build_object('amount', pt.token_amount, 'usd', pt.token_usd, 'transactions', pt.token_transactions)
        ORDER BY pt.token_symbol), '{}'::jsonb)
     FROM per_token pt WHERE pt.uid = r.uid),
    r.total_usd, r.total_tx, r.total_ls, r.row_rank
  FROM ranked r JOIN public.profiles p ON p.id = r.uid
  ORDER BY r.row_rank LIMIT p_limit OFFSET p_offset;
END; $$;

-- D2. get_recipient_leaderboard
CREATE OR REPLACE FUNCTION public.get_recipient_leaderboard(
  p_limit integer DEFAULT 50,
  p_offset integer DEFAULT 0,
  p_time_range text DEFAULT 'all',
  p_token_symbol text DEFAULT NULL,
  p_from timestamptz DEFAULT NULL,
  p_to timestamptz DEFAULT NULL
)
RETURNS TABLE(
  user_id uuid, username text, avatar_url text, full_name text,
  totals_by_token jsonb, total_amount_usd numeric, total_transactions bigint,
  includes_external boolean, rank bigint
)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = 'public'
AS $$
DECLARE v_since timestamptz; v_until timestamptz;
BEGIN
  IF p_from IS NOT NULL OR p_to IS NOT NULL THEN
    v_since := p_from; v_until := p_to;
  ELSE
    v_until := NULL;
    v_since := CASE p_time_range
      WHEN 'day'   THEN now() - interval '1 day'
      WHEN 'week'  THEN now() - interval '7 days'
      WHEN 'month' THEN now() - interval '30 days'
      ELSE NULL END;
  END IF;

  RETURN QUERY
  WITH base AS (
    SELECT
      d.recipient_id AS uid,
      d.token_symbol,
      d.amount::numeric AS amount,
      COALESCE(d.amount_usd, 0)::numeric AS amount_usd,
      d.tx_hash
    FROM public.donations d
    JOIN public.profiles ps ON ps.id = d.sender_id
    JOIN public.profiles pr ON pr.id = d.recipient_id
    JOIN public.tokens_registry tr
      ON tr.chain_id = d.chain_id
     AND upper(tr.symbol) = upper(d.token_symbol)
     AND tr.is_leaderboard_eligible = true
     AND tr.is_active = true
    WHERE d.status = 'confirmed'
      AND d.sender_id IS NOT NULL
      AND d.recipient_id IS NOT NULL
      AND d.sender_id <> d.recipient_id
      AND COALESCE(d.is_external, false) = false
      AND d.leaderboard_eligibility = 'internal'
      AND d.chain_id <> 97
      AND COALESCE(d.amount_usd, 0) > 0
      AND (tr.max_single_usd IS NULL OR d.amount_usd <= tr.max_single_usd)
      AND NOT COALESCE(ps.exclude_from_leaderboard, false)
      AND NOT COALESCE(pr.exclude_from_leaderboard, false)
      AND (v_since IS NULL OR d.created_at >= v_since)
      AND (v_until IS NULL OR d.created_at <= v_until)
      AND (p_token_symbol IS NULL OR d.token_symbol = p_token_symbol)
  ), per_token AS (
    SELECT uid, token_symbol,
      SUM(amount) AS token_amount, SUM(amount_usd) AS token_usd,
      COUNT(DISTINCT tx_hash) AS token_transactions
    FROM base GROUP BY uid, token_symbol
  ), per_user AS (
    SELECT b.uid,
      COALESCE(SUM(b.amount_usd), 0)::numeric AS total_usd,
      COUNT(DISTINCT b.tx_hash)::bigint AS total_tx,
      COALESCE(MAX(pt.token_amount), 0)::numeric AS max_token_amount
    FROM base b
    JOIN per_token pt ON pt.uid = b.uid AND pt.token_symbol = b.token_symbol
    GROUP BY b.uid
  ), ranked AS (
    SELECT pu.*,
      ROW_NUMBER() OVER (ORDER BY pu.total_usd DESC NULLS LAST, pu.max_token_amount DESC NULLS LAST, pu.uid) AS row_rank
    FROM per_user pu
  )
  SELECT r.uid, p.username, p.avatar_url, p.full_name,
    (SELECT COALESCE(jsonb_object_agg(pt.token_symbol,
        jsonb_build_object('amount', pt.token_amount, 'usd', pt.token_usd, 'transactions', pt.token_transactions)
        ORDER BY pt.token_symbol), '{}'::jsonb)
     FROM per_token pt WHERE pt.uid = r.uid),
    r.total_usd, r.total_tx, false AS includes_external, r.row_rank
  FROM ranked r JOIN public.profiles p ON p.id = r.uid
  ORDER BY r.row_rank LIMIT p_limit OFFSET p_offset;
END; $$;

-- D3. get_donation_global_stats
CREATE OR REPLACE FUNCTION public.get_donation_global_stats(
  p_time_range text DEFAULT 'all',
  p_from timestamptz DEFAULT NULL,
  p_to timestamptz DEFAULT NULL
)
RETURNS TABLE(
  totals_by_token jsonb, total_donated_usd numeric, total_donations bigint,
  total_donors bigint, total_recipients bigint, total_light_score numeric
)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = 'public'
AS $$
DECLARE v_since timestamptz; v_until timestamptz;
BEGIN
  IF p_from IS NOT NULL OR p_to IS NOT NULL THEN
    v_since := p_from; v_until := p_to;
  ELSE
    v_until := NULL;
    v_since := CASE p_time_range
      WHEN 'day'   THEN now() - interval '1 day'
      WHEN 'week'  THEN now() - interval '7 days'
      WHEN 'month' THEN now() - interval '30 days'
      ELSE NULL END;
  END IF;

  RETURN QUERY
  WITH base AS (
    SELECT d.token_symbol, d.amount::numeric AS amount,
      COALESCE(d.amount_usd, 0)::numeric AS amount_usd,
      d.sender_id, d.recipient_id, d.tx_hash,
      COALESCE(d.light_score_earned, 0)::numeric AS light_score_earned
    FROM public.donations d
    JOIN public.profiles ps ON ps.id = d.sender_id
    JOIN public.profiles pr ON pr.id = d.recipient_id
    JOIN public.tokens_registry tr
      ON tr.chain_id = d.chain_id
     AND upper(tr.symbol) = upper(d.token_symbol)
     AND tr.is_leaderboard_eligible = true
     AND tr.is_active = true
    WHERE d.status = 'confirmed'
      AND d.sender_id IS NOT NULL
      AND d.recipient_id IS NOT NULL
      AND d.sender_id <> d.recipient_id
      AND COALESCE(d.is_external, false) = false
      AND d.leaderboard_eligibility = 'internal'
      AND d.chain_id <> 97
      AND COALESCE(d.amount_usd, 0) > 0
      AND (tr.max_single_usd IS NULL OR d.amount_usd <= tr.max_single_usd)
      AND NOT COALESCE(ps.exclude_from_leaderboard, false)
      AND NOT COALESCE(pr.exclude_from_leaderboard, false)
      AND (v_since IS NULL OR d.created_at >= v_since)
      AND (v_until IS NULL OR d.created_at <= v_until)
  ), per_token AS (
    SELECT token_symbol, SUM(amount) AS token_amount,
      SUM(amount_usd) AS token_usd, COUNT(DISTINCT tx_hash) AS token_transactions
    FROM base GROUP BY token_symbol
  )
  SELECT
    (SELECT COALESCE(jsonb_object_agg(token_symbol,
        jsonb_build_object('amount', token_amount, 'usd', token_usd, 'transactions', token_transactions)
        ORDER BY token_symbol), '{}'::jsonb) FROM per_token),
    (SELECT COALESCE(SUM(amount_usd), 0)::numeric FROM base),
    (SELECT COUNT(DISTINCT tx_hash) FROM base)::bigint,
    (SELECT COUNT(DISTINCT sender_id) FROM base)::bigint,
    (SELECT COUNT(DISTINCT recipient_id) FROM base)::bigint,
    (SELECT COALESCE(SUM(light_score_earned), 0)::numeric FROM base);
END; $$;

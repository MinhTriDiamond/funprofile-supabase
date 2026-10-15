-- Lop Donations SSOT (2026-10-15): bang nen chung cho cac bang xep hang qua tang.
CREATE TABLE IF NOT EXISTS public.donation_board_base (
  sender_id uuid NOT NULL,
  recipient_id uuid NOT NULL,
  token_symbol text,
  amount_num numeric,
  amount_usd numeric NOT NULL DEFAULT 0,
  tx_hash text,
  light_score_earned numeric NOT NULL DEFAULT 0,
  chain_id integer,
  status text,
  created_at timestamptz,
  sender_excluded boolean NOT NULL DEFAULT false,
  recipient_excluded boolean NOT NULL DEFAULT false,
  registry_eligible boolean NOT NULL DEFAULT false,
  registry_max_single_usd numeric
);
ALTER TABLE public.donation_board_base ENABLE ROW LEVEL SECURITY;
CREATE INDEX IF NOT EXISTS idx_dbb_created ON public.donation_board_base (created_at);
CREATE INDEX IF NOT EXISTS idx_dbb_sender ON public.donation_board_base (sender_id);
CREATE INDEX IF NOT EXISTS idx_dbb_recipient ON public.donation_board_base (recipient_id);
CREATE INDEX IF NOT EXISTS idx_dbb_token ON public.donation_board_base (token_symbol);

CREATE OR REPLACE FUNCTION public.refresh_donation_board_base()
RETURNS integer
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $fn$
DECLARE n integer;
BEGIN
  DELETE FROM public.donation_board_base;
  INSERT INTO public.donation_board_base (sender_id, recipient_id, token_symbol, amount_num, amount_usd, tx_hash, light_score_earned, chain_id, status, created_at, sender_excluded, recipient_excluded, registry_eligible, registry_max_single_usd)
  SELECT d.sender_id, d.recipient_id, d.token_symbol,
    CASE WHEN d.amount ~ '^[0-9]+(\.[0-9]+)?$' THEN d.amount::numeric END,
    COALESCE(d.amount_usd, 0)::numeric,
    d.tx_hash,
    COALESCE(d.light_score_earned, 0)::numeric,
    d.chain_id, d.status, d.created_at,
    COALESCE(ps.exclude_from_leaderboard, false),
    COALESCE(pr.exclude_from_leaderboard, false),
    (trg.symbol IS NOT NULL),
    trg.max_single_usd
  FROM public.donations d
  JOIN public.profiles ps ON ps.id = d.sender_id
  JOIN public.profiles pr ON pr.id = d.recipient_id
  LEFT JOIN LATERAL (
    SELECT tr.symbol, tr.max_single_usd FROM public.tokens_registry tr
    WHERE tr.chain_id = d.chain_id AND upper(tr.symbol) = upper(d.token_symbol)
      AND tr.is_leaderboard_eligible = true AND tr.is_active = true
    LIMIT 1
  ) trg ON true
  WHERE d.sender_id IS NOT NULL AND d.recipient_id IS NOT NULL AND d.sender_id <> d.recipient_id
    AND COALESCE(d.is_external, false) = false AND d.leaderboard_eligibility = 'internal';
  GET DIAGNOSTICS n = ROW_COUNT;
  RETURN n;
END;
$fn$;

SELECT public.refresh_donation_board_base() AS base_rows_initial;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'donation-board-base-refresh') THEN
    PERFORM cron.unschedule('donation-board-base-refresh');
  END IF;
END $$;
SELECT cron.schedule('donation-board-base-refresh', '*/5 * * * *', 'SELECT public.refresh_donation_board_base()') AS board_job_id;

CREATE OR REPLACE FUNCTION public.get_benefactor_leaderboard(p_limit integer DEFAULT 50, p_offset integer DEFAULT 0, p_time_range text DEFAULT 'all'::text, p_token_symbol text DEFAULT NULL::text, p_from timestamp with time zone DEFAULT NULL::timestamp with time zone, p_to timestamp with time zone DEFAULT NULL::timestamp with time zone)
 RETURNS TABLE(user_id uuid, username text, avatar_url text, full_name text, totals_by_token jsonb, total_amount_usd numeric, total_transactions bigint, total_light_score numeric, rank bigint)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
      d.amount_num AS amount,
      d.amount_usd,
      d.tx_hash,
      d.light_score_earned
    FROM public.donation_board_base d
    WHERE d.status = 'confirmed'
      AND d.chain_id <> 97
      AND d.amount_usd > 0
      AND d.registry_eligible
      AND (d.registry_max_single_usd IS NULL OR d.amount_usd <= d.registry_max_single_usd)
      AND NOT d.sender_excluded
      AND NOT d.recipient_excluded
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
END; $function$;

CREATE OR REPLACE FUNCTION public.get_recipient_leaderboard(p_limit integer DEFAULT 50, p_offset integer DEFAULT 0, p_time_range text DEFAULT 'all'::text, p_token_symbol text DEFAULT NULL::text, p_from timestamp with time zone DEFAULT NULL::timestamp with time zone, p_to timestamp with time zone DEFAULT NULL::timestamp with time zone)
 RETURNS TABLE(user_id uuid, username text, avatar_url text, full_name text, totals_by_token jsonb, total_amount_usd numeric, total_transactions bigint, includes_external boolean, rank bigint)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
      d.amount_num AS amount,
      d.amount_usd,
      d.tx_hash
    FROM public.donation_board_base d
    WHERE d.status = 'confirmed'
      AND d.chain_id <> 97
      AND d.amount_usd > 0
      AND d.registry_eligible
      AND (d.registry_max_single_usd IS NULL OR d.amount_usd <= d.registry_max_single_usd)
      AND NOT d.sender_excluded
      AND NOT d.recipient_excluded
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
END; $function$;

CREATE OR REPLACE FUNCTION public.get_donation_global_stats(p_time_range text DEFAULT 'all'::text, p_from timestamp with time zone DEFAULT NULL::timestamp with time zone, p_to timestamp with time zone DEFAULT NULL::timestamp with time zone)
 RETURNS TABLE(totals_by_token jsonb, total_donated_usd numeric, total_donations bigint, total_donors bigint, total_recipients bigint, total_light_score numeric)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
    SELECT d.token_symbol, d.amount_num AS amount,
      d.amount_usd,
      d.sender_id, d.recipient_id, d.tx_hash,
      d.light_score_earned
    FROM public.donation_board_base d
    WHERE d.status = 'confirmed'
      AND d.chain_id <> 97
      AND d.amount_usd > 0
      AND d.registry_eligible
      AND (d.registry_max_single_usd IS NULL OR d.amount_usd <= d.registry_max_single_usd)
      AND NOT d.sender_excluded
      AND NOT d.recipient_excluded
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
END; $function$;

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
      d.amount_num                          AS amount,
      d.amount_usd,
      d.tx_hash
    FROM public.donation_board_base d
    WHERE d.token_symbol = v_tok.symbol
      AND (d.status = 'confirmed' OR d.status IS NULL)
      AND NOT d.sender_excluded
      AND NOT d.recipient_excluded
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
$function$;

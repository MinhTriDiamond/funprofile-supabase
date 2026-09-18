-- 1. Add USD columns
ALTER TABLE public.donations
  ADD COLUMN IF NOT EXISTS amount_usd NUMERIC(20, 4),
  ADD COLUMN IF NOT EXISTS price_usd_at_donation NUMERIC(20, 8);

CREATE INDEX IF NOT EXISTS idx_donations_amount_usd ON public.donations(amount_usd) WHERE status = 'confirmed';

-- 2. Reference price function
CREATE OR REPLACE FUNCTION public.get_token_reference_usd(p_symbol TEXT)
RETURNS NUMERIC
LANGUAGE sql
IMMUTABLE
SET search_path = public
AS $$
  SELECT CASE upper(p_symbol)
    WHEN 'FUN' THEN 0.01
    WHEN 'CAMLY' THEN 0.000014
    WHEN 'BTC' THEN 100000
    WHEN 'BTCB' THEN 100000
    WHEN 'BNB' THEN 700
    WHEN 'USDT' THEN 1
    WHEN 'USDC' THEN 1
    WHEN 'ETH' THEN 3500
    WHEN 'POL' THEN 0.5
    ELSE 0
  END::NUMERIC;
$$;

-- 3. Backfill historical donations
UPDATE public.donations
SET 
  price_usd_at_donation = public.get_token_reference_usd(token_symbol),
  amount_usd = amount::NUMERIC * public.get_token_reference_usd(token_symbol)
WHERE amount_usd IS NULL
  AND token_symbol IS NOT NULL;

-- 4. Trigger to auto-populate USD
CREATE OR REPLACE FUNCTION public.donations_set_usd_default()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.amount_usd IS NULL AND NEW.token_symbol IS NOT NULL THEN
    NEW.price_usd_at_donation := COALESCE(NEW.price_usd_at_donation, public.get_token_reference_usd(NEW.token_symbol));
    NEW.amount_usd := NEW.amount::NUMERIC * NEW.price_usd_at_donation;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_donations_set_usd_default ON public.donations;
CREATE TRIGGER trg_donations_set_usd_default
  BEFORE INSERT OR UPDATE OF amount, token_symbol ON public.donations
  FOR EACH ROW
  EXECUTE FUNCTION public.donations_set_usd_default();

-- 5. Drop old leaderboard functions and recreate with USD
DROP FUNCTION IF EXISTS public.get_benefactor_leaderboard(integer, integer, text, text);
DROP FUNCTION IF EXISTS public.get_recipient_leaderboard(integer, integer, text);

CREATE FUNCTION public.get_benefactor_leaderboard(
  p_limit integer DEFAULT 50, 
  p_offset integer DEFAULT 0, 
  p_time_range text DEFAULT 'all'::text, 
  p_token_symbol text DEFAULT NULL::text
)
RETURNS TABLE(
  user_id uuid, 
  username text, 
  avatar_url text, 
  full_name text, 
  total_donated numeric,
  total_donated_usd numeric,
  total_donations integer, 
  total_light_score integer, 
  rank integer
)
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_time_filter TIMESTAMPTZ;
BEGIN
  v_time_filter := CASE p_time_range
    WHEN 'day' THEN now() - INTERVAL '1 day'
    WHEN 'week' THEN now() - INTERVAL '7 days'
    WHEN 'month' THEN now() - INTERVAL '30 days'
    ELSE '1970-01-01'::TIMESTAMPTZ
  END;

  RETURN QUERY
  WITH donor_stats AS (
    SELECT
      d.sender_id,
      SUM(d.amount::NUMERIC) AS total_donated,
      SUM(COALESCE(d.amount_usd, d.amount::NUMERIC * public.get_token_reference_usd(d.token_symbol))) AS total_donated_usd,
      COUNT(*) AS total_donations,
      SUM(COALESCE(d.light_score_earned, 0)) AS total_light_score
    FROM donations d
    WHERE d.status = 'confirmed'
      AND d.created_at >= v_time_filter
      AND (p_token_symbol IS NULL OR d.token_symbol = p_token_symbol)
    GROUP BY d.sender_id
  )
  SELECT
    p.id AS user_id,
    p.username,
    p.avatar_url,
    p.full_name,
    ds.total_donated,
    ds.total_donated_usd,
    ds.total_donations::INTEGER,
    ds.total_light_score::INTEGER,
    ROW_NUMBER() OVER (ORDER BY ds.total_donated_usd DESC)::INTEGER AS rank
  FROM donor_stats ds
  JOIN profiles p ON p.id = ds.sender_id
  ORDER BY ds.total_donated_usd DESC
  LIMIT p_limit
  OFFSET p_offset;
END;
$function$;

CREATE FUNCTION public.get_recipient_leaderboard(
  p_limit integer DEFAULT 50, 
  p_offset integer DEFAULT 0, 
  p_time_range text DEFAULT 'all'::text
)
RETURNS TABLE(
  user_id uuid, 
  username text, 
  avatar_url text, 
  full_name text, 
  total_received numeric,
  total_received_usd numeric,
  total_donations integer, 
  rank integer
)
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_time_filter TIMESTAMPTZ;
BEGIN
  v_time_filter := CASE p_time_range
    WHEN 'day' THEN now() - INTERVAL '1 day'
    WHEN 'week' THEN now() - INTERVAL '7 days'
    WHEN 'month' THEN now() - INTERVAL '30 days'
    ELSE '1970-01-01'::TIMESTAMPTZ
  END;

  RETURN QUERY
  WITH recipient_stats AS (
    SELECT
      d.recipient_id,
      SUM(d.amount::NUMERIC) AS total_received,
      SUM(COALESCE(d.amount_usd, d.amount::NUMERIC * public.get_token_reference_usd(d.token_symbol))) AS total_received_usd,
      COUNT(*) AS total_donations
    FROM donations d
    WHERE d.status = 'confirmed'
      AND d.created_at >= v_time_filter
      AND d.recipient_id IS NOT NULL
    GROUP BY d.recipient_id
  )
  SELECT
    p.id AS user_id,
    p.username,
    p.avatar_url,
    p.full_name,
    rs.total_received,
    rs.total_received_usd,
    rs.total_donations::INTEGER,
    ROW_NUMBER() OVER (ORDER BY rs.total_received_usd DESC)::INTEGER AS rank
  FROM recipient_stats rs
  JOIN profiles p ON p.id = rs.recipient_id
  ORDER BY rs.total_received_usd DESC
  LIMIT p_limit
  OFFSET p_offset;
END;
$function$;

-- Bảng whitelist user được tính cả ví ngoài trong thống kê quà tặng
CREATE TABLE IF NOT EXISTS public.external_wallet_inclusion_overrides (
  user_id UUID PRIMARY KEY REFERENCES public.profiles(id) ON DELETE CASCADE,
  reason TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by UUID
);

ALTER TABLE public.external_wallet_inclusion_overrides ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Whitelist readable by everyone"
ON public.external_wallet_inclusion_overrides FOR SELECT USING (true);

CREATE POLICY "Only admins manage whitelist"
ON public.external_wallet_inclusion_overrides FOR ALL
USING (public.has_role(auth.uid(), 'admin'))
WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- ===== RPC: Recipient Leaderboard (cộng cả ví ngoài cho user trong whitelist) =====
CREATE OR REPLACE FUNCTION public.get_recipient_leaderboard(
  p_limit integer DEFAULT 50,
  p_offset integer DEFAULT 0,
  p_time_range text DEFAULT 'all'::text,
  p_from timestamptz DEFAULT NULL,
  p_to timestamptz DEFAULT NULL
)
RETURNS TABLE(user_id uuid, username text, avatar_url text, full_name text, total_received numeric, total_received_usd numeric, total_donations bigint, rank bigint)
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
    SELECT d.recipient_id AS uid,
      SUM(d.amount::numeric) AS tr,
      SUM(d.amount_usd)::numeric AS tru,
      COUNT(*)::bigint AS tc
    FROM donations d
    WHERE (d.status = 'confirmed' OR d.status IS NULL)
      AND d.recipient_id IS NOT NULL
      AND (
        -- Mặc định: chỉ tính giao dịch nội bộ
        (d.is_external IS NOT TRUE AND d.sender_id IS NOT NULL)
        -- Ngoại lệ: recipient nằm trong whitelist → cộng cả ví ngoài
        OR EXISTS (SELECT 1 FROM external_wallet_inclusion_overrides o WHERE o.user_id = d.recipient_id)
      )
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
END; $function$;

-- ===== RPC: Benefactor Leaderboard =====
CREATE OR REPLACE FUNCTION public.get_benefactor_leaderboard(
  p_limit integer DEFAULT 50,
  p_offset integer DEFAULT 0,
  p_time_range text DEFAULT 'all'::text,
  p_token_symbol text DEFAULT NULL,
  p_from timestamptz DEFAULT NULL,
  p_to timestamptz DEFAULT NULL
)
RETURNS TABLE(user_id uuid, username text, avatar_url text, full_name text, total_donated numeric, total_donated_usd numeric, total_donations bigint, total_light_score numeric, rank bigint)
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
    SELECT d.sender_id AS uid,
      SUM(d.amount::numeric) AS td,
      SUM(d.amount_usd)::numeric AS tdu,
      COUNT(*)::bigint AS tc,
      COALESCE(SUM(d.light_score_earned), 0)::numeric AS tls
    FROM donations d
    WHERE (d.status = 'confirmed' OR d.status IS NULL)
      AND d.sender_id IS NOT NULL
      AND (
        d.is_external IS NOT TRUE
        OR EXISTS (SELECT 1 FROM external_wallet_inclusion_overrides o WHERE o.user_id = d.sender_id)
      )
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
END; $function$;

-- ===== RPC: Donation Global Stats =====
CREATE OR REPLACE FUNCTION public.get_donation_global_stats(
  p_time_range text DEFAULT 'all'::text,
  p_from timestamptz DEFAULT NULL,
  p_to timestamptz DEFAULT NULL
)
RETURNS TABLE(total_donated_usd numeric, total_donations bigint, total_donors bigint, total_recipients bigint, total_light_score numeric)
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
  SELECT
    COALESCE(SUM(d.amount_usd), 0)::numeric,
    COUNT(*)::bigint,
    COUNT(DISTINCT d.sender_id)::bigint,
    COUNT(DISTINCT d.recipient_id)::bigint,
    COALESCE(SUM(d.light_score_earned), 0)::numeric
  FROM donations d
  WHERE (d.status = 'confirmed' OR d.status IS NULL)
    AND (
      (d.is_external IS NOT TRUE AND d.sender_id IS NOT NULL)
      OR EXISTS (SELECT 1 FROM external_wallet_inclusion_overrides o
                 WHERE o.user_id = d.recipient_id OR o.user_id = d.sender_id)
    )
    AND (v_since IS NULL OR d.created_at >= v_since)
    AND (v_until IS NULL OR d.created_at <= v_until);
END; $function$;

-- ===== RPC: Gift Day Token Totals =====
CREATE OR REPLACE FUNCTION public.get_gift_day_token_totals()
RETURNS TABLE(vn_date date, token_symbol text, total_amount numeric, tx_count bigint)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
  SELECT
    (d.created_at AT TIME ZONE 'Asia/Ho_Chi_Minh')::date AS vn_date,
    d.token_symbol,
    SUM(d.amount::numeric) AS total_amount,
    COUNT(*) AS tx_count
  FROM public.donations d
  WHERE d.status = 'confirmed'
    AND (
      (d.is_external IS NOT TRUE AND d.sender_id IS NOT NULL)
      OR EXISTS (SELECT 1 FROM public.external_wallet_inclusion_overrides o
                 WHERE o.user_id = d.recipient_id OR o.user_id = d.sender_id)
    )
    AND d.created_at >= (now() AT TIME ZONE 'Asia/Ho_Chi_Minh' - interval '7 days')::date::timestamp AT TIME ZONE 'Asia/Ho_Chi_Minh'
  GROUP BY vn_date, d.token_symbol
  ORDER BY vn_date DESC, d.token_symbol;
$function$;

-- Seed: thêm @leminhtri vào whitelist
INSERT INTO public.external_wallet_inclusion_overrides (user_id, reason)
SELECT id, 'Các giao dịch ví ngoài thực chất là nội bộ - duyệt thủ công bởi Founder'
FROM public.profiles WHERE username = 'leminhtri'
ON CONFLICT (user_id) DO NOTHING;

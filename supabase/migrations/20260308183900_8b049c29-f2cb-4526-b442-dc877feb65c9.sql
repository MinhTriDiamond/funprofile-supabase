
CREATE OR REPLACE FUNCTION public.get_qualified_reward_users(p_admin_id UUID)
RETURNS TABLE(
  user_id UUID,
  username TEXT,
  full_name TEXT,
  avatar_url TEXT,
  real_links_count INTEGER,
  days_active BIGINT,
  donation_count BIGINT,
  total_donated NUMERIC,
  light_score NUMERIC,
  tier INTEGER,
  wallet_address TEXT,
  reward_status TEXT,
  created_at TIMESTAMPTZ
)
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF NOT public.has_role(p_admin_id, 'admin') THEN
    RAISE EXCEPTION 'Only admins can access qualified users list';
  END IF;

  RETURN QUERY
  WITH social_counts AS (
    SELECT 
      p.id,
      (SELECT COUNT(*) FROM jsonb_array_elements(p.social_links) elem
       WHERE elem->>'url' IS NOT NULL AND trim(elem->>'url') != '')::INTEGER AS real_links
    FROM profiles p
    WHERE p.is_banned = false AND p.social_links IS NOT NULL
  ),
  active_days AS (
    SELECT 
      po.user_id,
      COUNT(DISTINCT (po.created_at AT TIME ZONE 'UTC')::DATE) AS days_active
    FROM posts po
    GROUP BY po.user_id
  ),
  donation_stats AS (
    SELECT
      d.sender_id,
      COUNT(*) AS donation_count,
      SUM(d.amount::NUMERIC) AS total_donated
    FROM donations d
    WHERE d.status = 'confirmed' AND d.tx_hash IS NOT NULL AND trim(d.tx_hash) != ''
    GROUP BY d.sender_id
  ),
  light_scores AS (
    SELECT lr.user_id, lr.total_light_score, lr.tier
    FROM light_reputation lr
    WHERE lr.total_light_score > 0
  )
  SELECT
    p.id AS user_id,
    p.username,
    p.full_name,
    p.avatar_url,
    sc.real_links AS real_links_count,
    ad.days_active,
    ds.donation_count,
    ds.total_donated,
    ls.total_light_score AS light_score,
    ls.tier,
    p.wallet_address,
    p.reward_status,
    p.created_at
  FROM profiles p
  INNER JOIN social_counts sc ON sc.id = p.id AND sc.real_links >= 2
  INNER JOIN active_days ad ON ad.user_id = p.id AND ad.days_active >= 10
  INNER JOIN donation_stats ds ON ds.sender_id = p.id AND ds.donation_count >= 1
  INNER JOIN light_scores ls ON ls.user_id = p.id
  ORDER BY ls.total_light_score DESC;
END;
$$;


DROP FUNCTION IF EXISTS public.get_app_stats();

CREATE OR REPLACE FUNCTION public.get_app_stats()
RETURNS TABLE(
  total_users BIGINT,
  total_posts BIGINT,
  total_photos BIGINT,
  total_videos BIGINT,
  total_rewards NUMERIC,
  treasury_camly_received NUMERIC,
  total_camly_claimed NUMERIC
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_treasury_spent NUMERIC;
  v_treasury_received NUMERIC;
BEGIN
  SELECT COALESCE((value->>'amount')::NUMERIC, 0) INTO v_treasury_spent
  FROM system_config WHERE key = 'TREASURY_CAMLY_SPENT';
  
  SELECT COALESCE((value->>'amount')::NUMERIC, 0) INTO v_treasury_received
  FROM system_config WHERE key = 'TREASURY_CAMLY_RECEIVED';

  RETURN QUERY
  SELECT
    (SELECT COUNT(*) FROM profiles WHERE is_banned = false)::BIGINT AS total_users,
    (SELECT COUNT(*) FROM posts)::BIGINT AS total_posts,
    (SELECT COUNT(*) FROM posts WHERE image_url IS NOT NULL OR media_urls IS NOT NULL)::BIGINT AS total_photos,
    (SELECT COUNT(*) FROM posts WHERE video_url IS NOT NULL)::BIGINT AS total_videos,
    COALESCE((SELECT SUM(pending_reward + approved_reward) FROM profiles WHERE is_banned = false), 0)::NUMERIC AS total_rewards,
    v_treasury_received AS treasury_camly_received,
    v_treasury_spent AS total_camly_claimed;
END;
$$;

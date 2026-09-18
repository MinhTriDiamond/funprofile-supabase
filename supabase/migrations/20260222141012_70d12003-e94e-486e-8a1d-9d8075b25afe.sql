
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
    -- Tổng thành viên: tất cả user chưa bị ban
    (SELECT COUNT(*) FROM profiles WHERE is_banned = false)::BIGINT AS total_users,
    -- Tổng bài viết: tất cả bài (kể cả user bị ban)
    (SELECT COUNT(*) FROM posts)::BIGINT AS total_posts,
    -- Tổng hình ảnh: đếm từng ảnh trong media_urls + image_url
    (
      SELECT COALESCE(
        (SELECT COUNT(*) FROM posts WHERE image_url IS NOT NULL AND media_urls IS NULL), 0
      ) + COALESCE(
        (SELECT SUM(jsonb_array_length(media_urls::jsonb)) 
         FROM posts 
         WHERE media_urls IS NOT NULL 
         AND jsonb_typeof(media_urls::jsonb) = 'array'
         AND EXISTS (
           SELECT 1 FROM jsonb_array_elements(media_urls::jsonb) elem 
           WHERE elem->>'type' = 'image'
         )
        ), 0
      )
    )::BIGINT AS total_photos,
    -- Tổng video: tất cả video
    (SELECT COUNT(*) FROM posts WHERE video_url IS NOT NULL)::BIGINT AS total_videos,
    -- Tổng phần thưởng: SUM pending + approved của TẤT CẢ user (kể cả bị ban)
    COALESCE((SELECT SUM(COALESCE(pending_reward, 0) + COALESCE(approved_reward, 0)) FROM profiles), 0)::NUMERIC AS total_rewards,
    v_treasury_received AS treasury_camly_received,
    v_treasury_spent AS total_camly_claimed;
END;
$$;

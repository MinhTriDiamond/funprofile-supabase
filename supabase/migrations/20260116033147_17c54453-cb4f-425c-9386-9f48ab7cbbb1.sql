-- Create RPC function to get accurate app statistics
CREATE OR REPLACE FUNCTION public.get_app_stats()
RETURNS TABLE(
  total_users BIGINT,
  total_posts BIGINT,
  total_photos BIGINT,
  total_videos BIGINT,
  total_rewards BIGINT
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_users BIGINT;
  v_posts BIGINT;
  v_photos BIGINT;
  v_videos BIGINT;
  v_rewards BIGINT;
  v_media_photos BIGINT;
  v_media_videos BIGINT;
BEGIN
  -- Count total users
  SELECT COUNT(*) INTO v_users FROM profiles;
  
  -- Count total posts
  SELECT COUNT(*) INTO v_posts FROM posts;
  
  -- Count photos from image_url column
  SELECT COUNT(*) INTO v_photos FROM posts WHERE image_url IS NOT NULL AND image_url != '';
  
  -- Count videos from video_url column
  SELECT COUNT(*) INTO v_videos FROM posts WHERE video_url IS NOT NULL AND video_url != '';
  
  -- Count photos from media_urls JSONB array
  SELECT COALESCE(SUM(
    (SELECT COUNT(*) FROM jsonb_array_elements(media_urls) elem 
     WHERE elem->>'type' = 'image')
  ), 0) INTO v_media_photos 
  FROM posts 
  WHERE media_urls IS NOT NULL AND jsonb_array_length(media_urls) > 0;
  
  -- Count videos from media_urls JSONB array
  SELECT COALESCE(SUM(
    (SELECT COUNT(*) FROM jsonb_array_elements(media_urls) elem 
     WHERE elem->>'type' = 'video')
  ), 0) INTO v_media_videos 
  FROM posts 
  WHERE media_urls IS NOT NULL AND jsonb_array_length(media_urls) > 0;
  
  -- Add media_urls counts
  v_photos := v_photos + v_media_photos;
  v_videos := v_videos + v_media_videos;
  
  -- Get total rewards from V2 function
  SELECT COALESCE(SUM(r.total_reward), 0) INTO v_rewards 
  FROM get_user_rewards_v2(10000) r;
  
  RETURN QUERY SELECT v_users, v_posts, v_photos, v_videos, v_rewards;
END;
$$;
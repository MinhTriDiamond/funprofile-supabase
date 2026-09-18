CREATE OR REPLACE FUNCTION public.get_app_stats()
 RETURNS TABLE(total_users bigint, total_posts bigint, total_photos bigint, total_videos bigint, total_rewards bigint, total_camly_circulating numeric, total_usdt_circulating numeric, total_btcb_circulating numeric)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_users BIGINT;
  v_posts BIGINT;
  v_photos BIGINT;
  v_videos BIGINT;
  v_rewards BIGINT;
  v_media_photos BIGINT;
  v_media_videos BIGINT;
  v_camly NUMERIC;
  v_usdt NUMERIC;
  v_btcb NUMERIC;
  v_camly_claimed NUMERIC;
BEGIN
  -- Count only non-banned users
  SELECT COUNT(*) INTO v_users FROM profiles WHERE is_banned = false;
  
  SELECT COUNT(*) INTO v_posts FROM posts;
  
  SELECT COUNT(*) INTO v_photos FROM posts WHERE image_url IS NOT NULL AND image_url != '';
  
  SELECT COUNT(*) INTO v_videos FROM posts WHERE video_url IS NOT NULL AND video_url != '';
  
  SELECT COALESCE(SUM(
    (SELECT COUNT(*) FROM jsonb_array_elements(p.media_urls) elem WHERE elem->>'type' = 'image')
  ), 0) INTO v_media_photos 
  FROM posts p 
  WHERE p.media_urls IS NOT NULL AND jsonb_array_length(p.media_urls) > 0;
  
  SELECT COALESCE(SUM(
    (SELECT COUNT(*) FROM jsonb_array_elements(p.media_urls) elem WHERE elem->>'type' = 'video')
  ), 0) INTO v_media_videos 
  FROM posts p 
  WHERE p.media_urls IS NOT NULL AND jsonb_array_length(p.media_urls) > 0;
  
  v_photos := v_photos + v_media_photos;
  v_videos := v_videos + v_media_videos;
  
  SELECT COALESCE(SUM(r.total_reward), 0) INTO v_rewards 
  FROM get_user_rewards_v2(10000) r;
  
  SELECT COALESCE(SUM(amount), 0) INTO v_camly_claimed FROM reward_claims;
  SELECT COALESCE(SUM(amount::numeric), 0) INTO v_camly FROM transactions WHERE token_symbol = 'CAMLY';
  v_camly := v_camly + v_camly_claimed;
  
  SELECT COALESCE(SUM(amount::numeric), 0) INTO v_usdt FROM transactions WHERE token_symbol = 'USDT';
  SELECT COALESCE(SUM(amount::numeric), 0) INTO v_btcb FROM transactions WHERE token_symbol = 'BTCB';
  
  RETURN QUERY SELECT v_users, v_posts, v_photos, v_videos, v_rewards, v_camly, v_usdt, v_btcb;
END;
$function$;
-- SSOT Rewards (2026-10-15): moi so lieu thuong doc tu user_honor_stats_cache
-- (cong thuc chuan duy nhat = get_user_honor_stats_compute).
CREATE OR REPLACE FUNCTION public.get_my_rewards()
 RETURNS TABLE(id uuid, username text, avatar_url text, posts_count bigint, comments_count bigint, reactions_count bigint, friends_count bigint, shares_count bigint, reactions_on_posts bigint, livestreams_count bigint, today_reward bigint, total_reward bigint)
 LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $fn$
DECLARE
  v_user_id uuid := auth.uid();
  p record; c record;
BEGIN
  IF v_user_id IS NULL THEN RETURN; END IF;
  SELECT * INTO p FROM public.profiles WHERE id = v_user_id AND COALESCE(is_banned, false) = false;
  IF NOT FOUND THEN RETURN; END IF;
  SELECT * INTO c FROM public.user_honor_stats_cache WHERE user_id = v_user_id;
  IF NOT FOUND THEN
    PERFORM public.refresh_user_honor_stats_cache(v_user_id);
    SELECT * INTO c FROM public.user_honor_stats_cache WHERE user_id = v_user_id;
  ELSIF c.refreshed_at < now() - interval '5 minutes' THEN
    INSERT INTO public.user_honor_stats_refresh_queue (user_id) VALUES (v_user_id)
    ON CONFLICT (user_id) DO NOTHING;
  END IF;
  RETURN QUERY SELECT p.id, p.username, p.avatar_url,
    c.posts_all_count, c.actual_comments_count, c.reactions_made_count, c.actual_friends_count,
    c.actual_shares_count, c.actual_reactions_count, c.actual_livestreams_count,
    c.today_reward::bigint, c.total_reward::bigint;
END;
$fn$;

CREATE OR REPLACE FUNCTION public.get_user_rewards_v2(limit_count integer DEFAULT 10000)
 RETURNS TABLE(id uuid, username text, avatar_url text, posts_count bigint, comments_count bigint, reactions_count bigint, friends_count bigint, shares_count bigint, reactions_on_posts bigint, livestreams_count bigint, today_reward bigint, total_reward bigint)
 LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $fn$
BEGIN
  RETURN QUERY
  SELECT p.id, p.username, p.avatar_url,
    c.posts_all_count, c.actual_comments_count, c.reactions_made_count, c.actual_friends_count,
    c.actual_shares_count, c.actual_reactions_count, c.actual_livestreams_count,
    c.today_reward::bigint, c.total_reward::bigint
  FROM public.user_honor_stats_cache c
  JOIN public.profiles p ON p.id = c.user_id
  WHERE p.is_banned = false
  ORDER BY c.total_reward DESC
  LIMIT limit_count;
END;
$fn$;

CREATE OR REPLACE FUNCTION public.get_user_rewards_v2_single(target_user_id uuid)
 RETURNS TABLE(id uuid, username text, avatar_url text, posts_count bigint, comments_count bigint, reactions_count bigint, friends_count bigint, shares_count bigint, reactions_on_posts bigint, livestreams_count bigint, today_reward bigint, total_reward bigint)
 LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $fn$
DECLARE p record; c record;
BEGIN
  SELECT * INTO p FROM public.profiles WHERE id = target_user_id AND is_banned = false;
  IF NOT FOUND THEN RETURN; END IF;
  SELECT * INTO c FROM public.user_honor_stats_cache WHERE user_id = target_user_id;
  IF NOT FOUND THEN
    PERFORM public.refresh_user_honor_stats_cache(target_user_id);
    SELECT * INTO c FROM public.user_honor_stats_cache WHERE user_id = target_user_id;
  END IF;
  RETURN QUERY SELECT p.id, p.username, p.avatar_url,
    c.posts_all_count, c.actual_comments_count, c.reactions_made_count, c.actual_friends_count,
    c.actual_shares_count, c.actual_reactions_count, c.actual_livestreams_count,
    c.today_reward::bigint, c.total_reward::bigint;
END;
$fn$;

CREATE OR REPLACE FUNCTION public.refresh_app_stats_cache()
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  cutoff_date CONSTANT TIMESTAMPTZ := '2026-01-15 00:00:00+00';
  v_total_users BIGINT; v_total_posts BIGINT; v_total_photos BIGINT; v_total_videos BIGINT;
  v_total_livestreams BIGINT; v_total_rewards NUMERIC; v_treasury NUMERIC; v_claimed NUMERIC;
  v_user_count BIGINT; v_old_reward NUMERIC; v_new_reward NUMERIC;
  v_videos_combined BIGINT; v_sent JSONB; v_recv JSONB;
BEGIN
  SELECT COUNT(*) INTO v_total_users FROM profiles WHERE is_banned = false;
  SELECT COUNT(*) INTO v_total_posts FROM posts WHERE deleted_at IS NULL AND (post_type IS NULL OR post_type <> 'gift_celebration');
  SELECT COUNT(*) INTO v_total_photos FROM posts WHERE deleted_at IS NULL AND media_urls IS NOT NULL AND jsonb_array_length(media_urls) > 0;
  SELECT COUNT(*) INTO v_total_videos FROM posts WHERE deleted_at IS NULL AND video_url IS NOT NULL;
  SELECT COUNT(*) INTO v_total_livestreams FROM live_sessions WHERE status = 'ended';
  v_videos_combined := v_total_posts + v_total_livestreams;
  SELECT COALESCE(SUM(amount), 0) INTO v_treasury FROM reward_claims;
  v_claimed := v_treasury;
  SELECT COUNT(*) INTO v_user_count FROM profiles;
  -- SSOT 2026-10-15: tong thuong = tong tu cache vinh danh chuan (user_honor_stats_cache)
  SELECT COALESCE(SUM(total_reward), 0) INTO v_total_rewards FROM public.user_honor_stats_cache;

  -- SENT = chỉ giao dịch từ user nội bộ
  SELECT COALESCE(jsonb_object_agg(sym, total), '{}'::jsonb) INTO v_sent
  FROM (
    SELECT UPPER(d.token_symbol) AS sym, SUM(d.amount::numeric) AS total
    FROM donations d
    WHERE d.status='confirmed' AND d.amount ~ '^[0-9]+(\.[0-9]+)?$'
      AND d.token_symbol IS NOT NULL AND d.sender_id IS NOT NULL
    GROUP BY UPPER(d.token_symbol)
  ) z;

  -- RECEIVED = mọi giao dịch on-chain vào user thật (gồm cả ví ngoài)
  SELECT COALESCE(jsonb_object_agg(sym, total), '{}'::jsonb) INTO v_recv
  FROM (
    SELECT UPPER(d.token_symbol) AS sym, SUM(d.amount::numeric) AS total
    FROM donations d
    LEFT JOIN profiles pr ON pr.id = d.recipient_id
    WHERE d.status='confirmed' AND d.amount ~ '^[0-9]+(\.[0-9]+)?$'
      AND d.token_symbol IS NOT NULL AND d.recipient_id IS NOT NULL
      AND NOT COALESCE(pr.exclude_from_leaderboard, false)
      AND d.leaderboard_eligibility IN ('internal','external_to_father','external_excluded')
    GROUP BY UPPER(d.token_symbol)
  ) z;

  INSERT INTO app_stats_cache (id, total_users, total_posts, total_photos, total_videos, total_livestreams,
    total_videos_combined, total_rewards, treasury_camly_received, total_camly_claimed,
    sent_token_totals, received_token_totals, refreshed_at)
  VALUES (1, v_total_users, v_total_posts, v_total_photos, v_total_videos, v_total_livestreams,
    v_videos_combined, v_total_rewards, v_treasury, v_claimed, v_sent, v_recv, now())
  ON CONFLICT (id) DO UPDATE SET
    total_users=EXCLUDED.total_users, total_posts=EXCLUDED.total_posts, total_photos=EXCLUDED.total_photos,
    total_videos=EXCLUDED.total_videos, total_livestreams=EXCLUDED.total_livestreams,
    total_videos_combined=EXCLUDED.total_videos_combined, total_rewards=EXCLUDED.total_rewards,
    treasury_camly_received=EXCLUDED.treasury_camly_received, total_camly_claimed=EXCLUDED.total_camly_claimed,
    sent_token_totals=EXCLUDED.sent_token_totals, received_token_totals=EXCLUDED.received_token_totals,
    refreshed_at=EXCLUDED.refreshed_at;
END; $function$;
SELECT public.refresh_app_stats_cache() AS refreshed;
SELECT total_rewards FROM public.app_stats_cache WHERE id = 1;

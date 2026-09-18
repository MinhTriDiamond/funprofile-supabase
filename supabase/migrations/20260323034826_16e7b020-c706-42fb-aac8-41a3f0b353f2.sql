
DROP FUNCTION IF EXISTS public.get_user_honor_stats(UUID);

CREATE FUNCTION public.get_user_honor_stats(p_user_id UUID)
RETURNS TABLE(
  posts_count BIGINT,
  reactions_on_posts BIGINT,
  comments_count BIGINT,
  shares_count BIGINT,
  friends_count BIGINT,
  livestreams_count BIGINT,
  total_reward NUMERIC,
  today_reward NUMERIC,
  claimed_amount NUMERIC,
  actual_posts_count BIGINT,
  actual_reactions_count BIGINT,
  actual_comments_count BIGINT,
  actual_shares_count BIGINT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  cutoff_date CONSTANT TIMESTAMPTZ := '2026-01-15 00:00:00+00';
  v_posts_count BIGINT;
  v_reactions BIGINT;
  v_comments BIGINT;
  v_shares BIGINT;
  v_friends BIGINT;
  v_livestreams BIGINT;
  v_total_reward NUMERIC;
  v_today_reward NUMERIC;
  v_claimed NUMERIC;
  v_pplp_reward NUMERIC;
  v_old_posts BIGINT;
  v_old_reactions BIGINT;
  v_old_comments BIGINT;
  v_old_shares BIGINT;
  v_old_friends BIGINT;
  v_new_posts BIGINT;
  v_new_reactions BIGINT;
  v_new_comments BIGINT;
  v_new_shares BIGINT;
  v_new_friends BIGINT;
  v_new_livestreams BIGINT;
  v_today_posts BIGINT;
  v_today_reactions BIGINT;
  v_today_comments BIGINT;
  v_today_shares BIGINT;
  v_today_friends BIGINT;
  v_today_livestreams BIGINT;
  v_actual_posts BIGINT;
  v_actual_reactions BIGINT;
  v_actual_comments BIGINT;
  v_actual_shares BIGINT;
BEGIN
  SELECT COALESCE(COUNT(*), 0) INTO v_old_posts
  FROM posts WHERE user_id = p_user_id AND created_at < cutoff_date AND COALESCE(is_reward_eligible, true) = true;

  SELECT COALESCE(COUNT(*), 0) INTO v_old_reactions
  FROM reactions r INNER JOIN posts po ON r.post_id = po.id
  WHERE po.user_id = p_user_id AND r.created_at < cutoff_date;

  SELECT COALESCE(COUNT(*), 0) INTO v_old_comments
  FROM comments c INNER JOIN posts po ON c.post_id = po.id
  WHERE po.user_id = p_user_id AND c.created_at < cutoff_date;

  SELECT COALESCE(COUNT(*), 0) INTO v_old_shares
  FROM shared_posts sp INNER JOIN posts po ON sp.original_post_id = po.id
  WHERE po.user_id = p_user_id AND sp.created_at < cutoff_date;

  SELECT COALESCE(COUNT(*), 0) INTO v_old_friends
  FROM friendships WHERE (user_id = p_user_id OR friend_id = p_user_id) AND status = 'accepted' AND created_at < cutoff_date;

  SELECT COALESCE(SUM(capped), 0) INTO v_new_posts FROM (
    SELECT LEAST(COUNT(*), 10) AS capped FROM posts
    WHERE user_id = p_user_id AND created_at >= cutoff_date AND COALESCE(is_reward_eligible, true) = true
    GROUP BY (created_at AT TIME ZONE 'UTC')::DATE
  ) t;

  SELECT COALESCE(SUM(capped), 0) INTO v_new_reactions FROM (
    SELECT LEAST(COUNT(*), 50) AS capped FROM reactions r
    INNER JOIN posts po ON r.post_id = po.id
    WHERE po.user_id = p_user_id AND r.created_at >= cutoff_date
    GROUP BY (r.created_at AT TIME ZONE 'UTC')::DATE
  ) t;

  SELECT COALESCE(SUM(capped), 0) INTO v_new_comments FROM (
    SELECT LEAST(COUNT(*), 50) AS capped FROM comments c
    INNER JOIN posts po ON c.post_id = po.id
    WHERE po.user_id = p_user_id AND c.created_at >= cutoff_date AND length(c.content) > 20
    GROUP BY (c.created_at AT TIME ZONE 'UTC')::DATE
  ) t;

  SELECT COALESCE(SUM(capped), 0) INTO v_new_shares FROM (
    SELECT LEAST(COUNT(*), 10) AS capped FROM shared_posts sp
    INNER JOIN posts po ON sp.original_post_id = po.id
    WHERE po.user_id = p_user_id AND sp.created_at >= cutoff_date
    GROUP BY (sp.created_at AT TIME ZONE 'UTC')::DATE
  ) t;

  SELECT COALESCE(SUM(capped), 0) INTO v_new_friends FROM (
    SELECT LEAST(COUNT(*), 10) AS capped FROM (
      SELECT created_at FROM friendships WHERE user_id = p_user_id AND status = 'accepted' AND created_at >= cutoff_date
      UNION ALL
      SELECT created_at FROM friendships WHERE friend_id = p_user_id AND status = 'accepted' AND created_at >= cutoff_date
    ) f
    GROUP BY (created_at AT TIME ZONE 'UTC')::DATE
  ) t;

  SELECT COALESCE(SUM(capped), 0) INTO v_new_livestreams FROM (
    SELECT LEAST(COUNT(*), 5) AS capped FROM livestreams
    WHERE user_id = p_user_id AND started_at >= cutoff_date AND is_eligible = true
    GROUP BY (started_at AT TIME ZONE 'UTC')::DATE
  ) t;

  v_posts_count := v_old_posts + v_new_posts;
  v_reactions := v_old_reactions + v_new_reactions;
  v_comments := v_old_comments + v_new_comments;
  v_shares := v_old_shares + v_new_shares;
  v_friends := v_old_friends + v_new_friends;
  v_livestreams := v_new_livestreams;

  v_total_reward := 50000
    + (v_old_posts * 5000) + (v_old_reactions * 1000) + (v_old_comments * 1000) + (v_old_shares * 1000) + (v_old_friends * 10000)
    + (v_new_posts * 5000) + (v_new_reactions * 1000) + (v_new_comments * 1000) + (v_new_shares * 1000) + (v_new_friends * 10000) + (v_new_livestreams * 20000);

  SELECT COALESCE(SUM(mint_amount), 0) INTO v_pplp_reward
  FROM light_actions
  WHERE user_id = p_user_id AND mint_status IN ('approved', 'minted') AND mint_amount > 0;

  v_total_reward := v_total_reward + v_pplp_reward;

  SELECT COALESCE(LEAST(COUNT(*), 10), 0) INTO v_today_posts FROM posts
  WHERE user_id = p_user_id AND (created_at AT TIME ZONE 'UTC')::DATE = CURRENT_DATE AND COALESCE(is_reward_eligible, true) = true;

  SELECT COALESCE(LEAST(COUNT(*), 50), 0) INTO v_today_reactions FROM reactions r
  INNER JOIN posts po ON r.post_id = po.id
  WHERE po.user_id = p_user_id AND (r.created_at AT TIME ZONE 'UTC')::DATE = CURRENT_DATE;

  SELECT COALESCE(LEAST(COUNT(*), 50), 0) INTO v_today_comments FROM comments c
  INNER JOIN posts po ON c.post_id = po.id
  WHERE po.user_id = p_user_id AND (c.created_at AT TIME ZONE 'UTC')::DATE = CURRENT_DATE AND length(c.content) > 20;

  SELECT COALESCE(LEAST(COUNT(*), 10), 0) INTO v_today_shares FROM shared_posts sp
  INNER JOIN posts po ON sp.original_post_id = po.id
  WHERE po.user_id = p_user_id AND (sp.created_at AT TIME ZONE 'UTC')::DATE = CURRENT_DATE;

  SELECT COALESCE(LEAST(COUNT(*), 10), 0) INTO v_today_friends FROM (
    SELECT id FROM friendships WHERE user_id = p_user_id AND status = 'accepted' AND (created_at AT TIME ZONE 'UTC')::DATE = CURRENT_DATE
    UNION ALL
    SELECT id FROM friendships WHERE friend_id = p_user_id AND status = 'accepted' AND (created_at AT TIME ZONE 'UTC')::DATE = CURRENT_DATE
  ) f;

  SELECT COALESCE(LEAST(COUNT(*), 5), 0) INTO v_today_livestreams FROM livestreams
  WHERE user_id = p_user_id AND (started_at AT TIME ZONE 'UTC')::DATE = CURRENT_DATE AND is_eligible = true;

  v_today_reward := (v_today_posts * 5000) + (v_today_reactions * 1000) + (v_today_comments * 1000) + (v_today_shares * 1000) + (v_today_friends * 10000) + (v_today_livestreams * 20000);

  SELECT COALESCE(SUM(amount), 0) INTO v_claimed
  FROM reward_claims WHERE user_id = p_user_id;

  v_total_reward := GREATEST(v_total_reward, v_claimed);

  -- Actual counts (no daily caps, no is_reward_eligible filter, exclude gift_celebration)
  SELECT COALESCE(COUNT(*), 0) INTO v_actual_posts
  FROM posts WHERE user_id = p_user_id AND post_type != 'gift_celebration';

  SELECT COALESCE(COUNT(*), 0) INTO v_actual_reactions
  FROM reactions r INNER JOIN posts po ON r.post_id = po.id
  WHERE po.user_id = p_user_id;

  SELECT COALESCE(COUNT(*), 0) INTO v_actual_comments
  FROM comments c INNER JOIN posts po ON c.post_id = po.id
  WHERE po.user_id = p_user_id;

  SELECT COALESCE(COUNT(*), 0) INTO v_actual_shares
  FROM shared_posts sp INNER JOIN posts po ON sp.original_post_id = po.id
  WHERE po.user_id = p_user_id;

  RETURN QUERY SELECT v_posts_count, v_reactions, v_comments, v_shares, v_friends, v_livestreams, v_total_reward, v_today_reward, v_claimed, v_actual_posts, v_actual_reactions, v_actual_comments, v_actual_shares;
END;
$$;

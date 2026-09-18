
CREATE OR REPLACE FUNCTION public.get_user_honor_stats(p_user_id UUID)
RETURNS TABLE(
  posts_count BIGINT,
  reactions_on_posts BIGINT,
  comments_count BIGINT,
  shares_count BIGINT,
  friends_count BIGINT,
  livestreams_count BIGINT,
  total_reward NUMERIC,
  today_reward NUMERIC,
  claimed_amount NUMERIC
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
BEGIN
  -- Old stats (before cutoff)
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

  -- New stats (after cutoff, with daily caps summed)
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

  -- Total counts
  v_posts_count := v_old_posts + v_new_posts;
  v_reactions := v_old_reactions + v_new_reactions;
  v_comments := v_old_comments + v_new_comments;
  v_shares := v_old_shares + v_new_shares;
  v_friends := v_old_friends + v_new_friends;
  v_livestreams := v_new_livestreams;

  -- Total reward
  v_total_reward := 50000
    + (v_old_posts * 5000) + (v_old_reactions * 1000) + (v_old_comments * 1000) + (v_old_shares * 1000) + (v_old_friends * 10000)
    + (v_new_posts * 5000) + (v_new_reactions * 1000) + (v_new_comments * 1000) + (v_new_shares * 1000) + (v_new_friends * 10000) + (v_new_livestreams * 20000);

  -- Today stats
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

  -- Claimed amount
  SELECT COALESCE(SUM(amount), 0) INTO v_claimed FROM reward_claims WHERE user_id = p_user_id;

  RETURN QUERY SELECT v_posts_count, v_reactions, v_comments, v_shares, v_friends, v_livestreams, v_total_reward, v_today_reward, v_claimed;
END;
$$;

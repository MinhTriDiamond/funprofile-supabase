
CREATE OR REPLACE FUNCTION public.get_user_rewards_v2(limit_count INTEGER DEFAULT 10000)
RETURNS TABLE(
  id UUID,
  username TEXT,
  avatar_url TEXT,
  posts_count BIGINT,
  comments_count BIGINT,
  reactions_count BIGINT,
  friends_count BIGINT,
  shares_count BIGINT,
  reactions_on_posts BIGINT,
  livestreams_count BIGINT,
  today_reward BIGINT,
  total_reward BIGINT
)
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  cutoff_date CONSTANT TIMESTAMPTZ := '2026-01-15 00:00:00+00';
BEGIN
  RETURN QUERY
  WITH 
  old_stats AS (
    SELECT 
      p.id AS user_id,
      COALESCE((SELECT COUNT(*) FROM posts WHERE user_id = p.id AND created_at < cutoff_date AND COALESCE(is_reward_eligible, true) = true AND (post_type IS NULL OR post_type <> 'gift_celebration')), 0) AS old_posts,
      COALESCE((SELECT COUNT(*) FROM comments c INNER JOIN posts po ON c.post_id = po.id WHERE po.user_id = p.id AND c.created_at < cutoff_date), 0) AS old_comments,
      COALESCE((SELECT COUNT(*) FROM reactions r INNER JOIN posts po ON r.post_id = po.id WHERE po.user_id = p.id AND r.created_at < cutoff_date), 0) AS old_reactions,
      COALESCE((SELECT COUNT(*) FROM shared_posts sp INNER JOIN posts po ON sp.original_post_id = po.id WHERE po.user_id = p.id AND sp.created_at < cutoff_date), 0) AS old_shares,
      COALESCE((SELECT COUNT(*) FROM friendships WHERE (user_id = p.id OR friend_id = p.id) AND status = 'accepted' AND created_at < cutoff_date), 0) AS old_friends
    FROM profiles p WHERE p.is_banned = false
  ),
  new_daily_posts AS (
    SELECT po.user_id, (created_at AT TIME ZONE 'UTC')::DATE AS reward_date, LEAST(COUNT(*), 10) AS capped_count
    FROM posts po
    WHERE created_at >= cutoff_date AND COALESCE(is_reward_eligible, true) = true
      AND (post_type IS NULL OR post_type <> 'gift_celebration')
    GROUP BY po.user_id, (created_at AT TIME ZONE 'UTC')::DATE
  ),
  new_daily_reactions AS (
    SELECT po.user_id, (r.created_at AT TIME ZONE 'UTC')::DATE AS reward_date, LEAST(COUNT(*), 50) AS capped_count
    FROM reactions r INNER JOIN posts po ON r.post_id = po.id
    WHERE r.created_at >= cutoff_date
    GROUP BY po.user_id, (r.created_at AT TIME ZONE 'UTC')::DATE
  ),
  new_daily_comments AS (
    SELECT po.user_id, (c.created_at AT TIME ZONE 'UTC')::DATE AS reward_date, LEAST(COUNT(*), 50) AS capped_count
    FROM comments c INNER JOIN posts po ON c.post_id = po.id
    WHERE c.created_at >= cutoff_date AND length(c.content) > 20
    GROUP BY po.user_id, (c.created_at AT TIME ZONE 'UTC')::DATE
  ),
  new_daily_shares AS (
    SELECT po.user_id, (sp.created_at AT TIME ZONE 'UTC')::DATE AS reward_date, LEAST(COUNT(*), 10) AS capped_count
    FROM shared_posts sp INNER JOIN posts po ON sp.original_post_id = po.id
    WHERE sp.created_at >= cutoff_date
    GROUP BY po.user_id, (sp.created_at AT TIME ZONE 'UTC')::DATE
  ),
  new_daily_friends AS (
    SELECT user_id, reward_date, LEAST(COUNT(*), 10) AS capped_count
    FROM (
      SELECT user_id, (created_at AT TIME ZONE 'UTC')::DATE AS reward_date FROM friendships WHERE status = 'accepted' AND created_at >= cutoff_date
      UNION ALL
      SELECT friend_id AS user_id, (created_at AT TIME ZONE 'UTC')::DATE AS reward_date FROM friendships WHERE status = 'accepted' AND created_at >= cutoff_date
    ) f GROUP BY user_id, reward_date
  ),
  new_daily_livestreams AS (
    SELECT user_id, (started_at AT TIME ZONE 'UTC')::DATE AS reward_date, LEAST(COUNT(*), 5) AS capped_count
    FROM livestreams WHERE started_at >= cutoff_date AND is_eligible = true
    GROUP BY user_id, (started_at AT TIME ZONE 'UTC')::DATE
  ),
  new_stats AS (
    SELECT p.id AS user_id,
      COALESCE((SELECT SUM(capped_count) FROM new_daily_posts WHERE user_id = p.id), 0) AS new_posts,
      COALESCE((SELECT SUM(capped_count) FROM new_daily_reactions WHERE user_id = p.id), 0) AS new_reactions,
      COALESCE((SELECT SUM(capped_count) FROM new_daily_comments WHERE user_id = p.id), 0) AS new_comments,
      COALESCE((SELECT SUM(capped_count) FROM new_daily_shares WHERE user_id = p.id), 0) AS new_shares,
      COALESCE((SELECT SUM(capped_count) FROM new_daily_friends WHERE user_id = p.id), 0) AS new_friends,
      COALESCE((SELECT SUM(capped_count) FROM new_daily_livestreams WHERE user_id = p.id), 0) AS new_livestreams
    FROM profiles p WHERE p.is_banned = false
  ),
  today_stats AS (
    SELECT p.id AS user_id,
      COALESCE((SELECT capped_count FROM new_daily_posts WHERE user_id = p.id AND reward_date = CURRENT_DATE), 0) AS today_posts,
      COALESCE((SELECT capped_count FROM new_daily_reactions WHERE user_id = p.id AND reward_date = CURRENT_DATE), 0) AS today_reactions,
      COALESCE((SELECT capped_count FROM new_daily_comments WHERE user_id = p.id AND reward_date = CURRENT_DATE), 0) AS today_comments,
      COALESCE((SELECT capped_count FROM new_daily_shares WHERE user_id = p.id AND reward_date = CURRENT_DATE), 0) AS today_shares,
      COALESCE((SELECT capped_count FROM new_daily_friends WHERE user_id = p.id AND reward_date = CURRENT_DATE), 0) AS today_friends,
      COALESCE((SELECT capped_count FROM new_daily_livestreams WHERE user_id = p.id AND reward_date = CURRENT_DATE), 0) AS today_livestreams
    FROM profiles p WHERE p.is_banned = false
  ),
  total_counts AS (
    SELECT p.id AS user_id,
      COALESCE((SELECT COUNT(*) FROM posts WHERE user_id = p.id), 0) AS total_posts,
      COALESCE((SELECT COUNT(*) FROM comments c INNER JOIN posts po ON c.post_id = po.id WHERE po.user_id = p.id), 0) AS total_comments,
      COALESCE((SELECT COUNT(*) FROM reactions WHERE user_id = p.id), 0) AS total_reactions_made,
      COALESCE((SELECT COUNT(*) FROM friendships WHERE (user_id = p.id OR friend_id = p.id) AND status = 'accepted'), 0) AS total_friends,
      COALESCE((SELECT COUNT(*) FROM shared_posts sp INNER JOIN posts po ON sp.original_post_id = po.id WHERE po.user_id = p.id), 0) AS total_shares,
      COALESCE((SELECT COUNT(*) FROM reactions r INNER JOIN posts po ON r.post_id = po.id WHERE po.user_id = p.id), 0) AS total_reactions_on_posts,
      COALESCE((SELECT COUNT(*) FROM livestreams WHERE user_id = p.id AND is_eligible = true), 0) AS total_livestreams
    FROM profiles p WHERE p.is_banned = false
  )
  SELECT 
    p.id, p.username, p.avatar_url,
    tc.total_posts AS posts_count,
    tc.total_comments AS comments_count,
    tc.total_reactions_made AS reactions_count,
    tc.total_friends AS friends_count,
    tc.total_shares AS shares_count,
    tc.total_reactions_on_posts AS reactions_on_posts,
    tc.total_livestreams AS livestreams_count,
    ((ts.today_posts * 5000) + (ts.today_reactions * 1000) + (ts.today_comments * 1000) + (ts.today_shares * 1000) + (ts.today_friends * 10000) + (ts.today_livestreams * 20000))::BIGINT AS today_reward,
    (50000 + (os.old_posts * 10000) + (os.old_reactions * 1000) + (os.old_comments * 2000) + (os.old_shares * 10000) + (os.old_friends * 10000) + (ns.new_posts * 5000) + (ns.new_reactions * 1000) + (ns.new_comments * 1000) + (ns.new_shares * 1000) + (ns.new_friends * 10000) + (ns.new_livestreams * 20000))::BIGINT AS total_reward
  FROM profiles p
  LEFT JOIN old_stats os ON os.user_id = p.id
  LEFT JOIN new_stats ns ON ns.user_id = p.id
  LEFT JOIN today_stats ts ON ts.user_id = p.id
  LEFT JOIN total_counts tc ON tc.user_id = p.id
  WHERE p.is_banned = false
  ORDER BY total_reward DESC
  LIMIT limit_count;
END;
$$;

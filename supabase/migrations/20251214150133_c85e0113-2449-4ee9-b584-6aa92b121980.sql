-- Create optimized function to calculate user rewards in a single query
CREATE OR REPLACE FUNCTION public.get_user_rewards(limit_count INT DEFAULT 10)
RETURNS TABLE (
  id UUID,
  username TEXT,
  avatar_url TEXT,
  posts_count BIGINT,
  comments_count BIGINT,
  reactions_count BIGINT,
  friends_count BIGINT,
  shares_count BIGINT,
  reactions_on_posts BIGINT,
  total_reward BIGINT
)
LANGUAGE plpgsql
STABLE
SET search_path = 'public'
AS $$
BEGIN
  RETURN QUERY
  WITH user_stats AS (
    SELECT 
      p.id,
      p.username,
      p.avatar_url,
      COALESCE((SELECT COUNT(*) FROM posts WHERE user_id = p.id), 0) AS posts_count,
      COALESCE((SELECT COUNT(*) FROM comments WHERE user_id = p.id), 0) AS comments_count,
      COALESCE((SELECT COUNT(*) FROM reactions WHERE user_id = p.id), 0) AS reactions_count,
      COALESCE((
        SELECT COUNT(*) FROM friendships 
        WHERE (user_id = p.id OR friend_id = p.id) AND status = 'accepted'
      ), 0) AS friends_count,
      COALESCE((SELECT COUNT(*) FROM shared_posts WHERE user_id = p.id), 0) AS shares_count,
      COALESCE((
        SELECT COUNT(*) FROM reactions r
        INNER JOIN posts po ON r.post_id = po.id
        WHERE po.user_id = p.id
      ), 0) AS reactions_on_posts
    FROM profiles p
  )
  SELECT 
    us.id,
    us.username,
    us.avatar_url,
    us.posts_count,
    us.comments_count,
    us.reactions_count,
    us.friends_count,
    us.shares_count,
    us.reactions_on_posts,
    (
      50000 + -- New user bonus
      (us.posts_count * 10000) + -- Posts reward
      (us.comments_count * 5000) + -- Comments reward
      (us.friends_count * 50000) + -- Friends reward
      (us.shares_count * 20000) + -- Shares reward
      (CASE WHEN us.reactions_on_posts >= 3 THEN 30000 + ((us.reactions_on_posts - 3) * 1000) ELSE 0 END) -- Reactions on posts
    )::BIGINT AS total_reward
  FROM user_stats us
  ORDER BY total_reward DESC
  LIMIT limit_count;
END;
$$;
-- Update get_user_rewards function to use CORRECT and CONSISTENT formula
-- Formula: Posts = 20,000; Friends = 10,000 + 10,000 bonus; Shares = 5,000; Comments ON posts = 5,000
CREATE OR REPLACE FUNCTION public.get_user_rewards(limit_count integer DEFAULT 10)
 RETURNS TABLE(id uuid, username text, avatar_url text, posts_count bigint, comments_count bigint, reactions_count bigint, friends_count bigint, shares_count bigint, reactions_on_posts bigint, total_reward bigint)
 LANGUAGE plpgsql
 STABLE
 SET search_path TO 'public'
AS $function$
BEGIN
  RETURN QUERY
  WITH user_stats AS (
    SELECT 
      p.id,
      p.username,
      p.avatar_url,
      COALESCE((SELECT COUNT(*) FROM posts WHERE user_id = p.id), 0) AS posts_count,
      -- Count comments ON user's posts (not BY user)
      COALESCE((
        SELECT COUNT(*) FROM comments c
        INNER JOIN posts po ON c.post_id = po.id
        WHERE po.user_id = p.id
      ), 0) AS comments_count,
      COALESCE((SELECT COUNT(*) FROM reactions WHERE user_id = p.id), 0) AS reactions_count,
      COALESCE((
        SELECT COUNT(*) FROM friendships 
        WHERE (user_id = p.id OR friend_id = p.id) AND status = 'accepted'
      ), 0) AS friends_count,
      -- Count shares OF user's posts (not BY user)
      COALESCE((
        SELECT COUNT(*) FROM shared_posts sp
        INNER JOIN posts po ON sp.original_post_id = po.id
        WHERE po.user_id = p.id
      ), 0) AS shares_count,
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
      10000 + -- New user bonus: 10,000 CAMLY
      (us.posts_count * 20000) + -- Posts: 1 post = 20,000 CAMLY
      (us.comments_count * 5000) + -- Comments ON posts: 1 comment = 5,000 CAMLY
      (us.friends_count * 10000) + -- Friends: 1 friend = 10,000 CAMLY
      (us.shares_count * 5000) + -- Shares OF posts: 1 share = 5,000 CAMLY
      (CASE WHEN us.reactions_on_posts >= 3 THEN 30000 + ((us.reactions_on_posts - 3) * 1000) ELSE 0 END) -- Reactions: 3+ = 30,000 + 1,000/extra
    )::BIGINT AS total_reward
  FROM user_stats us
  ORDER BY total_reward DESC
  LIMIT limit_count;
END;
$function$;
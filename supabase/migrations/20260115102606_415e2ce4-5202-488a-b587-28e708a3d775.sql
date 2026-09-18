-- Add 50,000 CAMLY new user bonus to reward calculation

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
      50000 +                              -- Bonus user mới: 50,000 CAMLY
      (us.posts_count * 10000) +           -- Posts: 10,000 CAMLY mỗi bài
      (us.reactions_on_posts * 1000) +     -- Reactions nhận được: 1,000 CAMLY mỗi reaction
      (us.comments_count * 2000) +         -- Comments nhận được: 2,000 CAMLY mỗi comment
      (us.shares_count * 10000) +          -- Shares nhận được: 10,000 CAMLY mỗi share
      (us.friends_count * 10000)           -- Friends: 10,000 CAMLY mỗi bạn bè
    )::BIGINT AS total_reward
  FROM user_stats us
  ORDER BY total_reward DESC
  LIMIT limit_count;
END;
$function$;
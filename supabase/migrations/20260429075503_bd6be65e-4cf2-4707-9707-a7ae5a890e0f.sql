CREATE OR REPLACE FUNCTION public.get_my_rewards()
RETURNS TABLE(
  id uuid,
  username text,
  avatar_url text,
  posts_count bigint,
  comments_count bigint,
  reactions_count bigint,
  friends_count bigint,
  shares_count bigint,
  reactions_on_posts bigint,
  livestreams_count bigint,
  today_reward bigint,
  total_reward bigint
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  cutoff_date CONSTANT timestamptz := '2026-01-15 00:00:00+00';
BEGIN
  IF v_user_id IS NULL THEN
    RETURN;
  END IF;

  RETURN QUERY
  WITH target_profile AS (
    SELECT p.id, p.username, p.avatar_url
    FROM public.profiles p
    WHERE p.id = v_user_id
      AND COALESCE(p.is_banned, false) = false
    LIMIT 1
  ),
  old_counts AS (
    SELECT
      tp.id AS user_id,
      COALESCE((SELECT COUNT(*) FROM public.posts po WHERE po.user_id = tp.id AND po.created_at < cutoff_date AND COALESCE(po.is_reward_eligible, true) = true AND (po.post_type IS NULL OR po.post_type <> 'gift_celebration')), 0)::bigint AS old_posts,
      COALESCE((SELECT COUNT(*) FROM public.reactions r INNER JOIN public.posts po ON r.post_id = po.id WHERE po.user_id = tp.id AND r.created_at < cutoff_date), 0)::bigint AS old_reactions,
      COALESCE((SELECT COUNT(*) FROM public.comments c INNER JOIN public.posts po ON c.post_id = po.id WHERE po.user_id = tp.id AND c.created_at < cutoff_date), 0)::bigint AS old_comments,
      COALESCE((SELECT COUNT(*) FROM public.shared_posts sp INNER JOIN public.posts po ON sp.original_post_id = po.id WHERE po.user_id = tp.id AND sp.created_at < cutoff_date), 0)::bigint AS old_shares,
      COALESCE((SELECT COUNT(*) FROM public.friendships f WHERE f.user_id = tp.id AND f.status = 'accepted' AND f.created_at < cutoff_date), 0)::bigint AS old_friends
    FROM target_profile tp
  ),
  new_counts AS (
    SELECT
      tp.id AS user_id,
      COALESCE((SELECT SUM(capped_count) FROM (SELECT LEAST(COUNT(*), 10)::bigint AS capped_count FROM public.posts po WHERE po.user_id = tp.id AND po.created_at >= cutoff_date AND COALESCE(po.is_reward_eligible, true) = true AND (po.post_type IS NULL OR po.post_type <> 'gift_celebration') GROUP BY (po.created_at AT TIME ZONE 'UTC')::date) x), 0)::bigint AS new_posts,
      COALESCE((SELECT SUM(capped_count) FROM (SELECT LEAST(COUNT(*), 50)::bigint AS capped_count FROM public.reactions r INNER JOIN public.posts po ON r.post_id = po.id WHERE po.user_id = tp.id AND r.created_at >= cutoff_date GROUP BY (r.created_at AT TIME ZONE 'UTC')::date) x), 0)::bigint AS new_reactions,
      COALESCE((SELECT SUM(capped_count) FROM (SELECT LEAST(COUNT(*), 50)::bigint AS capped_count FROM public.comments c INNER JOIN public.posts po ON c.post_id = po.id WHERE po.user_id = tp.id AND c.created_at >= cutoff_date AND length(c.content) > 20 GROUP BY (c.created_at AT TIME ZONE 'UTC')::date) x), 0)::bigint AS new_comments,
      COALESCE((SELECT SUM(capped_count) FROM (SELECT LEAST(COUNT(*), 10)::bigint AS capped_count FROM public.shared_posts sp INNER JOIN public.posts po ON sp.original_post_id = po.id WHERE po.user_id = tp.id AND sp.created_at >= cutoff_date GROUP BY (sp.created_at AT TIME ZONE 'UTC')::date) x), 0)::bigint AS new_shares,
      COALESCE((SELECT SUM(capped_count) FROM (SELECT LEAST(COUNT(*), 10)::bigint AS capped_count FROM public.friendships f WHERE f.user_id = tp.id AND f.status = 'accepted' AND f.created_at >= cutoff_date GROUP BY (f.created_at AT TIME ZONE 'UTC')::date) x), 0)::bigint AS new_friends,
      COALESCE((SELECT SUM(capped_count) FROM (SELECT LEAST(COUNT(*), 5)::bigint AS capped_count FROM public.livestreams l WHERE l.user_id = tp.id AND l.started_at >= cutoff_date AND l.is_eligible = true GROUP BY (l.started_at AT TIME ZONE 'UTC')::date) x), 0)::bigint AS new_livestreams
    FROM target_profile tp
  ),
  today_counts AS (
    SELECT
      tp.id AS user_id,
      COALESCE((SELECT LEAST(COUNT(*), 10) FROM public.posts po WHERE po.user_id = tp.id AND (po.created_at AT TIME ZONE 'UTC')::date = CURRENT_DATE AND COALESCE(po.is_reward_eligible, true) = true AND (po.post_type IS NULL OR po.post_type <> 'gift_celebration')), 0)::bigint AS today_posts,
      COALESCE((SELECT LEAST(COUNT(*), 50) FROM public.reactions r INNER JOIN public.posts po ON r.post_id = po.id WHERE po.user_id = tp.id AND (r.created_at AT TIME ZONE 'UTC')::date = CURRENT_DATE), 0)::bigint AS today_reactions,
      COALESCE((SELECT LEAST(COUNT(*), 50) FROM public.comments c INNER JOIN public.posts po ON c.post_id = po.id WHERE po.user_id = tp.id AND (c.created_at AT TIME ZONE 'UTC')::date = CURRENT_DATE AND length(c.content) > 20), 0)::bigint AS today_comments,
      COALESCE((SELECT LEAST(COUNT(*), 10) FROM public.shared_posts sp INNER JOIN public.posts po ON sp.original_post_id = po.id WHERE po.user_id = tp.id AND (sp.created_at AT TIME ZONE 'UTC')::date = CURRENT_DATE), 0)::bigint AS today_shares,
      COALESCE((SELECT LEAST(COUNT(*), 10) FROM public.friendships f WHERE f.user_id = tp.id AND f.status = 'accepted' AND (f.created_at AT TIME ZONE 'UTC')::date = CURRENT_DATE), 0)::bigint AS today_friends,
      COALESCE((SELECT LEAST(COUNT(*), 5) FROM public.livestreams l WHERE l.user_id = tp.id AND (l.started_at AT TIME ZONE 'UTC')::date = CURRENT_DATE AND l.is_eligible = true), 0)::bigint AS today_livestreams
    FROM target_profile tp
  ),
  total_counts AS (
    SELECT
      tp.id AS user_id,
      COALESCE((SELECT COUNT(*) FROM public.posts po WHERE po.user_id = tp.id), 0)::bigint AS total_posts,
      COALESCE((SELECT COUNT(*) FROM public.comments c INNER JOIN public.posts po ON c.post_id = po.id WHERE po.user_id = tp.id), 0)::bigint AS total_comments,
      COALESCE((SELECT COUNT(*) FROM public.reactions r WHERE r.user_id = tp.id), 0)::bigint AS total_reactions_made,
      COALESCE((SELECT COUNT(*) FROM public.friendships f WHERE f.user_id = tp.id AND f.status = 'accepted'), 0)::bigint AS total_friends,
      COALESCE((SELECT COUNT(*) FROM public.shared_posts sp INNER JOIN public.posts po ON sp.original_post_id = po.id WHERE po.user_id = tp.id), 0)::bigint AS total_shares,
      COALESCE((SELECT COUNT(*) FROM public.reactions r INNER JOIN public.posts po ON r.post_id = po.id WHERE po.user_id = tp.id), 0)::bigint AS total_reactions_on_posts,
      COALESCE((SELECT COUNT(*) FROM public.livestreams l WHERE l.user_id = tp.id AND l.is_eligible = true), 0)::bigint AS total_livestreams
    FROM target_profile tp
  ),
  pplp_reward AS (
    SELECT tp.id AS user_id, COALESCE(SUM(la.mint_amount), 0)::bigint AS amount
    FROM target_profile tp
    LEFT JOIN public.light_actions la ON la.user_id = tp.id AND la.mint_status IN ('approved', 'minted') AND la.mint_amount > 0
    GROUP BY tp.id
  )
  SELECT
    tp.id,
    tp.username,
    tp.avatar_url,
    tc.total_posts AS posts_count,
    tc.total_comments AS comments_count,
    tc.total_reactions_made AS reactions_count,
    tc.total_friends AS friends_count,
    tc.total_shares AS shares_count,
    tc.total_reactions_on_posts AS reactions_on_posts,
    tc.total_livestreams AS livestreams_count,
    ((tdy.today_posts * 5000) + (tdy.today_reactions * 1000) + (tdy.today_comments * 1000) + (tdy.today_shares * 1000) + (tdy.today_friends * 10000) + (tdy.today_livestreams * 20000))::bigint AS today_reward,
    (50000 + (oc.old_posts * 5000) + (oc.old_reactions * 1000) + (oc.old_comments * 1000) + (oc.old_shares * 1000) + (oc.old_friends * 10000) + (nc.new_posts * 5000) + (nc.new_reactions * 1000) + (nc.new_comments * 1000) + (nc.new_shares * 1000) + (nc.new_friends * 10000) + (nc.new_livestreams * 20000) + COALESCE(pr.amount, 0))::bigint AS total_reward
  FROM target_profile tp
  JOIN old_counts oc ON oc.user_id = tp.id
  JOIN new_counts nc ON nc.user_id = tp.id
  JOIN today_counts tdy ON tdy.user_id = tp.id
  JOIN total_counts tc ON tc.user_id = tp.id
  LEFT JOIN pplp_reward pr ON pr.user_id = tp.id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_my_rewards() TO authenticated;
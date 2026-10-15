-- Honor stats cache layer (2026-10-15): logic goc giu nguyen 100% trong _compute.
CREATE TABLE IF NOT EXISTS public.user_honor_stats_cache (
  user_id uuid PRIMARY KEY,
  posts_count bigint, reactions_on_posts bigint, comments_count bigint, shares_count bigint,
  friends_count bigint, livestreams_count bigint,
  total_reward numeric, today_reward numeric, claimed_amount numeric,
  actual_posts_count bigint, actual_reactions_count bigint, actual_comments_count bigint,
  actual_shares_count bigint, actual_friends_count bigint,
  refreshed_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.user_honor_stats_cache ENABLE ROW LEVEL SECURITY;
CREATE TABLE IF NOT EXISTS public.user_honor_stats_refresh_queue (
  user_id uuid PRIMARY KEY,
  queued_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.user_honor_stats_refresh_queue ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.get_user_honor_stats_compute(p_user_id uuid)
 RETURNS TABLE(posts_count bigint, reactions_on_posts bigint, comments_count bigint, shares_count bigint, friends_count bigint, livestreams_count bigint, total_reward numeric, today_reward numeric, claimed_amount numeric, actual_posts_count bigint, actual_reactions_count bigint, actual_comments_count bigint, actual_shares_count bigint, actual_friends_count bigint)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
  v_actual_friends BIGINT;
BEGIN
  SELECT COALESCE(COUNT(*), 0) INTO v_old_posts
  FROM posts WHERE user_id = p_user_id AND created_at < cutoff_date AND COALESCE(is_reward_eligible, true) = true
    AND (post_type IS NULL OR post_type <> 'gift_celebration');

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
      AND (post_type IS NULL OR post_type <> 'gift_celebration')
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
  WHERE user_id = p_user_id AND (created_at AT TIME ZONE 'UTC')::DATE = CURRENT_DATE AND COALESCE(is_reward_eligible, true) = true
    AND (post_type IS NULL OR post_type <> 'gift_celebration');

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

  SELECT COALESCE(COUNT(*), 0) INTO v_actual_posts
  FROM posts WHERE user_id = p_user_id AND (post_type IS NULL OR post_type <> 'gift_celebration');

  SELECT COALESCE(COUNT(*), 0) INTO v_actual_reactions
  FROM reactions r INNER JOIN posts po ON r.post_id = po.id
  WHERE po.user_id = p_user_id;

  SELECT COALESCE(COUNT(*), 0) INTO v_actual_comments
  FROM comments c INNER JOIN posts po ON c.post_id = po.id
  WHERE po.user_id = p_user_id;

  SELECT COALESCE(COUNT(*), 0) INTO v_actual_shares
  FROM shared_posts sp INNER JOIN posts po ON sp.original_post_id = po.id
  WHERE po.user_id = p_user_id;

  SELECT COALESCE(COUNT(*), 0) INTO v_actual_friends
  FROM friendships
  WHERE (user_id = p_user_id OR friend_id = p_user_id) AND status = 'accepted';

  RETURN QUERY SELECT v_posts_count, v_reactions, v_comments, v_shares, v_friends, v_livestreams, v_total_reward, v_today_reward, v_claimed, v_actual_posts, v_actual_reactions, v_actual_comments, v_actual_shares, v_actual_friends;
END;
$function$;

CREATE OR REPLACE FUNCTION public.refresh_user_honor_stats_cache(p_user_id uuid)
RETURNS TABLE(posts_count bigint, reactions_on_posts bigint, comments_count bigint, shares_count bigint, friends_count bigint, livestreams_count bigint, total_reward numeric, today_reward numeric, claimed_amount numeric, actual_posts_count bigint, actual_reactions_count bigint, actual_comments_count bigint, actual_shares_count bigint, actual_friends_count bigint)
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $fn$
DECLARE r record;
BEGIN
  SELECT * INTO r FROM public.get_user_honor_stats_compute(p_user_id);
  INSERT INTO public.user_honor_stats_cache (user_id, posts_count, reactions_on_posts, comments_count, shares_count, friends_count, livestreams_count, total_reward, today_reward, claimed_amount, actual_posts_count, actual_reactions_count, actual_comments_count, actual_shares_count, actual_friends_count, refreshed_at)
  VALUES (p_user_id, r.posts_count, r.reactions_on_posts, r.comments_count, r.shares_count, r.friends_count, r.livestreams_count, r.total_reward, r.today_reward, r.claimed_amount, r.actual_posts_count, r.actual_reactions_count, r.actual_comments_count, r.actual_shares_count, r.actual_friends_count, now())
  ON CONFLICT (user_id) DO UPDATE SET
    posts_count = EXCLUDED.posts_count, reactions_on_posts = EXCLUDED.reactions_on_posts,
    comments_count = EXCLUDED.comments_count, shares_count = EXCLUDED.shares_count,
    friends_count = EXCLUDED.friends_count, livestreams_count = EXCLUDED.livestreams_count,
    total_reward = EXCLUDED.total_reward, today_reward = EXCLUDED.today_reward,
    claimed_amount = EXCLUDED.claimed_amount, actual_posts_count = EXCLUDED.actual_posts_count,
    actual_reactions_count = EXCLUDED.actual_reactions_count, actual_comments_count = EXCLUDED.actual_comments_count,
    actual_shares_count = EXCLUDED.actual_shares_count, actual_friends_count = EXCLUDED.actual_friends_count,
    refreshed_at = now();
  RETURN QUERY SELECT r.posts_count, r.reactions_on_posts, r.comments_count, r.shares_count, r.friends_count, r.livestreams_count, r.total_reward, r.today_reward, r.claimed_amount, r.actual_posts_count, r.actual_reactions_count, r.actual_comments_count, r.actual_shares_count, r.actual_friends_count;
END;
$fn$;

CREATE OR REPLACE FUNCTION public.get_user_honor_stats(p_user_id uuid)
RETURNS TABLE(posts_count bigint, reactions_on_posts bigint, comments_count bigint, shares_count bigint, friends_count bigint, livestreams_count bigint, total_reward numeric, today_reward numeric, claimed_amount numeric, actual_posts_count bigint, actual_reactions_count bigint, actual_comments_count bigint, actual_shares_count bigint, actual_friends_count bigint)
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $fn$
DECLARE c record;
BEGIN
  SELECT * INTO c FROM public.user_honor_stats_cache WHERE user_id = p_user_id;
  IF FOUND THEN
    IF c.refreshed_at < now() - interval '5 minutes' THEN
      INSERT INTO public.user_honor_stats_refresh_queue (user_id) VALUES (p_user_id)
      ON CONFLICT (user_id) DO NOTHING;
    END IF;
    RETURN QUERY SELECT c.posts_count, c.reactions_on_posts, c.comments_count, c.shares_count, c.friends_count, c.livestreams_count, c.total_reward, c.today_reward, c.claimed_amount, c.actual_posts_count, c.actual_reactions_count, c.actual_comments_count, c.actual_shares_count, c.actual_friends_count;
    RETURN;
  END IF;
  RETURN QUERY SELECT * FROM public.refresh_user_honor_stats_cache(p_user_id);
END;
$fn$;

CREATE OR REPLACE FUNCTION public.drain_honor_stats_refresh_queue(p_batch integer DEFAULT 10)
RETURNS integer
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $fn$
DECLARE q record; n integer := 0;
BEGIN
  FOR q IN SELECT user_id FROM public.user_honor_stats_refresh_queue ORDER BY queued_at LIMIT p_batch LOOP
    PERFORM public.refresh_user_honor_stats_cache(q.user_id);
    DELETE FROM public.user_honor_stats_refresh_queue WHERE user_id = q.user_id;
    n := n + 1;
  END LOOP;
  RETURN n;
END;
$fn$;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'honor-stats-refresh-drain') THEN
    PERFORM cron.unschedule('honor-stats-refresh-drain');
  END IF;
END $$;
SELECT cron.schedule('honor-stats-refresh-drain', '* * * * *', 'SELECT public.drain_honor_stats_refresh_queue(10)') AS drain_job_id;

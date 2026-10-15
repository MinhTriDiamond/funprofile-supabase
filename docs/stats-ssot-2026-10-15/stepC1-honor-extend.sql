ALTER TABLE public.user_honor_stats_cache
  ADD COLUMN IF NOT EXISTS posts_all_count bigint,
  ADD COLUMN IF NOT EXISTS reactions_made_count bigint,
  ADD COLUMN IF NOT EXISTS actual_livestreams_count bigint;

CREATE OR REPLACE FUNCTION public.refresh_user_honor_stats_cache(p_user_id uuid)
 RETURNS TABLE(posts_count bigint, reactions_on_posts bigint, comments_count bigint, shares_count bigint, friends_count bigint, livestreams_count bigint, total_reward numeric, today_reward numeric, claimed_amount numeric, actual_posts_count bigint, actual_reactions_count bigint, actual_comments_count bigint, actual_shares_count bigint, actual_friends_count bigint)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE r record;
  v_posts_all bigint; v_reactions_made bigint; v_actual_live bigint;
BEGIN
  SELECT * INTO r FROM public.get_user_honor_stats_compute(p_user_id);
  SELECT COUNT(*) INTO v_posts_all FROM public.posts WHERE user_id = p_user_id;
  SELECT COUNT(*) INTO v_reactions_made FROM public.reactions WHERE user_id = p_user_id;
  SELECT COUNT(*) INTO v_actual_live FROM public.livestreams WHERE user_id = p_user_id AND is_eligible = true;
  INSERT INTO public.user_honor_stats_cache (user_id, posts_all_count, reactions_made_count, actual_livestreams_count, posts_count, reactions_on_posts, comments_count, shares_count, friends_count, livestreams_count, total_reward, today_reward, claimed_amount, actual_posts_count, actual_reactions_count, actual_comments_count, actual_shares_count, actual_friends_count, refreshed_at)
  VALUES (p_user_id, v_posts_all, v_reactions_made, v_actual_live, r.posts_count, r.reactions_on_posts, r.comments_count, r.shares_count, r.friends_count, r.livestreams_count, r.total_reward, r.today_reward, r.claimed_amount, r.actual_posts_count, r.actual_reactions_count, r.actual_comments_count, r.actual_shares_count, r.actual_friends_count, now())
  ON CONFLICT (user_id) DO UPDATE SET
    posts_count = EXCLUDED.posts_count, reactions_on_posts = EXCLUDED.reactions_on_posts,
    comments_count = EXCLUDED.comments_count, shares_count = EXCLUDED.shares_count,
    friends_count = EXCLUDED.friends_count, livestreams_count = EXCLUDED.livestreams_count,
    total_reward = EXCLUDED.total_reward, today_reward = EXCLUDED.today_reward,
    claimed_amount = EXCLUDED.claimed_amount, actual_posts_count = EXCLUDED.actual_posts_count,
    actual_reactions_count = EXCLUDED.actual_reactions_count, actual_comments_count = EXCLUDED.actual_comments_count,
    actual_shares_count = EXCLUDED.actual_shares_count, actual_friends_count = EXCLUDED.actual_friends_count, posts_all_count = EXCLUDED.posts_all_count, reactions_made_count = EXCLUDED.reactions_made_count, actual_livestreams_count = EXCLUDED.actual_livestreams_count,
    refreshed_at = now();
  RETURN QUERY SELECT r.posts_count, r.reactions_on_posts, r.comments_count, r.shares_count, r.friends_count, r.livestreams_count, r.total_reward, r.today_reward, r.claimed_amount, r.actual_posts_count, r.actual_reactions_count, r.actual_comments_count, r.actual_shares_count, r.actual_friends_count;
END;
$function$;

CREATE OR REPLACE FUNCTION public.refresh_stalest_honor_stats(p_batch integer DEFAULT 150)
RETURNS integer
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $fn$
DECLARE uid uuid; n integer := 0;
BEGIN
  -- user chua co cache (moi) -> tinh truoc
  FOR uid IN
    SELECT p.id FROM public.profiles p
    LEFT JOIN public.user_honor_stats_cache c ON c.user_id = p.id
    WHERE c.user_id IS NULL ORDER BY p.created_at LIMIT p_batch
  LOOP
    PERFORM public.refresh_user_honor_stats_cache(uid);
    n := n + 1;
  END LOOP;
  -- user co cache cu nhat -> lam tuoi
  IF n < p_batch THEN
    FOR uid IN
      SELECT user_id FROM public.user_honor_stats_cache ORDER BY refreshed_at ASC LIMIT (p_batch - n)
    LOOP
      PERFORM public.refresh_user_honor_stats_cache(uid);
      DELETE FROM public.user_honor_stats_refresh_queue WHERE user_id = uid;
      n := n + 1;
    END LOOP;
  END IF;
  RETURN n;
END;
$fn$;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'honor-stats-stale-refresh') THEN
    PERFORM cron.unschedule('honor-stats-stale-refresh');
  END IF;
END $$;
SELECT cron.schedule('honor-stats-stale-refresh', '*/5 * * * *', 'SELECT public.refresh_stalest_honor_stats(150)') AS stale_job_id;

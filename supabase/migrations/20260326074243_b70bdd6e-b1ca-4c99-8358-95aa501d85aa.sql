
-- Replace get_content_stats_grouped_vn to calculate EARNED rewards instead of claimed
CREATE OR REPLACE FUNCTION public.get_content_stats_grouped_vn(p_type text, p_mode text, p_limit integer DEFAULT 30, p_offset integer DEFAULT 0)
 RETURNS TABLE(period_label text, count bigint)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_trunc TEXT;
  v_cutoff CONSTANT TIMESTAMPTZ := '2026-01-15 00:00:00+07';
BEGIN
  IF p_mode = 'month' THEN v_trunc := 'month';
  ELSIF p_mode = 'week' THEN v_trunc := 'week';
  ELSE v_trunc := 'day';
  END IF;

  IF p_type = 'posts' THEN
    RETURN QUERY
      SELECT to_char(date_trunc(v_trunc, p.created_at AT TIME ZONE 'Asia/Ho_Chi_Minh'), 'YYYY-MM-DD'),
             COUNT(*)::BIGINT
      FROM posts p
      WHERE (p.post_type IS NULL OR p.post_type NOT IN ('gift_celebration'))
      GROUP BY 1 ORDER BY 1 DESC
      LIMIT p_limit OFFSET p_offset;

  ELSIF p_type = 'photos' THEN
    RETURN QUERY
      SELECT to_char(date_trunc(v_trunc, p.created_at AT TIME ZONE 'Asia/Ho_Chi_Minh'), 'YYYY-MM-DD'),
             COUNT(*)::BIGINT
      FROM posts p
      WHERE (p.image_url IS NOT NULL OR (p.media_urls IS NOT NULL AND p.media_urls::text <> '[]'))
        AND p.video_url IS NULL
        AND (p.post_type IS NULL OR p.post_type NOT IN ('video', 'gift_celebration'))
      GROUP BY 1 ORDER BY 1 DESC
      LIMIT p_limit OFFSET p_offset;

  ELSIF p_type = 'videos' THEN
    RETURN QUERY
      SELECT to_char(date_trunc(v_trunc, p.created_at AT TIME ZONE 'Asia/Ho_Chi_Minh'), 'YYYY-MM-DD'),
             COUNT(*)::BIGINT
      FROM posts p
      WHERE p.video_url IS NOT NULL
        AND (p.post_type IS NULL OR p.post_type NOT IN ('live', 'gift_celebration'))
      GROUP BY 1 ORDER BY 1 DESC
      LIMIT p_limit OFFSET p_offset;

  ELSIF p_type = 'livestreams' THEN
    RETURN QUERY
      SELECT to_char(date_trunc(v_trunc, ls.started_at AT TIME ZONE 'Asia/Ho_Chi_Minh'), 'YYYY-MM-DD'),
             COUNT(*)::BIGINT
      FROM live_sessions ls
      WHERE ls.status = 'ended'
      GROUP BY 1 ORDER BY 1 DESC
      LIMIT p_limit OFFSET p_offset;

  ELSIF p_type = 'rewards' THEN
    RETURN QUERY
      WITH all_rewards AS (
        -- New user bonus: 50k per user on signup date
        SELECT (pr.created_at AT TIME ZONE 'Asia/Ho_Chi_Minh')::date AS rday, 50000::numeric AS reward
        FROM profiles pr WHERE pr.is_banned = false

        UNION ALL

        -- Posts OLD (before cutoff): 10k each, no daily cap
        SELECT (p.created_at AT TIME ZONE 'Asia/Ho_Chi_Minh')::date, 10000
        FROM posts p
        WHERE p.created_at < v_cutoff
          AND COALESCE(p.is_reward_eligible, true) = true
          AND (p.post_type IS NULL OR p.post_type <> 'gift_celebration')

        UNION ALL

        -- Posts NEW (from cutoff): 5k each, max 10/user/day
        SELECT rday, LEAST(cnt, 10) * 5000
        FROM (
          SELECT p.user_id, (p.created_at AT TIME ZONE 'Asia/Ho_Chi_Minh')::date AS rday, COUNT(*) AS cnt
          FROM posts p
          WHERE p.created_at >= v_cutoff
            AND COALESCE(p.is_reward_eligible, true) = true
            AND (p.post_type IS NULL OR p.post_type <> 'gift_celebration')
          GROUP BY p.user_id, (p.created_at AT TIME ZONE 'Asia/Ho_Chi_Minh')::date
        ) x

        UNION ALL

        -- Reactions OLD: 1k each (credited to post owner)
        SELECT (r.created_at AT TIME ZONE 'Asia/Ho_Chi_Minh')::date, 1000
        FROM reactions r INNER JOIN posts po ON r.post_id = po.id
        WHERE r.created_at < v_cutoff

        UNION ALL

        -- Reactions NEW: 1k each, max 50/post-owner/day
        SELECT rday, LEAST(cnt, 50) * 1000
        FROM (
          SELECT po.user_id, (r.created_at AT TIME ZONE 'Asia/Ho_Chi_Minh')::date AS rday, COUNT(*) AS cnt
          FROM reactions r INNER JOIN posts po ON r.post_id = po.id
          WHERE r.created_at >= v_cutoff
          GROUP BY po.user_id, (r.created_at AT TIME ZONE 'Asia/Ho_Chi_Minh')::date
        ) x

        UNION ALL

        -- Comments OLD: 2k each (credited to post owner)
        SELECT (c.created_at AT TIME ZONE 'Asia/Ho_Chi_Minh')::date, 2000
        FROM comments c INNER JOIN posts po ON c.post_id = po.id
        WHERE c.created_at < v_cutoff

        UNION ALL

        -- Comments NEW: 1k each, >20 chars, max 50/post-owner/day
        SELECT rday, LEAST(cnt, 50) * 1000
        FROM (
          SELECT po.user_id, (c.created_at AT TIME ZONE 'Asia/Ho_Chi_Minh')::date AS rday, COUNT(*) AS cnt
          FROM comments c INNER JOIN posts po ON c.post_id = po.id
          WHERE c.created_at >= v_cutoff AND length(c.content) > 20
          GROUP BY po.user_id, (c.created_at AT TIME ZONE 'Asia/Ho_Chi_Minh')::date
        ) x

        UNION ALL

        -- Shares OLD: 10k each (credited to original post owner)
        SELECT (sp.created_at AT TIME ZONE 'Asia/Ho_Chi_Minh')::date, 10000
        FROM shared_posts sp INNER JOIN posts po ON sp.original_post_id = po.id
        WHERE sp.created_at < v_cutoff

        UNION ALL

        -- Shares NEW: 1k each, max 10/post-owner/day
        SELECT rday, LEAST(cnt, 10) * 1000
        FROM (
          SELECT po.user_id, (sp.created_at AT TIME ZONE 'Asia/Ho_Chi_Minh')::date AS rday, COUNT(*) AS cnt
          FROM shared_posts sp INNER JOIN posts po ON sp.original_post_id = po.id
          WHERE sp.created_at >= v_cutoff
          GROUP BY po.user_id, (sp.created_at AT TIME ZONE 'Asia/Ho_Chi_Minh')::date
        ) x

        UNION ALL

        -- Friends OLD: 10k each (both sides)
        SELECT (f.created_at AT TIME ZONE 'Asia/Ho_Chi_Minh')::date, 10000
        FROM friendships f WHERE f.status = 'accepted' AND f.created_at < v_cutoff
        UNION ALL
        SELECT (f.created_at AT TIME ZONE 'Asia/Ho_Chi_Minh')::date, 10000
        FROM friendships f WHERE f.status = 'accepted' AND f.created_at < v_cutoff

        UNION ALL

        -- Friends NEW: 10k each, max 10/user/day (both sides)
        SELECT rday, LEAST(cnt, 10) * 10000
        FROM (
          SELECT uid AS user_id, rday, COUNT(*) AS cnt FROM (
            SELECT user_id AS uid, (created_at AT TIME ZONE 'Asia/Ho_Chi_Minh')::date AS rday FROM friendships WHERE status = 'accepted' AND created_at >= v_cutoff
            UNION ALL
            SELECT friend_id, (created_at AT TIME ZONE 'Asia/Ho_Chi_Minh')::date FROM friendships WHERE status = 'accepted' AND created_at >= v_cutoff
          ) ff GROUP BY uid, rday
        ) x

        UNION ALL

        -- Livestreams NEW only: 20k each, max 5/user/day
        SELECT rday, LEAST(cnt, 5) * 20000
        FROM (
          SELECT l.user_id, (l.started_at AT TIME ZONE 'Asia/Ho_Chi_Minh')::date AS rday, COUNT(*) AS cnt
          FROM livestreams l
          WHERE l.started_at >= v_cutoff AND l.is_eligible = true
          GROUP BY l.user_id, (l.started_at AT TIME ZONE 'Asia/Ho_Chi_Minh')::date
        ) x
      )
      SELECT
        to_char(date_trunc(v_trunc, rday::timestamp AT TIME ZONE 'Asia/Ho_Chi_Minh'), 'YYYY-MM-DD'),
        COALESCE(SUM(reward)::BIGINT, 0)
      FROM all_rewards
      GROUP BY 1 ORDER BY 1 DESC
      LIMIT p_limit OFFSET p_offset;

  ELSE
    RAISE EXCEPTION 'Invalid p_type: %', p_type;
  END IF;
END;
$function$;


-- Replace get_content_users_by_period_vn to calculate EARNED rewards per user instead of claimed
CREATE OR REPLACE FUNCTION public.get_content_users_by_period_vn(p_type text, p_date text, p_mode text)
 RETURNS TABLE(user_id uuid, username text, display_name text, avatar_url text, post_count bigint, social_links jsonb)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_start timestamptz;
  v_end   timestamptz;
  v_date  date := p_date::date;
  v_cutoff CONSTANT TIMESTAMPTZ := '2026-01-15 00:00:00+07';
BEGIN
  IF p_mode = 'day' THEN
    v_start := (v_date::timestamp AT TIME ZONE 'Asia/Ho_Chi_Minh');
    v_end   := v_start + interval '1 day';
  ELSIF p_mode = 'week' THEN
    v_start := (v_date::timestamp AT TIME ZONE 'Asia/Ho_Chi_Minh');
    v_end   := v_start + interval '7 days';
  ELSIF p_mode = 'month' THEN
    v_start := (date_trunc('month', v_date)::timestamp AT TIME ZONE 'Asia/Ho_Chi_Minh');
    v_end   := (date_trunc('month', v_date) + interval '1 month')::timestamp AT TIME ZONE 'Asia/Ho_Chi_Minh';
  END IF;

  IF p_type = 'posts' THEN
    RETURN QUERY
      SELECT p.user_id, pr.username, COALESCE(pr.display_name, pr.full_name)::text AS display_name,
             pr.avatar_url, COUNT(*)::bigint AS post_count, pr.social_links::jsonb
      FROM posts p
      JOIN public_profiles pr ON pr.id = p.user_id
      WHERE p.created_at >= v_start AND p.created_at < v_end
        AND (p.post_type IS NULL OR p.post_type NOT IN ('gift_celebration'))
      GROUP BY p.user_id, pr.username, pr.display_name, pr.full_name, pr.avatar_url, pr.social_links
      ORDER BY post_count DESC;

  ELSIF p_type = 'photos' THEN
    RETURN QUERY
      SELECT p.user_id, pr.username, COALESCE(pr.display_name, pr.full_name)::text AS display_name,
             pr.avatar_url, COUNT(*)::bigint AS post_count, pr.social_links::jsonb
      FROM posts p
      JOIN public_profiles pr ON pr.id = p.user_id
      WHERE p.created_at >= v_start AND p.created_at < v_end
        AND (p.image_url IS NOT NULL OR (p.media_urls IS NOT NULL AND p.media_urls::text <> '[]'))
        AND p.video_url IS NULL
        AND (p.post_type IS NULL OR p.post_type NOT IN ('video', 'gift_celebration'))
      GROUP BY p.user_id, pr.username, pr.display_name, pr.full_name, pr.avatar_url, pr.social_links
      ORDER BY post_count DESC;

  ELSIF p_type = 'videos' THEN
    RETURN QUERY
      SELECT p.user_id, pr.username, COALESCE(pr.display_name, pr.full_name)::text AS display_name,
             pr.avatar_url, COUNT(*)::bigint AS post_count, pr.social_links::jsonb
      FROM posts p
      JOIN public_profiles pr ON pr.id = p.user_id
      WHERE p.created_at >= v_start AND p.created_at < v_end
        AND p.video_url IS NOT NULL
        AND (p.post_type IS NULL OR p.post_type NOT IN ('live', 'gift_celebration'))
      GROUP BY p.user_id, pr.username, pr.display_name, pr.full_name, pr.avatar_url, pr.social_links
      ORDER BY post_count DESC;

  ELSIF p_type = 'livestreams' THEN
    RETURN QUERY
      SELECT ls.host_user_id AS user_id, pr.username, COALESCE(pr.display_name, pr.full_name)::text AS display_name,
             pr.avatar_url, COUNT(*)::bigint AS post_count, pr.social_links::jsonb
      FROM live_sessions ls
      JOIN public_profiles pr ON pr.id = ls.host_user_id
      WHERE ls.started_at >= v_start AND ls.started_at < v_end
        AND ls.status = 'ended'
      GROUP BY ls.host_user_id, pr.username, pr.display_name, pr.full_name, pr.avatar_url, pr.social_links
      ORDER BY post_count DESC;

  ELSIF p_type = 'rewards' THEN
    RETURN QUERY
      WITH user_rewards AS (
        -- New user bonus: 50k (only if signup in period)
        SELECT pr.id AS uid, 50000::numeric AS reward
        FROM profiles pr
        WHERE pr.is_banned = false AND pr.created_at >= v_start AND pr.created_at < v_end

        UNION ALL

        -- Posts OLD
        SELECT p.user_id, 10000
        FROM posts p
        WHERE p.created_at >= v_start AND p.created_at < v_end AND p.created_at < v_cutoff
          AND COALESCE(p.is_reward_eligible, true) = true
          AND (p.post_type IS NULL OR p.post_type <> 'gift_celebration')

        UNION ALL

        -- Posts NEW: 5k, max 10/user/day
        SELECT uid, LEAST(cnt, 10) * 5000
        FROM (
          SELECT p.user_id AS uid, (p.created_at AT TIME ZONE 'Asia/Ho_Chi_Minh')::date AS rday, COUNT(*) AS cnt
          FROM posts p
          WHERE p.created_at >= v_start AND p.created_at < v_end AND p.created_at >= v_cutoff
            AND COALESCE(p.is_reward_eligible, true) = true
            AND (p.post_type IS NULL OR p.post_type <> 'gift_celebration')
          GROUP BY p.user_id, (p.created_at AT TIME ZONE 'Asia/Ho_Chi_Minh')::date
        ) x

        UNION ALL

        -- Reactions OLD: 1k (credited to post owner)
        SELECT po.user_id, 1000
        FROM reactions r INNER JOIN posts po ON r.post_id = po.id
        WHERE r.created_at >= v_start AND r.created_at < v_end AND r.created_at < v_cutoff

        UNION ALL

        -- Reactions NEW: 1k, max 50/owner/day
        SELECT uid, LEAST(cnt, 50) * 1000
        FROM (
          SELECT po.user_id AS uid, (r.created_at AT TIME ZONE 'Asia/Ho_Chi_Minh')::date AS rday, COUNT(*) AS cnt
          FROM reactions r INNER JOIN posts po ON r.post_id = po.id
          WHERE r.created_at >= v_start AND r.created_at < v_end AND r.created_at >= v_cutoff
          GROUP BY po.user_id, (r.created_at AT TIME ZONE 'Asia/Ho_Chi_Minh')::date
        ) x

        UNION ALL

        -- Comments OLD: 2k
        SELECT po.user_id, 2000
        FROM comments c INNER JOIN posts po ON c.post_id = po.id
        WHERE c.created_at >= v_start AND c.created_at < v_end AND c.created_at < v_cutoff

        UNION ALL

        -- Comments NEW: 1k, >20 chars, max 50/owner/day
        SELECT uid, LEAST(cnt, 50) * 1000
        FROM (
          SELECT po.user_id AS uid, (c.created_at AT TIME ZONE 'Asia/Ho_Chi_Minh')::date AS rday, COUNT(*) AS cnt
          FROM comments c INNER JOIN posts po ON c.post_id = po.id
          WHERE c.created_at >= v_start AND c.created_at < v_end AND c.created_at >= v_cutoff
            AND length(c.content) > 20
          GROUP BY po.user_id, (c.created_at AT TIME ZONE 'Asia/Ho_Chi_Minh')::date
        ) x

        UNION ALL

        -- Shares OLD: 10k
        SELECT po.user_id, 10000
        FROM shared_posts sp INNER JOIN posts po ON sp.original_post_id = po.id
        WHERE sp.created_at >= v_start AND sp.created_at < v_end AND sp.created_at < v_cutoff

        UNION ALL

        -- Shares NEW: 1k, max 10/owner/day
        SELECT uid, LEAST(cnt, 10) * 1000
        FROM (
          SELECT po.user_id AS uid, (sp.created_at AT TIME ZONE 'Asia/Ho_Chi_Minh')::date AS rday, COUNT(*) AS cnt
          FROM shared_posts sp INNER JOIN posts po ON sp.original_post_id = po.id
          WHERE sp.created_at >= v_start AND sp.created_at < v_end AND sp.created_at >= v_cutoff
          GROUP BY po.user_id, (sp.created_at AT TIME ZONE 'Asia/Ho_Chi_Minh')::date
        ) x

        UNION ALL

        -- Friends OLD: 10k both sides
        SELECT f.user_id, 10000 FROM friendships f WHERE f.status='accepted' AND f.created_at >= v_start AND f.created_at < v_end AND f.created_at < v_cutoff
        UNION ALL
        SELECT f.friend_id, 10000 FROM friendships f WHERE f.status='accepted' AND f.created_at >= v_start AND f.created_at < v_end AND f.created_at < v_cutoff

        UNION ALL

        -- Friends NEW: 10k, max 10/user/day both sides
        SELECT uid, LEAST(cnt, 10) * 10000
        FROM (
          SELECT uid, rday, COUNT(*) AS cnt FROM (
            SELECT user_id AS uid, (created_at AT TIME ZONE 'Asia/Ho_Chi_Minh')::date AS rday FROM friendships WHERE status='accepted' AND created_at >= v_start AND created_at < v_end AND created_at >= v_cutoff
            UNION ALL
            SELECT friend_id, (created_at AT TIME ZONE 'Asia/Ho_Chi_Minh')::date FROM friendships WHERE status='accepted' AND created_at >= v_start AND created_at < v_end AND created_at >= v_cutoff
          ) ff GROUP BY uid, rday
        ) x

        UNION ALL

        -- Livestreams NEW: 20k, max 5/user/day
        SELECT uid, LEAST(cnt, 5) * 20000
        FROM (
          SELECT l.user_id AS uid, (l.started_at AT TIME ZONE 'Asia/Ho_Chi_Minh')::date AS rday, COUNT(*) AS cnt
          FROM livestreams l
          WHERE l.started_at >= v_start AND l.started_at < v_end AND l.started_at >= v_cutoff AND l.is_eligible = true
          GROUP BY l.user_id, (l.started_at AT TIME ZONE 'Asia/Ho_Chi_Minh')::date
        ) x
      )
      SELECT ur.uid, pr.username, COALESCE(pr.display_name, pr.full_name)::text AS display_name,
             pr.avatar_url, SUM(ur.reward)::bigint AS post_count, pr.social_links::jsonb
      FROM user_rewards ur
      JOIN public_profiles pr ON pr.id = ur.uid
      GROUP BY ur.uid, pr.username, pr.display_name, pr.full_name, pr.avatar_url, pr.social_links
      ORDER BY post_count DESC;
  END IF;
END;
$function$;

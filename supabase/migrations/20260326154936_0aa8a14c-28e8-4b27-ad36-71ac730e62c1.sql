
DROP FUNCTION IF EXISTS public.get_content_stats_grouped_vn(text, text, integer, integer);

CREATE FUNCTION public.get_content_stats_grouped_vn(
  p_type TEXT,
  p_mode TEXT DEFAULT 'day',
  p_limit INT DEFAULT 30,
  p_offset INT DEFAULT 0
)
RETURNS TABLE(period TEXT, total BIGINT)
LANGUAGE plpgsql STABLE
AS $$
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
        SELECT (pr.created_at AT TIME ZONE 'Asia/Ho_Chi_Minh')::date AS rday, 50000::numeric AS reward
        FROM profiles pr WHERE pr.is_banned = false

        UNION ALL
        SELECT (p.created_at AT TIME ZONE 'Asia/Ho_Chi_Minh')::date, 10000
        FROM posts p
        WHERE (p.post_type IS NULL OR p.post_type NOT IN ('gift_celebration'))
          AND COALESCE(p.is_reward_eligible, true) = true AND p.created_at < v_cutoff

        UNION ALL
        SELECT rday, LEAST(cnt, 10) * 5000
        FROM (
          SELECT p.user_id, (p.created_at AT TIME ZONE 'Asia/Ho_Chi_Minh')::date AS rday, COUNT(*) AS cnt
          FROM posts p
          WHERE (p.post_type IS NULL OR p.post_type NOT IN ('gift_celebration'))
            AND COALESCE(p.is_reward_eligible, true) = true AND p.created_at >= v_cutoff
          GROUP BY p.user_id, (p.created_at AT TIME ZONE 'Asia/Ho_Chi_Minh')::date
        ) x

        UNION ALL
        SELECT (r.created_at AT TIME ZONE 'Asia/Ho_Chi_Minh')::date, 1000
        FROM reactions r INNER JOIN posts po ON r.post_id = po.id WHERE r.created_at < v_cutoff

        UNION ALL
        SELECT rday, LEAST(cnt, 50) * 1000
        FROM (
          SELECT po.user_id, (r.created_at AT TIME ZONE 'Asia/Ho_Chi_Minh')::date AS rday, COUNT(*) AS cnt
          FROM reactions r INNER JOIN posts po ON r.post_id = po.id WHERE r.created_at >= v_cutoff
          GROUP BY po.user_id, (r.created_at AT TIME ZONE 'Asia/Ho_Chi_Minh')::date
        ) x

        UNION ALL
        SELECT (c.created_at AT TIME ZONE 'Asia/Ho_Chi_Minh')::date, 2000
        FROM comments c INNER JOIN posts po ON c.post_id = po.id WHERE c.created_at < v_cutoff

        UNION ALL
        SELECT rday, LEAST(cnt, 50) * 1000
        FROM (
          SELECT po.user_id, (c.created_at AT TIME ZONE 'Asia/Ho_Chi_Minh')::date AS rday, COUNT(*) AS cnt
          FROM comments c INNER JOIN posts po ON c.post_id = po.id
          WHERE c.created_at >= v_cutoff AND length(c.content) > 20
          GROUP BY po.user_id, (c.created_at AT TIME ZONE 'Asia/Ho_Chi_Minh')::date
        ) x

        UNION ALL
        SELECT (sp.created_at AT TIME ZONE 'Asia/Ho_Chi_Minh')::date, 10000
        FROM shared_posts sp INNER JOIN posts po ON sp.original_post_id = po.id WHERE sp.created_at < v_cutoff

        UNION ALL
        SELECT rday, LEAST(cnt, 10) * 1000
        FROM (
          SELECT po.user_id, (sp.created_at AT TIME ZONE 'Asia/Ho_Chi_Minh')::date AS rday, COUNT(*) AS cnt
          FROM shared_posts sp INNER JOIN posts po ON sp.original_post_id = po.id WHERE sp.created_at >= v_cutoff
          GROUP BY po.user_id, (sp.created_at AT TIME ZONE 'Asia/Ho_Chi_Minh')::date
        ) x

        UNION ALL
        SELECT (f.created_at AT TIME ZONE 'Asia/Ho_Chi_Minh')::date, 10000
        FROM friendships f WHERE f.status = 'accepted' AND f.created_at < v_cutoff
        UNION ALL
        SELECT (f.created_at AT TIME ZONE 'Asia/Ho_Chi_Minh')::date, 10000
        FROM friendships f WHERE f.status = 'accepted' AND f.created_at < v_cutoff

        UNION ALL
        SELECT rday, LEAST(cnt, 10) * 10000
        FROM (
          SELECT uid AS user_id, rday, COUNT(*) AS cnt FROM (
            SELECT user_id AS uid, (created_at AT TIME ZONE 'Asia/Ho_Chi_Minh')::date AS rday FROM friendships WHERE status = 'accepted' AND created_at >= v_cutoff
            UNION ALL
            SELECT friend_id AS uid, (created_at AT TIME ZONE 'Asia/Ho_Chi_Minh')::date AS rday FROM friendships WHERE status = 'accepted' AND created_at >= v_cutoff
          ) ff GROUP BY uid, rday
        ) x

        UNION ALL
        SELECT rday, LEAST(cnt, 5) * 20000
        FROM (
          SELECT ls.host_user_id, (ls.started_at AT TIME ZONE 'Asia/Ho_Chi_Minh')::date AS rday, COUNT(*) AS cnt
          FROM live_sessions ls
          WHERE ls.status = 'ended' AND ls.started_at >= v_cutoff
          GROUP BY ls.host_user_id, (ls.started_at AT TIME ZONE 'Asia/Ho_Chi_Minh')::date
        ) x

        UNION ALL
        SELECT (la.created_at AT TIME ZONE 'Asia/Ho_Chi_Minh')::date, COALESCE(la.mint_amount, 0)
        FROM light_actions la WHERE la.mint_status = 'minted' AND la.mint_amount > 0
      )
      SELECT to_char(date_trunc(v_trunc, rday), 'YYYY-MM-DD'), SUM(reward)::BIGINT
      FROM all_rewards GROUP BY 1 ORDER BY 1 DESC
      LIMIT p_limit OFFSET p_offset;
  END IF;
END;
$$;

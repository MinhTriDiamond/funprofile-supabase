
-- Fix 1: get_content_stats_grouped_vn - fix double timezone conversion for rewards
-- Fix 2: get_user_posts_by_period_vn - show actual reward activities instead of reward_claims

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
        FROM profiles pr

        UNION ALL

        -- Posts OLD: 10k each
        SELECT (p.created_at AT TIME ZONE 'Asia/Ho_Chi_Minh')::date, 10000
        FROM posts p
        WHERE (p.post_type IS NULL OR p.post_type NOT IN ('gift_celebration'))
          AND p.created_at < v_cutoff

        UNION ALL

        -- Posts NEW: 5k each, max 10/user/day
        SELECT rday, LEAST(cnt, 10) * 5000
        FROM (
          SELECT p.user_id, (p.created_at AT TIME ZONE 'Asia/Ho_Chi_Minh')::date AS rday, COUNT(*) AS cnt
          FROM posts p
          WHERE (p.post_type IS NULL OR p.post_type NOT IN ('gift_celebration'))
            AND p.created_at >= v_cutoff
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
            SELECT friend_id AS uid, (created_at AT TIME ZONE 'Asia/Ho_Chi_Minh')::date AS rday FROM friendships WHERE status = 'accepted' AND created_at >= v_cutoff
          ) ff GROUP BY uid, rday
        ) x

        UNION ALL

        -- Livestreams NEW: 20k each, 10-120min, max 5/user/day
        SELECT rday, LEAST(cnt, 5) * 20000
        FROM (
          SELECT l.user_id, (l.started_at AT TIME ZONE 'Asia/Ho_Chi_Minh')::date AS rday, COUNT(*) AS cnt
          FROM livestreams l
          WHERE l.is_eligible = true AND l.started_at >= v_cutoff
          GROUP BY l.user_id, (l.started_at AT TIME ZONE 'Asia/Ho_Chi_Minh')::date
        ) x
      )
      SELECT
        to_char(date_trunc(v_trunc, rday), 'YYYY-MM-DD'),
        SUM(reward)::BIGINT
      FROM all_rewards
      GROUP BY 1 ORDER BY 1 DESC
      LIMIT p_limit OFFSET p_offset;

  END IF;
END;
$function$;


-- Fix 2: get_user_posts_by_period_vn - rewards case shows actual activities
CREATE OR REPLACE FUNCTION public.get_user_posts_by_period_vn(p_user_id uuid, p_type text, p_date text, p_mode text, p_date_from text DEFAULT NULL::text, p_date_to text DEFAULT NULL::text)
 RETURNS TABLE(id uuid, content text, image_url text, video_url text, media_urls jsonb, post_type text, created_at timestamp with time zone)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_start timestamptz;
  v_end   timestamptz;
  v_date  date;
  v_cutoff CONSTANT TIMESTAMPTZ := '2026-01-15 00:00:00+07';
BEGIN
  IF p_date_from IS NOT NULL AND p_date_to IS NOT NULL THEN
    v_start := (p_date_from || ' 00:00:00+07')::timestamptz;
    v_end   := (p_date_to   || ' 23:59:59.999+07')::timestamptz;
  ELSE
    v_date := p_date::date;
    IF p_mode = 'month' THEN
      v_start := (date_trunc('month', v_date)::date || ' 00:00:00+07')::timestamptz;
      v_end   := ((date_trunc('month', v_date)::date + interval '1 month' - interval '1 day')::date || ' 23:59:59.999+07')::timestamptz;
    ELSIF p_mode = 'week' THEN
      v_start := (v_date || ' 00:00:00+07')::timestamptz;
      v_end   := ((v_date + 6)::date || ' 23:59:59.999+07')::timestamptz;
    ELSE
      v_start := (v_date || ' 00:00:00+07')::timestamptz;
      v_end   := (v_date || ' 23:59:59.999+07')::timestamptz;
    END IF;
  END IF;

  IF p_type = 'posts' THEN
    RETURN QUERY
      SELECT p.id, p.content, p.image_url, p.video_url, p.media_urls, p.post_type, p.created_at
      FROM posts p
      WHERE p.user_id = p_user_id
        AND p.created_at >= v_start AND p.created_at <= v_end
        AND (p.post_type IS NULL OR p.post_type NOT IN ('gift_celebration'))
      ORDER BY p.created_at DESC;

  ELSIF p_type = 'photos' THEN
    RETURN QUERY
      SELECT p.id, p.content, p.image_url, p.video_url, p.media_urls, p.post_type, p.created_at
      FROM posts p
      WHERE p.user_id = p_user_id
        AND p.created_at >= v_start AND p.created_at <= v_end
        AND (p.image_url IS NOT NULL OR (p.media_urls IS NOT NULL AND p.media_urls != '[]'::jsonb))
        AND p.video_url IS NULL
        AND (p.post_type IS NULL OR p.post_type NOT IN ('video', 'gift_celebration'))
      ORDER BY p.created_at DESC;

  ELSIF p_type = 'videos' THEN
    RETURN QUERY
      SELECT p.id, p.content, p.image_url, p.video_url, p.media_urls, p.post_type, p.created_at
      FROM posts p
      WHERE p.user_id = p_user_id
        AND p.created_at >= v_start AND p.created_at <= v_end
        AND p.video_url IS NOT NULL
        AND (p.post_type IS NULL OR p.post_type NOT IN ('live', 'gift_celebration'))
      ORDER BY p.created_at DESC;

  ELSIF p_type = 'livestreams' THEN
    RETURN QUERY
      SELECT
        ls.id,
        COALESCE(NULLIF(TRIM(ls.title), ''), 'Phát trực tiếp') as content,
        lr.thumbnail_url as image_url,
        COALESCE(cr.output_url, lr.media_url) as video_url,
        CASE
          WHEN COALESCE(cr.output_url, lr.media_url) IS NOT NULL THEN
            jsonb_build_array(
              jsonb_build_object(
                'url', COALESCE(cr.output_url, lr.media_url),
                'type', 'video',
                'thumbnail', lr.thumbnail_url
              )
            )
          ELSE NULL
        END as media_urls,
        'live'::text as post_type,
        ls.started_at as created_at
      FROM live_sessions ls
      LEFT JOIN LATERAL (
        SELECT r.media_url, r.thumbnail_url
        FROM live_recordings r
        WHERE r.live_id = ls.id AND r.status = 'ready'
        ORDER BY r.created_at DESC LIMIT 1
      ) lr ON true
      LEFT JOIN LATERAL (
        SELECT c.output_url
        FROM chunked_recordings c
        WHERE c.live_session_id = ls.id AND c.status = 'ready'
        ORDER BY c.created_at DESC LIMIT 1
      ) cr ON true
      WHERE ls.host_user_id = p_user_id
        AND ls.status = 'ended'
        AND ls.started_at >= v_start AND ls.started_at <= v_end
      ORDER BY ls.started_at DESC;

  ELSIF p_type = 'rewards' THEN
    -- Show actual reward-generating activities for this user in this period
    RETURN QUERY
      WITH reward_activities AS (
        -- Posts
        SELECT p.id, 
               CASE WHEN p.created_at < v_cutoff 
                 THEN '📝 Đăng bài: +10,000 CAMLY'
                 ELSE '📝 Đăng bài: +5,000 CAMLY'
               END as content,
               p.image_url, p.video_url, p.media_urls,
               'reward_post'::text as post_type,
               p.created_at
        FROM posts p
        WHERE p.user_id = p_user_id
          AND p.created_at >= v_start AND p.created_at <= v_end
          AND (p.post_type IS NULL OR p.post_type NOT IN ('gift_celebration'))

        UNION ALL

        -- Reactions received on user's posts
        SELECT r.id::uuid,
               CASE WHEN r.created_at < v_cutoff
                 THEN '❤️ Cảm xúc nhận được: +1,000 CAMLY'
                 ELSE '❤️ Cảm xúc nhận được: +1,000 CAMLY'
               END as content,
               NULL::text, NULL::text, NULL::jsonb,
               'reward_reaction'::text,
               r.created_at
        FROM reactions r
        INNER JOIN posts po ON r.post_id = po.id
        WHERE po.user_id = p_user_id
          AND r.created_at >= v_start AND r.created_at <= v_end

        UNION ALL

        -- Comments received on user's posts
        SELECT c.id::uuid,
               CASE WHEN c.created_at < v_cutoff
                 THEN '💬 Bình luận nhận được: +2,000 CAMLY'
                 ELSE '💬 Bình luận nhận được: +1,000 CAMLY'
               END as content,
               NULL::text, NULL::text, NULL::jsonb,
               'reward_comment'::text,
               c.created_at
        FROM comments c
        INNER JOIN posts po ON c.post_id = po.id
        WHERE po.user_id = p_user_id
          AND c.created_at >= v_start AND c.created_at <= v_end
          AND (c.created_at < v_cutoff OR length(c.content) > 20)

        UNION ALL

        -- Shares received
        SELECT sp.id::uuid,
               CASE WHEN sp.created_at < v_cutoff
                 THEN '🔄 Chia sẻ nhận được: +10,000 CAMLY'
                 ELSE '🔄 Chia sẻ nhận được: +1,000 CAMLY'
               END as content,
               NULL::text, NULL::text, NULL::jsonb,
               'reward_share'::text,
               sp.created_at
        FROM shared_posts sp
        INNER JOIN posts po ON sp.original_post_id = po.id
        WHERE po.user_id = p_user_id
          AND sp.created_at >= v_start AND sp.created_at <= v_end

        UNION ALL

        -- Friendships (user_id side)
        SELECT f.id::uuid,
               '👥 Kết bạn: +10,000 CAMLY' as content,
               NULL::text, NULL::text, NULL::jsonb,
               'reward_friend'::text,
               f.created_at
        FROM friendships f
        WHERE f.user_id = p_user_id
          AND f.status = 'accepted'
          AND f.created_at >= v_start AND f.created_at <= v_end

        UNION ALL

        -- Friendships (friend_id side)
        SELECT f.id::uuid,
               '👥 Kết bạn: +10,000 CAMLY' as content,
               NULL::text, NULL::text, NULL::jsonb,
               'reward_friend'::text,
               f.created_at
        FROM friendships f
        WHERE f.friend_id = p_user_id
          AND f.status = 'accepted'
          AND f.created_at >= v_start AND f.created_at <= v_end

        UNION ALL

        -- Livestreams
        SELECT l.id::uuid,
               '📡 Livestream: +20,000 CAMLY' as content,
               NULL::text, NULL::text, NULL::jsonb,
               'reward_livestream'::text,
               l.started_at as created_at
        FROM livestreams l
        WHERE l.user_id = p_user_id
          AND l.is_eligible = true
          AND l.started_at >= v_start AND l.started_at <= v_end
      )
      SELECT ra.id, ra.content, ra.image_url, ra.video_url, ra.media_urls, ra.post_type, ra.created_at
      FROM reward_activities ra
      ORDER BY ra.created_at DESC;

  END IF;
END;
$function$;

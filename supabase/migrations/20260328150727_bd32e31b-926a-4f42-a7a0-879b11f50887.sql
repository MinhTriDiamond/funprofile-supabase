CREATE OR REPLACE FUNCTION public.get_user_posts_by_period_vn(
  p_user_id uuid,
  p_type text,
  p_date text,
  p_mode text,
  p_date_from text DEFAULT NULL,
  p_date_to text DEFAULT NULL
)
RETURNS TABLE(id uuid, content text, image_url text, video_url text, media_urls jsonb, post_type text, created_at timestamptz)
LANGUAGE plpgsql STABLE
AS $$
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
        COALESCE(NULLIF(TRIM(ls.title), ''), 'Livestream') as content,
        NULL::text as image_url,
        COALESCE(cr.output_url, lr.media_url) as video_url,
        CASE
          WHEN COALESCE(cr.output_url, lr.media_url) IS NOT NULL THEN
            jsonb_build_array(jsonb_build_object('url', COALESCE(cr.output_url, lr.media_url), 'type', 'video', 'thumbnail', lr.thumbnail_url))
          ELSE NULL
        END as media_urls,
        'live'::text as post_type,
        ls.started_at as created_at
      FROM live_sessions ls
      LEFT JOIN LATERAL (
        SELECT r.media_url, r.thumbnail_url FROM live_recordings r
        WHERE r.live_id = ls.id AND r.status = 'ready' ORDER BY r.created_at DESC LIMIT 1
      ) lr ON true
      LEFT JOIN LATERAL (
        SELECT c.output_url FROM chunked_recordings c
        WHERE c.live_session_id = ls.id AND c.status = 'done' ORDER BY c.created_at DESC LIMIT 1
      ) cr ON true
      WHERE ls.host_user_id = p_user_id
        AND ls.status = 'ended'
        AND ls.started_at >= v_start AND ls.started_at <= v_end
      ORDER BY ls.started_at DESC;

  ELSIF p_type = 'rewards' THEN
    RETURN QUERY
      WITH reward_activities AS (
        SELECT p.id,
               CASE WHEN p.created_at < v_cutoff THEN '📝 Đăng bài: +10,000 CAMLY' ELSE '📝 Đăng bài: +5,000 CAMLY' END as content,
               p.image_url, p.video_url, p.media_urls, 'reward_post'::text as post_type, p.created_at
        FROM posts p
        WHERE p.user_id = p_user_id AND p.created_at >= v_start AND p.created_at <= v_end
          AND (p.post_type IS NULL OR p.post_type NOT IN ('gift_celebration'))

        UNION ALL
        SELECT r.id::uuid,
               CASE WHEN r.created_at < v_cutoff THEN '❤️ Cảm xúc nhận được: +1,000 CAMLY' ELSE '❤️ Cảm xúc nhận được: +1,000 CAMLY' END,
               NULL::text, NULL::text, NULL::jsonb, 'reward_reaction'::text, r.created_at
        FROM reactions r INNER JOIN posts po ON r.post_id = po.id
        WHERE po.user_id = p_user_id AND r.created_at >= v_start AND r.created_at <= v_end

        UNION ALL
        SELECT c.id::uuid,
               CASE WHEN c.created_at < v_cutoff THEN '💬 Bình luận nhận được: +2,000 CAMLY' ELSE '💬 Bình luận nhận được: +1,000 CAMLY' END,
               NULL::text, NULL::text, NULL::jsonb, 'reward_comment'::text, c.created_at
        FROM comments c INNER JOIN posts po ON c.post_id = po.id
        WHERE po.user_id = p_user_id AND c.created_at >= v_start AND c.created_at <= v_end
          AND (c.created_at < v_cutoff OR length(c.content) > 20)

        UNION ALL
        SELECT sp.id::uuid,
               CASE WHEN sp.created_at < v_cutoff THEN '🔄 Chia sẻ nhận được: +10,000 CAMLY' ELSE '🔄 Chia sẻ nhận được: +1,000 CAMLY' END,
               NULL::text, NULL::text, NULL::jsonb, 'reward_share'::text, sp.created_at
        FROM shared_posts sp INNER JOIN posts po ON sp.original_post_id = po.id
        WHERE po.user_id = p_user_id AND sp.created_at >= v_start AND sp.created_at <= v_end

        UNION ALL
        SELECT f.id::uuid, '👥 Kết bạn: +10,000 CAMLY', NULL::text, NULL::text, NULL::jsonb, 'reward_friend'::text, f.created_at
        FROM friendships f WHERE f.user_id = p_user_id AND f.status = 'accepted' AND f.created_at >= v_start AND f.created_at <= v_end

        UNION ALL
        SELECT f.id::uuid, '👥 Kết bạn: +10,000 CAMLY', NULL::text, NULL::text, NULL::jsonb, 'reward_friend'::text, f.created_at
        FROM friendships f WHERE f.friend_id = p_user_id AND f.status = 'accepted' AND f.created_at >= v_start AND f.created_at <= v_end

        UNION ALL
        SELECT ls.id::uuid, '📡 Livestream: +20,000 CAMLY', NULL::text, NULL::text, NULL::jsonb, 'reward_livestream'::text, ls.started_at
        FROM live_sessions ls
        WHERE ls.host_user_id = p_user_id AND ls.status = 'ended' AND ls.started_at >= v_start AND ls.started_at <= v_end

        UNION ALL
        SELECT la.id::uuid, '⭐ PPLP Mint: +' || COALESCE(la.mint_amount, 0)::text || ' CAMLY',
               NULL::text, NULL::text, NULL::jsonb, 'reward_mint'::text, la.created_at
        FROM light_actions la
        WHERE la.user_id = p_user_id AND la.created_at >= v_start AND la.created_at <= v_end
          AND la.mint_status = 'minted' AND la.mint_amount > 0
      )
      SELECT ra.id, ra.content, ra.image_url, ra.video_url, ra.media_urls, ra.post_type, ra.created_at
      FROM reward_activities ra
      ORDER BY ra.created_at DESC;
  END IF;
END;
$$;
CREATE OR REPLACE FUNCTION public.get_user_posts_by_period_vn(
  p_user_id uuid,
  p_type text,
  p_date text,
  p_mode text,
  p_date_from text DEFAULT NULL,
  p_date_to text DEFAULT NULL
)
RETURNS TABLE(id uuid, content text, image_url text, video_url text, media_urls jsonb, post_type text, created_at timestamptz)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_start timestamptz;
  v_end   timestamptz;
  v_date  date;
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
        AND (p.video_url IS NULL)
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
        ls.title as content,
        lr.thumbnail_url as image_url,
        COALESCE(cr.output_url, lr.media_url) as video_url,
        CASE
          WHEN COALESCE(cr.output_url, lr.media_url) IS NOT NULL THEN
            jsonb_build_array(
              jsonb_build_object(
                'url', COALESCE(cr.output_url, lr.media_url),
                'type', 'video',
                'poster', lr.thumbnail_url,
                'isLiveReplay', true
              )
            )
          ELSE NULL::jsonb
        END as media_urls,
        'livestream'::text as post_type,
        ls.started_at as created_at
      FROM live_sessions ls
      LEFT JOIN LATERAL (
        SELECT c.output_url
        FROM chunked_recordings c
        WHERE c.live_session_id = ls.id
          AND c.output_url IS NOT NULL
        ORDER BY c.created_at DESC
        LIMIT 1
      ) cr ON true
      LEFT JOIN LATERAL (
        SELECT r.media_url, r.thumbnail_url
        FROM live_recordings r
        WHERE r.live_id = ls.id
        ORDER BY r.created_at DESC
        LIMIT 1
      ) lr ON true
      WHERE ls.host_user_id = p_user_id
        AND ls.started_at >= v_start AND ls.started_at <= v_end
        AND ls.status = 'ended'
      ORDER BY ls.started_at DESC;
  ELSIF p_type = 'rewards' THEN
    RETURN QUERY
      SELECT la.id, la.content_preview as content, NULL::text as image_url, NULL::text as video_url, NULL::jsonb as media_urls, la.action_type as post_type, la.created_at
      FROM light_actions la
      WHERE la.user_id = p_user_id
        AND la.created_at >= v_start AND la.created_at <= v_end
        AND la.is_eligible = true
      ORDER BY la.created_at DESC;
  END IF;
END;
$$;
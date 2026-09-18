
CREATE OR REPLACE FUNCTION public.get_user_posts_by_period_vn(
  p_user_id uuid,
  p_type text,
  p_date text,
  p_mode text,
  p_date_from text DEFAULT NULL,
  p_date_to text DEFAULT NULL
)
RETURNS TABLE(
  id uuid,
  content text,
  image_url text,
  video_url text,
  media_urls jsonb,
  post_type text,
  created_at timestamptz
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_start timestamptz;
  v_end   timestamptz;
  v_date  date;
BEGIN
  -- Custom date range
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
      ORDER BY p.created_at DESC;
  ELSIF p_type = 'photos' THEN
    RETURN QUERY
      SELECT p.id, p.content, p.image_url, p.video_url, p.media_urls, p.post_type, p.created_at
      FROM posts p
      WHERE p.user_id = p_user_id
        AND p.created_at >= v_start AND p.created_at <= v_end
        AND (p.image_url IS NOT NULL OR (p.media_urls IS NOT NULL AND p.media_urls != '[]'::jsonb))
        AND (p.video_url IS NULL)
        AND (p.post_type IS NULL OR p.post_type != 'video')
      ORDER BY p.created_at DESC;
  ELSIF p_type = 'videos' THEN
    RETURN QUERY
      SELECT p.id, p.content, p.image_url, p.video_url, p.media_urls, p.post_type, p.created_at
      FROM posts p
      WHERE p.user_id = p_user_id
        AND p.created_at >= v_start AND p.created_at <= v_end
        AND (p.video_url IS NOT NULL OR p.post_type = 'video')
      ORDER BY p.created_at DESC;
  ELSIF p_type = 'livestreams' THEN
    RETURN QUERY
      SELECT ls.id, ls.title as content, NULL::text as image_url, NULL::text as video_url, NULL::jsonb as media_urls, 'livestream'::text as post_type, ls.started_at as created_at
      FROM livestreams ls
      WHERE ls.user_id = p_user_id
        AND ls.started_at >= v_start AND ls.started_at <= v_end
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

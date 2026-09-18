
-- Fix get_content_stats_grouped_vn: photos (add media_urls, exclude video), videos (exclude live), livestreams (only ended)
CREATE OR REPLACE FUNCTION public.get_content_stats_grouped_vn(
  p_type text,
  p_mode text,
  p_limit integer DEFAULT 30,
  p_offset integer DEFAULT 0
)
RETURNS TABLE(period_label text, count bigint)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_trunc TEXT;
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
      SELECT to_char(date_trunc(v_trunc, rc.created_at AT TIME ZONE 'Asia/Ho_Chi_Minh'), 'YYYY-MM-DD'),
             COALESCE(SUM(rc.amount)::BIGINT, 0)
      FROM reward_claims rc
      GROUP BY 1 ORDER BY 1 DESC
      LIMIT p_limit OFFSET p_offset;

  ELSE
    RAISE EXCEPTION 'Invalid p_type: %', p_type;
  END IF;
END;
$$;

-- Fix get_content_users_by_period_vn: posts (was post_type='normal'), photos (add exclude video)
CREATE OR REPLACE FUNCTION public.get_content_users_by_period_vn(
  p_type text,
  p_date text,
  p_mode text
)
RETURNS TABLE(user_id uuid, username text, display_name text, avatar_url text, post_count bigint, social_links jsonb)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_start timestamptz;
  v_end   timestamptz;
  v_date  date := p_date::date;
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
      SELECT rc.user_id, pr.username, COALESCE(pr.display_name, pr.full_name)::text AS display_name,
             pr.avatar_url, SUM(rc.amount)::bigint AS post_count, pr.social_links::jsonb
      FROM reward_claims rc
      JOIN public_profiles pr ON pr.id = rc.user_id
      WHERE rc.created_at >= v_start AND rc.created_at < v_end
      GROUP BY rc.user_id, pr.username, pr.display_name, pr.full_name, pr.avatar_url, pr.social_links
      ORDER BY post_count DESC;
  END IF;
END;
$$;

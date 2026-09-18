
CREATE OR REPLACE FUNCTION public.get_content_users_by_period_vn(
  p_type text,
  p_date text,
  p_mode text
)
RETURNS TABLE(
  user_id uuid,
  username text,
  display_name text,
  avatar_url text,
  post_count bigint,
  social_links jsonb
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_start timestamptz;
  v_end   timestamptz;
  v_date  date := p_date::date;
BEGIN
  -- Calculate period range in VN timezone
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
        AND p.post_type = 'normal'
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
      GROUP BY p.user_id, pr.username, pr.display_name, pr.full_name, pr.avatar_url, pr.social_links
      ORDER BY post_count DESC;

  ELSIF p_type = 'livestreams' THEN
    RETURN QUERY
      SELECT l.user_id, pr.username, COALESCE(pr.display_name, pr.full_name)::text AS display_name,
             pr.avatar_url, COUNT(*)::bigint AS post_count, pr.social_links::jsonb
      FROM livestreams l
      JOIN public_profiles pr ON pr.id = l.user_id
      WHERE l.started_at >= v_start AND l.started_at < v_end
      GROUP BY l.user_id, pr.username, pr.display_name, pr.full_name, pr.avatar_url, pr.social_links
      ORDER BY post_count DESC;

  ELSIF p_type = 'rewards' THEN
    RETURN QUERY
      SELECT ra.user_id, pr.username, COALESCE(pr.display_name, pr.full_name)::text AS display_name,
             pr.avatar_url, SUM(ra.amount)::bigint AS post_count, pr.social_links::jsonb
      FROM reward_approvals ra
      JOIN public_profiles pr ON pr.id = ra.user_id
      WHERE ra.approved_at >= v_start AND ra.approved_at < v_end
        AND ra.status = 'approved'
      GROUP BY ra.user_id, pr.username, pr.display_name, pr.full_name, pr.avatar_url, pr.social_links
      ORDER BY post_count DESC;
  END IF;
END;
$$;

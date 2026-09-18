
-- 1. Update get_signups_by_date_vn to filter banned users
CREATE OR REPLACE FUNCTION public.get_signups_by_date_vn(p_date text)
RETURNS TABLE(id uuid, username text, full_name text, avatar_url text, created_at timestamptz, social_links json)
LANGUAGE sql STABLE
AS $$
  SELECT p.id, p.username, p.full_name, p.avatar_url, p.created_at, p.social_links::json
  FROM public.profiles p
  WHERE to_char((p.created_at AT TIME ZONE 'Asia/Ho_Chi_Minh')::date, 'YYYY-MM-DD') = p_date
    AND p.is_banned = false
  ORDER BY p.created_at DESC;
$$;

-- 2. Create get_signups_by_range_vn for week/month detail views
CREATE OR REPLACE FUNCTION public.get_signups_by_range_vn(p_start_date text, p_end_date text)
RETURNS TABLE(id uuid, username text, full_name text, avatar_url text, created_at timestamptz, social_links json)
LANGUAGE sql STABLE
AS $$
  SELECT p.id, p.username, p.full_name, p.avatar_url, p.created_at, p.social_links::json
  FROM public.profiles p
  WHERE (p.created_at AT TIME ZONE 'Asia/Ho_Chi_Minh')::date >= p_start_date::date
    AND (p.created_at AT TIME ZONE 'Asia/Ho_Chi_Minh')::date <= p_end_date::date
    AND p.is_banned = false
  ORDER BY p.created_at DESC;
$$;

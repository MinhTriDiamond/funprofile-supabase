
DROP FUNCTION IF EXISTS public.get_signups_by_date_vn(text);

CREATE OR REPLACE FUNCTION public.get_signups_by_date_vn(p_date text)
RETURNS TABLE(id uuid, username text, full_name text, avatar_url text, created_at timestamptz, social_links json)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT p.id, p.username, p.full_name, p.avatar_url, p.created_at, p.social_links::json
  FROM public.profiles p
  WHERE to_char((p.created_at AT TIME ZONE 'Asia/Ho_Chi_Minh')::date, 'YYYY-MM-DD') = p_date
  ORDER BY p.created_at DESC;
$$;

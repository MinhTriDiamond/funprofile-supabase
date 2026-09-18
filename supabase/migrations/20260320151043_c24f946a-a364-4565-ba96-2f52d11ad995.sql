
CREATE OR REPLACE FUNCTION public.get_daily_signups_vn(p_days integer DEFAULT 30)
RETURNS TABLE(signup_date text, new_users bigint)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT 
    to_char((created_at AT TIME ZONE 'Asia/Ho_Chi_Minh')::date, 'YYYY-MM-DD') as signup_date,
    count(*) as new_users
  FROM public.profiles
  WHERE created_at >= (now() AT TIME ZONE 'Asia/Ho_Chi_Minh')::date - (p_days || ' days')::interval
  GROUP BY (created_at AT TIME ZONE 'Asia/Ho_Chi_Minh')::date
  ORDER BY (created_at AT TIME ZONE 'Asia/Ho_Chi_Minh')::date DESC;
$$;

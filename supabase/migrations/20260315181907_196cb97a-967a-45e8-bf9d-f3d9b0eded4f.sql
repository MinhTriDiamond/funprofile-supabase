
CREATE OR REPLACE FUNCTION public.get_gift_day_counts()
RETURNS TABLE(vn_date date, gift_count bigint)
LANGUAGE sql
STABLE
SECURITY INVOKER
AS $$
  SELECT 
    (created_at AT TIME ZONE 'Asia/Ho_Chi_Minh')::date AS vn_date,
    COUNT(*) AS gift_count
  FROM public.posts
  WHERE post_type = 'gift_celebration'
    AND created_at >= (now() AT TIME ZONE 'Asia/Ho_Chi_Minh' - interval '7 days')::date::timestamp AT TIME ZONE 'Asia/Ho_Chi_Minh'
  GROUP BY vn_date
  ORDER BY vn_date DESC;
$$;


DROP FUNCTION IF EXISTS public.get_signups_grouped_vn;

CREATE OR REPLACE FUNCTION public.get_signups_grouped_vn(p_mode text, p_limit integer, p_offset integer)
RETURNS TABLE(period_label text, new_users bigint)
LANGUAGE sql STABLE
AS $$
  SELECT 
    CASE p_mode
      WHEN 'week' THEN 
        to_char(date_trunc('week', (created_at AT TIME ZONE 'Asia/Ho_Chi_Minh')::date), 'YYYY-MM-DD')
      WHEN 'month' THEN 
        to_char(date_trunc('month', (created_at AT TIME ZONE 'Asia/Ho_Chi_Minh')::date), 'YYYY-MM-DD')
      ELSE 
        to_char((created_at AT TIME ZONE 'Asia/Ho_Chi_Minh')::date, 'YYYY-MM-DD')
    END as period_label,
    count(*) as new_users
  FROM public.profiles
  WHERE is_banned = false
  GROUP BY period_label
  ORDER BY period_label DESC
  LIMIT p_limit
  OFFSET p_offset;
$$;

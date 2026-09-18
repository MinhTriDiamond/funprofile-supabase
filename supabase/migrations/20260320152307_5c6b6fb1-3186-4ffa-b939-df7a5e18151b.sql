
-- RPC: get signups grouped by day/week/month with offset+limit
CREATE OR REPLACE FUNCTION public.get_signups_grouped_vn(
  p_mode text DEFAULT 'day',
  p_limit integer DEFAULT 30,
  p_offset integer DEFAULT 0
)
RETURNS TABLE(period_label text, new_users bigint)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
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
  GROUP BY period_label
  ORDER BY period_label DESC
  LIMIT p_limit
  OFFSET p_offset;
$$;

-- RPC: get user details for a specific date (VN timezone)
CREATE OR REPLACE FUNCTION public.get_signups_by_date_vn(p_date text)
RETURNS TABLE(id uuid, username text, full_name text, avatar_url text, created_at timestamptz)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT p.id, p.username, p.full_name, p.avatar_url, p.created_at
  FROM public.profiles p
  WHERE to_char((p.created_at AT TIME ZONE 'Asia/Ho_Chi_Minh')::date, 'YYYY-MM-DD') = p_date
  ORDER BY p.created_at DESC;
$$;

-- Enable realtime for profiles table
ALTER PUBLICATION supabase_realtime ADD TABLE public.profiles;

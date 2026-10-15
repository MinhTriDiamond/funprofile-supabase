-- Light community cache (2026-10-15): tong diem anh sang theo user, lam moi 5 phut.
CREATE TABLE IF NOT EXISTS public.user_light_totals (
  user_id uuid PRIMARY KEY,
  total_score numeric NOT NULL DEFAULT 0,
  recent_score numeric NOT NULL DEFAULT 0,
  prev_score numeric NOT NULL DEFAULT 0,
  refreshed_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.user_light_totals ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.refresh_user_light_totals()
RETURNS integer
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $fn$
DECLARE n integer;
BEGIN
  DELETE FROM public.user_light_totals;
  INSERT INTO public.user_light_totals (user_id, total_score, recent_score, prev_score, refreshed_at)
  SELECT la.user_id,
    COALESCE(SUM(la.light_score), 0),
    COALESCE(SUM(CASE WHEN la.created_at >= now() - INTERVAL '7 days' THEN la.light_score ELSE 0 END), 0),
    COALESCE(SUM(CASE WHEN la.created_at >= now() - INTERVAL '14 days' AND la.created_at < now() - INTERVAL '7 days' THEN la.light_score ELSE 0 END), 0),
    now()
  FROM public.light_actions la
  GROUP BY la.user_id;
  GET DIAGNOSTICS n = ROW_COUNT;
  RETURN n;
END;
$fn$;

SELECT public.refresh_user_light_totals() AS light_users;

CREATE OR REPLACE FUNCTION public.get_light_community(p_limit integer DEFAULT 10)
 RETURNS TABLE(user_id uuid, username text, display_name text, avatar_url text, light_level text, light_emoji text, trend text, trend_emoji text)
 LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $fn$
BEGIN
  RETURN QUERY
  SELECT
    p.id AS user_id,
    p.username,
    p.display_name,
    p.avatar_url,
    CASE
      WHEN us.total_score >= 81 THEN 'Light Architect'
      WHEN us.total_score >= 61 THEN 'Light Guardian'
      WHEN us.total_score >= 41 THEN 'Light Builder'
      WHEN us.total_score >= 21 THEN 'Light Sprout'
      ELSE 'Light Seed'
    END AS light_level,
    CASE
      WHEN us.total_score >= 81 THEN '🏛️'
      WHEN us.total_score >= 61 THEN '🛡️'
      WHEN us.total_score >= 41 THEN '🔨'
      WHEN us.total_score >= 21 THEN '🌱'
      ELSE '🌰'
    END AS light_emoji,
    CASE
      WHEN us.recent_score > us.prev_score * 1.1 THEN 'Growing'
      WHEN us.prev_score > 0 AND us.recent_score < us.prev_score * 0.9 THEN 'Reflecting'
      ELSE 'Stable'
    END AS trend,
    CASE
      WHEN us.recent_score > us.prev_score * 1.1 THEN '📈'
      WHEN us.prev_score > 0 AND us.recent_score < us.prev_score * 0.9 THEN '🔄'
      ELSE '🌿'
    END AS trend_emoji
  FROM public.user_light_totals us
  JOIN public.profiles p ON p.id = us.user_id
  WHERE p.is_banned = false
  ORDER BY us.total_score DESC
  LIMIT p_limit;
END;
$fn$;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'user-light-totals-refresh') THEN
    PERFORM cron.unschedule('user-light-totals-refresh');
  END IF;
END $$;
SELECT cron.schedule('user-light-totals-refresh', '*/5 * * * *', 'SELECT public.refresh_user_light_totals()') AS light_job_id;

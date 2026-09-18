DROP FUNCTION IF EXISTS public.get_light_community(integer);

CREATE OR REPLACE FUNCTION public.get_light_community(p_limit integer DEFAULT 10)
 RETURNS TABLE(user_id uuid, username text, display_name text, avatar_url text, light_level text, light_emoji text, trend text, trend_emoji text)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  RETURN QUERY
  WITH user_scores AS (
    SELECT 
      la.user_id AS uid,
      COALESCE(SUM(la.light_score), 0) AS total_score
    FROM light_actions la
    JOIN profiles p ON p.id = la.user_id
    WHERE p.is_banned = false
    GROUP BY la.user_id
  ),
  recent_activity AS (
    SELECT 
      la.user_id AS uid,
      COALESCE(SUM(CASE WHEN la.created_at >= now() - INTERVAL '7 days' THEN la.light_score ELSE 0 END), 0) AS recent_score,
      COALESCE(SUM(CASE WHEN la.created_at >= now() - INTERVAL '14 days' AND la.created_at < now() - INTERVAL '7 days' THEN la.light_score ELSE 0 END), 0) AS prev_score
    FROM light_actions la
    JOIN profiles p ON p.id = la.user_id
    WHERE p.is_banned = false
      AND la.created_at >= now() - INTERVAL '14 days'
    GROUP BY la.user_id
  )
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
      WHEN ra.recent_score > ra.prev_score * 1.1 THEN 'Growing'
      WHEN ra.prev_score > 0 AND ra.recent_score < ra.prev_score * 0.9 THEN 'Reflecting'
      ELSE 'Stable'
    END AS trend,
    CASE 
      WHEN ra.recent_score > ra.prev_score * 1.1 THEN '📈'
      WHEN ra.prev_score > 0 AND ra.recent_score < ra.prev_score * 0.9 THEN '🔄'
      ELSE '🌿'
    END AS trend_emoji
  FROM user_scores us
  JOIN profiles p ON p.id = us.uid
  LEFT JOIN recent_activity ra ON ra.uid = us.uid
  ORDER BY us.total_score DESC
  LIMIT p_limit;
END;
$function$;
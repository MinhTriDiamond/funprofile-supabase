CREATE OR REPLACE FUNCTION public.find_similar_profiles_for_impersonation(p_profile_id uuid, p_min_similarity real DEFAULT 0.55, p_limit integer DEFAULT 25)
 RETURNS TABLE(id uuid, username text, display_name text, full_name text, avatar_url text, avatar_phash text, created_at timestamp with time zone, name_similarity real)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_name text;
  v_created timestamptz;
BEGIN
  SELECT lower(coalesce(pr.display_name, pr.full_name, pr.username)), pr.created_at
    INTO v_name, v_created
    FROM public.profiles pr WHERE pr.id = p_profile_id;
  IF v_name IS NULL THEN RETURN; END IF;

  RETURN QUERY
  SELECT p.id, p.username, p.display_name, p.full_name, p.avatar_url, p.avatar_phash, p.created_at,
         similarity(lower(coalesce(p.display_name, p.full_name, p.username)), v_name) AS name_similarity
  FROM public.profiles p
  WHERE p.id <> p_profile_id
    AND p.created_at < v_created
    AND p.is_banned = false
    AND similarity(lower(coalesce(p.display_name, p.full_name, p.username)), v_name) >= p_min_similarity
  ORDER BY name_similarity DESC
  LIMIT p_limit;
END;
$function$;
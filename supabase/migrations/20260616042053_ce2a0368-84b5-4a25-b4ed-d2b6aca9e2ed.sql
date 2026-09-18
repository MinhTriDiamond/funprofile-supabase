
CREATE OR REPLACE FUNCTION public.find_similar_profiles_for_impersonation(
  p_profile_id uuid,
  p_min_similarity real DEFAULT 0.55,
  p_limit int DEFAULT 25
)
RETURNS TABLE (
  id uuid,
  username text,
  display_name text,
  full_name text,
  avatar_url text,
  avatar_phash text,
  created_at timestamptz,
  name_similarity real
)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_name text;
  v_created timestamptz;
BEGIN
  SELECT lower(coalesce(display_name, full_name, username)), created_at
    INTO v_name, v_created
    FROM public.profiles WHERE id = p_profile_id;
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
$$;

REVOKE ALL ON FUNCTION public.find_similar_profiles_for_impersonation(uuid, real, int) FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.find_similar_profiles_for_impersonation(uuid, real, int) TO service_role;

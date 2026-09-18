
CREATE OR REPLACE FUNCTION public.fp_backfill_eligible_profiles(
  p_limit int DEFAULT 50,
  p_include_banned boolean DEFAULT false,
  p_include_test boolean DEFAULT false,
  p_include_unverified boolean DEFAULT false
)
RETURNS TABLE (
  id uuid,
  username text,
  display_name text,
  profile_email text,
  auth_email text,
  is_banned boolean,
  identity_is_test boolean,
  email_confirmed_at timestamptz,
  created_at timestamptz
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    p.id,
    p.username,
    p.display_name,
    p.email AS profile_email,
    u.email::text AS auth_email,
    p.is_banned,
    p.identity_is_test,
    u.email_confirmed_at,
    p.created_at
  FROM public.profiles p
  JOIN auth.users u ON u.id = p.id
  WHERE (p_include_banned OR p.is_banned IS NOT TRUE)
    AND (p_include_test OR p.identity_is_test IS NOT TRUE)
    AND (p_include_unverified OR u.email_confirmed_at IS NOT NULL)
  ORDER BY p.created_at ASC
  LIMIT GREATEST(p_limit, 0);
$$;

CREATE OR REPLACE FUNCTION public.fp_backfill_eligible_count(
  p_include_banned boolean DEFAULT false,
  p_include_test boolean DEFAULT false,
  p_include_unverified boolean DEFAULT false
)
RETURNS bigint
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT count(*)::bigint
  FROM public.profiles p
  JOIN auth.users u ON u.id = p.id
  WHERE (p_include_banned OR p.is_banned IS NOT TRUE)
    AND (p_include_test OR p.identity_is_test IS NOT TRUE)
    AND (p_include_unverified OR u.email_confirmed_at IS NOT NULL);
$$;

-- Khóa quyền: chỉ service_role gọi được (edge function dùng service key).
REVOKE ALL ON FUNCTION public.fp_backfill_eligible_profiles(int, boolean, boolean, boolean) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.fp_backfill_eligible_count(boolean, boolean, boolean) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.fp_backfill_eligible_profiles(int, boolean, boolean, boolean) TO service_role;
GRANT EXECUTE ON FUNCTION public.fp_backfill_eligible_count(boolean, boolean, boolean) TO service_role;

-- Lookup 1 user theo id (dùng cho run_one) — cũng join auth.users
CREATE OR REPLACE FUNCTION public.fp_backfill_lookup_one(p_user_id uuid)
RETURNS TABLE (
  id uuid,
  username text,
  display_name text,
  profile_email text,
  auth_email text,
  is_banned boolean,
  identity_is_test boolean,
  email_confirmed_at timestamptz
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    p.id, p.username, p.display_name, p.email,
    u.email::text, p.is_banned, p.identity_is_test, u.email_confirmed_at
  FROM public.profiles p
  JOIN auth.users u ON u.id = p.id
  WHERE p.id = p_user_id
  LIMIT 1;
$$;
REVOKE ALL ON FUNCTION public.fp_backfill_lookup_one(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.fp_backfill_lookup_one(uuid) TO service_role;

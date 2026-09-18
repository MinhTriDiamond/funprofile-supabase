
CREATE OR REPLACE FUNCTION public.get_user_emails_for_admin(p_admin_id UUID)
RETURNS TABLE(user_id UUID, email TEXT)
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path = 'public'
AS $function$
BEGIN
  -- Only admins can call this function
  IF NOT public.has_role(p_admin_id, 'admin') THEN
    RAISE EXCEPTION 'Only admins can access user emails';
  END IF;

  RETURN QUERY
  SELECT au.id AS user_id, au.email::TEXT AS email
  FROM auth.users au;
END;
$function$;

CREATE OR REPLACE FUNCTION public.check_login_method(p_email text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid;
  v_has_password boolean := false;
  v_signup_method text := 'email';
BEGIN
  IF p_email IS NULL OR length(trim(p_email)) = 0 THEN
    RETURN jsonb_build_object('exists', false);
  END IF;

  SELECT id INTO v_user_id
  FROM auth.users
  WHERE lower(email) = lower(trim(p_email))
  LIMIT 1;

  IF v_user_id IS NULL THEN
    RETURN jsonb_build_object('exists', false);
  END IF;

  SELECT COALESCE(has_password, false), COALESCE(signup_method, 'email')
    INTO v_has_password, v_signup_method
    FROM public.profiles WHERE id = v_user_id;

  RETURN jsonb_build_object(
    'exists', true,
    'has_password', v_has_password,
    'signup_method', v_signup_method
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.check_login_method(text) TO anon, authenticated;
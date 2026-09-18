REVOKE EXECUTE ON FUNCTION public.check_login_method(text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.check_login_method(text) TO service_role;
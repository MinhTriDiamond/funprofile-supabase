-- Snapshot guard A1 đợt 2 (2026-08-15) — 2 function đọc chỉ dùng ở dashboard admin.
-- Nguyên tắc bất biến: actor = auth.uid(); không tin tham số do client truyền.
-- Cả 2 function CHỈ SELECT (không INSERT/UPDATE/DELETE).

-- get_banned_user_claims()  [không overload]
--   v_actor uuid := auth.uid();
--   IF v_actor IS NULL THEN RAISE EXCEPTION 'Authentication required'; END IF;
--   IF NOT public.has_role(v_actor, 'admin') THEN
--     RAISE EXCEPTION 'Only admins can access banned user claims'; END IF;
--   RETURN QUERY SELECT ... FROM public.reward_claims rc JOIN public.profiles p ...
--     WHERE p.is_banned = true GROUP BY rc.user_id;

-- get_user_mint_stats(search_query text)  [không overload]
--   Thân giữ nguyên (SELECT thuần); siết ở lớp quyền EXECUTE.

-- ACL sau migration (pg_proc.proacl) — không có PUBLIC (=X/), anon=false:
-- {postgres=X/postgres,authenticated=X/postgres,service_role=X/postgres,sandbox_exec_...=X/postgres}
REVOKE ALL ON FUNCTION public.get_banned_user_claims() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.get_user_mint_stats(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_banned_user_claims() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_user_mint_stats(text) TO authenticated, service_role;

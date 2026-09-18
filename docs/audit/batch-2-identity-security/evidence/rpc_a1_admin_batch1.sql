-- Snapshot guard A1 đợt 1 (2026-08-14) — trích phần guard của 5 function admin.
-- Nguyên tắc bất biến: actor = auth.uid(); p_admin_id/admin_id do client truyền
-- CHỈ dùng để đối chiếu trong audit_logs.details.claimed_admin_id.

-- ban_user_permanently(p_admin_id uuid, p_user_id uuid, p_reason text)
--   v_actor uuid := auth.uid();
--   IF v_actor IS NULL THEN RAISE EXCEPTION 'Authentication required'; END IF;
--   IF NOT public.has_role(v_actor, 'admin') THEN RAISE EXCEPTION 'Only admins can ban users'; END IF;
--   INSERT INTO audit_logs (...) VALUES (v_actor, 'BAN_USER_PERMANENT', p_user_id, p_reason,
--     jsonb_build_object('claimed_admin_id', p_admin_id));

-- unban_user(p_admin_id uuid, p_user_id uuid, p_reason text)
--   v_actor uuid := auth.uid();
--   IF v_actor IS NULL THEN RAISE EXCEPTION 'Authentication required'; END IF;
--   IF NOT public.has_role(v_actor, 'admin') THEN RAISE EXCEPTION 'Only admins can unban users'; END IF;

-- batch_ban_ghost_users(user_ids uuid[], admin_id uuid)
--   v_actor uuid := auth.uid();
--   IF NOT public.has_role(v_actor, 'admin') THEN RAISE EXCEPTION 'Unauthorized: admin role required'; END IF;

-- get_user_emails_for_admin(p_admin_id uuid)
--   v_actor uuid := auth.uid();
--   IF NOT public.has_role(v_actor, 'admin') THEN RAISE EXCEPTION 'Only admins can access user emails'; END IF;

-- get_qualified_reward_users(p_admin_id uuid)
--   v_actor uuid := auth.uid();
--   IF NOT public.has_role(v_actor, 'admin') THEN RAISE EXCEPTION 'Only admins can access qualified users list'; END IF;

-- ACL sau migration (pg_proc.proacl) — không có PUBLIC (=X/), anon=false:
-- {postgres=X/postgres,authenticated=X/postgres,service_role=X/postgres,sandbox_exec_...=X/postgres}
REVOKE ALL ON FUNCTION public.ban_user_permanently(uuid, uuid, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.unban_user(uuid, uuid, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.batch_ban_ghost_users(uuid[], uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.get_user_emails_for_admin(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.get_qualified_reward_users(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.ban_user_permanently(uuid, uuid, text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.unban_user(uuid, uuid, text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.batch_ban_ghost_users(uuid[], uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_user_emails_for_admin(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_qualified_reward_users(uuid) TO authenticated, service_role;

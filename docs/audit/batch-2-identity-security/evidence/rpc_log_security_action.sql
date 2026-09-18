-- Snapshot pg_get_functiondef sau fix A2(c) — 2026-08-14
-- Guard: chủ thể log phải = auth.uid(), trừ admin. Ghi kèm actor_id thật vào details.
CREATE OR REPLACE FUNCTION public.log_security_action(p_user_id uuid, p_action text, p_details jsonb DEFAULT NULL::jsonb)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_actor uuid := auth.uid();
BEGIN
  IF v_actor IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;

  IF p_user_id IS NULL THEN
    RAISE EXCEPTION 'p_user_id is required';
  END IF;

  -- SECURITY: chỉ admin được ghi log thay người khác
  IF p_user_id <> v_actor AND NOT public.has_role(v_actor, 'admin') THEN
    RAISE EXCEPTION 'Forbidden: cannot log security action for another user';
  END IF;

  -- Only allow known sensitive actions
  IF p_action NOT IN ('password_set', 'password_changed', 'wallet_link_succeeded', 'wallet_link_failed', 'email_link_verified') THEN
    RAISE EXCEPTION 'Unknown security action: %', p_action;
  END IF;

  INSERT INTO public.account_activity_logs (user_id, action, details)
  VALUES (
    p_user_id,
    p_action,
    COALESCE(p_details, '{}'::jsonb) || jsonb_build_object('actor_id', v_actor)
  );
END;
$function$

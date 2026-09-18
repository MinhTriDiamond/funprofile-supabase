CREATE OR REPLACE FUNCTION public.fun_profile_toggle_outbox_producer(p_enabled boolean)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'FORBIDDEN_NOT_ADMIN';
  END IF;

  INSERT INTO public.app_settings(key, value, updated_at)
  VALUES ('federation_outbox_producer_enabled', to_jsonb(p_enabled)::text, now())
  ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = now();

  INSERT INTO public.audit_logs(admin_id, action, details)
  VALUES (
    auth.uid(),
    'federation_outbox_producer_toggle',
    jsonb_build_object(
      'enabled', p_enabled,
      'target_type', 'app_settings',
      'target_key', 'federation_outbox_producer_enabled'
    )
  );

  RETURN jsonb_build_object('ok', true, 'enabled', p_enabled);
END;
$function$;

CREATE OR REPLACE FUNCTION public.fun_profile_toggle_outbox_publisher(p_enabled boolean)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'FORBIDDEN_NOT_ADMIN';
  END IF;

  INSERT INTO public.app_settings(key, value, updated_at)
  VALUES ('federation_outbox_publisher_enabled', to_jsonb(p_enabled)::text, now())
  ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = now();

  INSERT INTO public.audit_logs(admin_id, action, details)
  VALUES (
    auth.uid(),
    'federation_outbox_publisher_toggle',
    jsonb_build_object(
      'enabled', p_enabled,
      'target_type', 'app_settings',
      'target_key', 'federation_outbox_publisher_enabled'
    )
  );

  RETURN jsonb_build_object('ok', true, 'enabled', p_enabled);
END;
$function$;
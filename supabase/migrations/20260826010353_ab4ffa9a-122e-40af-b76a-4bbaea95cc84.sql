CREATE OR REPLACE FUNCTION public.fn_btc_shadow_log_priority_notify()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.priority_account_flag AND NOT NEW.is_match THEN
    -- actor_id = chính admin nhận (pattern hệ thống đang dùng cho cảnh báo admin;
    -- actor_id NOT NULL + FK profiles nên không dùng được uuid rỗng).
    INSERT INTO public.notifications (user_id, actor_id, type, read, metadata)
    SELECT ur.user_id, ur.user_id, 'btc_shadow_priority_alert', false,
           jsonb_build_object(
             'address', NEW.address,
             'call_site', NEW.call_site,
             'legacy_user_id', NEW.legacy_user_id,
             'resolver_user_id', NEW.resolver_user_id,
             'shadow_log_id', NEW.id
           )
    FROM public.user_roles ur
    JOIN public.profiles p ON p.id = ur.user_id
    WHERE ur.role = 'admin'
      AND NOT EXISTS (
        SELECT 1 FROM public.notifications n
        WHERE n.user_id = ur.user_id
          AND n.type = 'btc_shadow_priority_alert'
          AND n.created_at > now() - interval '24 hours'
      );
  END IF;
  RETURN NEW;
END;
$$;
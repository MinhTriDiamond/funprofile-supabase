-- 1) Dedup dữ liệu cũ: giữ dòng sớm nhất mỗi (user_id, ngày UTC)
WITH ranked AS (
  SELECT id,
         row_number() OVER (
           PARTITION BY user_id, (created_at AT TIME ZONE 'UTC')::date
           ORDER BY created_at ASC, id ASC
         ) AS rn
  FROM public.notifications
  WHERE type = 'btc_shadow_priority_alert'
)
DELETE FROM public.notifications n
USING ranked r
WHERE n.id = r.id AND r.rn > 1;

-- 2) UNIQUE INDEX partial theo ngày UTC
CREATE UNIQUE INDEX IF NOT EXISTS uq_notif_btc_shadow_alert_daily
  ON public.notifications (user_id, type, ((created_at AT TIME ZONE 'UTC')::date))
  WHERE type = 'btc_shadow_priority_alert';

-- 3) Trigger: bỏ NOT EXISTS, dùng ON CONFLICT DO NOTHING (atomic, không rò trong cùng statement)
CREATE OR REPLACE FUNCTION public.fn_btc_shadow_log_priority_notify()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF NEW.priority_account_flag AND NOT NEW.is_match THEN
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
    ON CONFLICT (user_id, type, ((created_at AT TIME ZONE 'UTC')::date))
      WHERE type = 'btc_shadow_priority_alert'
    DO NOTHING;
  END IF;
  RETURN NEW;
END;
$function$;
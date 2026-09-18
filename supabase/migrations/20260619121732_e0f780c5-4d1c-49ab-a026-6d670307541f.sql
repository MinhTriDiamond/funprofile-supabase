
-- ============================================================
-- Federation Outbox — Production Rollout R1
-- ============================================================

-- 1) State: Producer ON, R1 event flags
UPDATE public.app_settings
SET value = to_jsonb(true)
WHERE key = 'federation_outbox_producer_enabled';

INSERT INTO public.app_settings(key, value)
VALUES ('federation_outbox_producer_enabled', to_jsonb(true))
ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value;

INSERT INTO public.app_settings(key, value)
VALUES ('federation_outbox_event_flags', jsonb_build_object(
  'PROFILE_UPDATED', true,
  'TRUST_UPDATED',   true,
  'DID_PROMOTED',    false,
  'SBT_ISSUED',      false,
  'SBT_REVOKED',     false,
  'WALLET_LINKED',   false,
  'WALLET_UNLINKED', false
))
ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value;

-- 2) RPC: read current event flags (admin only)
CREATE OR REPLACE FUNCTION public.fun_profile_get_outbox_event_flags()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE v jsonb;
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'forbidden';
  END IF;
  SELECT value INTO v FROM public.app_settings
    WHERE key = 'federation_outbox_event_flags';
  RETURN COALESCE(v, '{}'::jsonb);
END;
$$;

REVOKE ALL ON FUNCTION public.fun_profile_get_outbox_event_flags() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.fun_profile_get_outbox_event_flags() TO authenticated;

-- 3) RPC: set one event flag (admin only) + audit
CREATE OR REPLACE FUNCTION public.fun_profile_set_outbox_event_flag(
  p_event_type text,
  p_enabled boolean
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_allowed text[] := ARRAY['PROFILE_UPDATED','TRUST_UPDATED','DID_PROMOTED',
                            'SBT_ISSUED','SBT_REVOKED','WALLET_LINKED','WALLET_UNLINKED'];
  v_current jsonb;
  v_next jsonb;
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'forbidden';
  END IF;
  IF NOT (p_event_type = ANY(v_allowed)) THEN
    RAISE EXCEPTION 'unsupported event_type: %', p_event_type;
  END IF;

  SELECT value INTO v_current FROM public.app_settings
    WHERE key = 'federation_outbox_event_flags';
  v_current := COALESCE(v_current, '{}'::jsonb);
  v_next := v_current || jsonb_build_object(p_event_type, p_enabled);

  INSERT INTO public.app_settings(key, value)
  VALUES ('federation_outbox_event_flags', v_next)
  ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value;

  INSERT INTO public.audit_logs(admin_id, action, details)
  VALUES (auth.uid(), 'federation_outbox_event_flag_set',
          jsonb_build_object('event_type', p_event_type, 'enabled', p_enabled));

  RETURN jsonb_build_object('ok', true, 'flags', v_next);
END;
$$;

REVOKE ALL ON FUNCTION public.fun_profile_set_outbox_event_flag(text, boolean) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.fun_profile_set_outbox_event_flag(text, boolean) TO authenticated;

-- 4) RPC: apply rollout preset (admin only) + audit
CREATE OR REPLACE FUNCTION public.fun_profile_apply_outbox_rollout_preset(
  p_preset text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE v_next jsonb;
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'forbidden';
  END IF;

  v_next := CASE upper(p_preset)
    WHEN 'R1' THEN jsonb_build_object(
      'PROFILE_UPDATED', true, 'TRUST_UPDATED', true,
      'DID_PROMOTED', false, 'SBT_ISSUED', false, 'SBT_REVOKED', false,
      'WALLET_LINKED', false, 'WALLET_UNLINKED', false)
    WHEN 'R2' THEN jsonb_build_object(
      'PROFILE_UPDATED', true, 'TRUST_UPDATED', true, 'DID_PROMOTED', true,
      'SBT_ISSUED', false, 'SBT_REVOKED', false,
      'WALLET_LINKED', false, 'WALLET_UNLINKED', false)
    WHEN 'R3' THEN jsonb_build_object(
      'PROFILE_UPDATED', true, 'TRUST_UPDATED', true, 'DID_PROMOTED', true,
      'SBT_ISSUED', true, 'SBT_REVOKED', true,
      'WALLET_LINKED', true, 'WALLET_UNLINKED', true)
    WHEN 'OFF_ALL' THEN jsonb_build_object(
      'PROFILE_UPDATED', false, 'TRUST_UPDATED', false, 'DID_PROMOTED', false,
      'SBT_ISSUED', false, 'SBT_REVOKED', false,
      'WALLET_LINKED', false, 'WALLET_UNLINKED', false)
    ELSE NULL
  END;

  IF v_next IS NULL THEN
    RAISE EXCEPTION 'unsupported preset: % (allowed: R1, R2, R3, OFF_ALL)', p_preset;
  END IF;

  INSERT INTO public.app_settings(key, value)
  VALUES ('federation_outbox_event_flags', v_next)
  ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value;

  INSERT INTO public.audit_logs(admin_id, action, details)
  VALUES (auth.uid(), 'federation_outbox_rollout_preset_applied',
          jsonb_build_object('preset', upper(p_preset), 'flags', v_next));

  RETURN jsonb_build_object('ok', true, 'preset', upper(p_preset), 'flags', v_next);
END;
$$;

REVOKE ALL ON FUNCTION public.fun_profile_apply_outbox_rollout_preset(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.fun_profile_apply_outbox_rollout_preset(text) TO authenticated;

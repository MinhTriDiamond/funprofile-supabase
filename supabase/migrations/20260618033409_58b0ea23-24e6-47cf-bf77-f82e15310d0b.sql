CREATE OR REPLACE FUNCTION public._emit_fp_event(p_event_type text, p_aggregate_id text, p_payload jsonb, p_force boolean DEFAULT false)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
DECLARE
  v_enabled boolean;
  v_flags jsonb;
  v_event_on boolean;
  v_trace text;
  v_idem text;
  v_payload_canonical text;
  v_id uuid;
BEGIN
  IF NOT p_force THEN
    SELECT (value)::boolean INTO v_enabled
      FROM public.app_settings WHERE key = 'federation_outbox_producer_enabled';
    IF COALESCE(v_enabled, false) = false THEN
      RETURN NULL;
    END IF;

    SELECT value INTO v_flags
      FROM public.app_settings WHERE key = 'federation_outbox_event_flags';
    v_event_on := COALESCE((v_flags ->> p_event_type)::boolean, true);
    IF v_event_on = false THEN
      RETURN NULL;
    END IF;
  END IF;

  IF p_aggregate_id IS NULL OR length(p_aggregate_id) = 0 THEN
    RETURN NULL;
  END IF;

  v_payload_canonical := COALESCE(p_payload::text, '{}');
  v_idem := 'fun-profile:' || p_event_type || ':' || p_aggregate_id || ':' ||
            encode(extensions.digest(v_payload_canonical, 'sha256'), 'hex');
  v_trace := 'fp-' || replace(gen_random_uuid()::text, '-', '');

  INSERT INTO public.fun_profile_event_outbox(
    event_type, aggregate_type, aggregate_id, payload,
    status, attempts, trace_id, idempotency_key, next_attempt_at
  ) VALUES (
    p_event_type, 'platform_user', p_aggregate_id,
    COALESCE(p_payload, '{}'::jsonb),
    'pending', 0, v_trace, v_idem, now()
  )
  ON CONFLICT (idempotency_key) DO NOTHING
  RETURNING id INTO v_id;

  RETURN v_id;
END;
$function$;
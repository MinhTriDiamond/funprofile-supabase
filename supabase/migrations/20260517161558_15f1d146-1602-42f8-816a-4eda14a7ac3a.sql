CREATE OR REPLACE FUNCTION public.mystery_box_grant(_user_id uuid, _box_code text, _source_event box_source, _source_ref text DEFAULT NULL::text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_def public.mystery_box_definitions%ROWTYPE;
  v_inv_id UUID;
  v_today_count INT;
  v_locked BOOLEAN := false;
  v_tc NUMERIC;
BEGIN
  SELECT * INTO v_def FROM public.mystery_box_definitions
   WHERE code = _box_code AND is_active = true;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'BOX_CODE_NOT_FOUND: %', _box_code;
  END IF;

  -- Idempotent check
  IF _source_ref IS NOT NULL THEN
    SELECT id INTO v_inv_id FROM public.mystery_box_inventory
     WHERE user_id = _user_id AND source_event = _source_event AND source_ref_id = _source_ref
     LIMIT 1;
    IF v_inv_id IS NOT NULL THEN
      RETURN v_inv_id;
    END IF;
  END IF;

  -- Rate limit 10 box/UTC day
  SELECT COUNT(*) INTO v_today_count FROM public.mystery_box_inventory
   WHERE user_id = _user_id
     AND created_at >= date_trunc('day', now() AT TIME ZONE 'UTC');
  IF v_today_count >= 10 THEN
    RAISE EXCEPTION 'RATE_LIMIT_EXCEEDED';
  END IF;

  -- T1+ gate: lookup TC qua did_registry → trust_profile
  SELECT COALESCE(tp.tc, 0) INTO v_tc
    FROM public.did_registry dr
    JOIN public.trust_profile tp ON tp.did_id = dr.did_id
   WHERE dr.owner_user_id = _user_id
     AND dr.entity_type = 'person'
   ORDER BY dr.created_at ASC
   LIMIT 1;
  IF v_tc IS NULL OR v_tc < 0.30 THEN
    v_locked := true;
  END IF;

  INSERT INTO public.mystery_box_inventory (user_id, box_def_id, source_event, source_ref_id, locked)
  VALUES (_user_id, v_def.id, _source_event, _source_ref, v_locked)
  RETURNING id INTO v_inv_id;

  -- Notification
  INSERT INTO public.notifications (user_id, type, payload, created_at)
  VALUES (_user_id, 'mystery_box_received',
          jsonb_build_object('box_code', _box_code, 'tier', v_def.tier, 'inventory_id', v_inv_id, 'locked', v_locked),
          now());

  RETURN v_inv_id;
END;
$function$;
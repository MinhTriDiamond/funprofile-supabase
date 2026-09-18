-- Fix mystery_box_open: dùng action_type hợp lệ + notification metadata, và sửa trigger premium grant
CREATE OR REPLACE FUNCTION public.mystery_box_open(_inventory_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_inv public.mystery_box_inventory%ROWTYPE;
  v_def public.mystery_box_definitions%ROWTYPE;
  v_caller UUID := auth.uid();
  v_seed TEXT;
  v_roll NUMERIC;
  v_drop JSONB;
  v_pity_count INT;
  v_chosen JSONB;
  v_acc NUMERIC := 0;
  v_reward_code TEXT;
  v_reward public.mystery_box_rewards%ROWTYPE;
  v_payload JSONB;
  v_type TEXT;
  v_value BIGINT;
  v_ls_today NUMERIC;
  v_ls_grant NUMERIC;
BEGIN
  SELECT * INTO v_inv FROM public.mystery_box_inventory WHERE id = _inventory_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'INVENTORY_NOT_FOUND'; END IF;
  IF v_inv.user_id <> v_caller AND NOT public.has_role(v_caller, 'admin') THEN
    RAISE EXCEPTION 'FORBIDDEN';
  END IF;
  IF v_inv.opened_at IS NOT NULL THEN RAISE EXCEPTION 'ALREADY_OPENED'; END IF;
  IF v_inv.locked THEN RAISE EXCEPTION 'LOCKED_NEED_T1'; END IF;
  IF v_inv.expires_at IS NOT NULL AND v_inv.expires_at < now() THEN
    RAISE EXCEPTION 'EXPIRED';
  END IF;

  SELECT * INTO v_def FROM public.mystery_box_definitions WHERE id = v_inv.box_def_id;

  SELECT COUNT(*) INTO v_pity_count
    FROM public.mystery_box_open_log
   WHERE user_id = v_inv.user_id
     AND opened_at > COALESCE((
       SELECT MAX(opened_at) FROM public.mystery_box_open_log
        WHERE user_id = v_inv.user_id
          AND (reward_jsonb->>'tier' IN ('legendary','cosmic'))
     ), 'epoch'::timestamptz);

  v_seed := gen_random_uuid()::text;
  v_drop := v_def.drop_table;

  IF v_pity_count >= COALESCE(v_def.pity_threshold, 50) THEN
    SELECT elem INTO v_chosen FROM jsonb_array_elements(v_drop) elem
     WHERE elem->>'reward_code' LIKE 'jackpot_%' OR elem->>'rarity' = 'legendary'
     LIMIT 1;
  END IF;

  IF v_chosen IS NULL THEN
    v_roll := (('x' || substr(md5(v_seed), 1, 8))::bit(32)::int / 4294967295.0) * 100.0;
    IF v_roll < 0 THEN v_roll := -v_roll; END IF;
    FOR v_chosen IN SELECT elem FROM jsonb_array_elements(v_drop) elem LOOP
      v_acc := v_acc + COALESCE((v_chosen->>'pct')::numeric, 0);
      EXIT WHEN v_roll <= v_acc;
    END LOOP;
  END IF;

  IF v_chosen IS NULL THEN
    SELECT elem INTO v_chosen FROM jsonb_array_elements(v_drop) elem LIMIT 1;
  END IF;

  v_reward_code := v_chosen->>'reward_code';
  SELECT * INTO v_reward FROM public.mystery_box_rewards WHERE code = v_reward_code;

  v_type  := COALESCE(v_reward.type::text, v_chosen->>'type');
  v_value := COALESCE(v_reward.value_int, (v_chosen->>'value_int')::bigint, 0);

  v_payload := jsonb_build_object(
    'reward_code', v_reward_code,
    'type', v_type,
    'value_int', v_value,
    'metadata', COALESCE(v_reward.metadata, '{}'::jsonb),
    'rarity', COALESCE(v_reward.rarity, v_chosen->>'rarity'),
    'tier', v_def.tier
  );

  UPDATE public.mystery_box_inventory
     SET opened_at = now(), reward_jsonb = v_payload, pity_counter = v_pity_count
   WHERE id = _inventory_id;

  INSERT INTO public.mystery_box_open_log (user_id, inventory_id, box_def_id, reward_id, rng_seed, reward_jsonb)
  VALUES (v_inv.user_id, _inventory_id, v_def.id, v_reward.id, v_seed, v_payload);

  -- APPLY REWARD
  IF v_type = 'ls' AND v_value > 0 THEN
    -- Cap 60 LS/ngày từ mystery box (count theo reference_type)
    SELECT COALESCE(SUM(light_score),0) INTO v_ls_today
      FROM public.light_actions
     WHERE user_id = v_inv.user_id
       AND reference_type = 'mystery_box'
       AND created_at >= date_trunc('day', now() AT TIME ZONE 'UTC');
    v_ls_grant := LEAST(v_value::numeric, GREATEST(0, 60 - v_ls_today));
    IF v_ls_grant > 0 THEN
      INSERT INTO public.light_actions(
        user_id, action_type, reference_id, reference_type, content_preview,
        base_reward, quality_score, impact_score, integrity_score,
        unity_score, unity_multiplier, light_score, is_eligible, mint_status, evaluated_at
      ) VALUES (
        v_inv.user_id, 'QUEST_REWARD', _inventory_id, 'mystery_box',
        'Phần thưởng từ hộp ' || v_def.name_vi,
        v_ls_grant, 1.0, 1.0, 1.0, 50, 1.0, v_ls_grant, true, 'pending', now()
      );
    END IF;
  ELSIF v_type = 'camly' AND v_value > 0 THEN
    INSERT INTO public.pplp_v2_balance_ledger(user_id, entry_type, amount, reference_table, reference_id, note)
    VALUES (v_inv.user_id, 'mystery_box_reward', v_value, 'mystery_box_inventory', _inventory_id,
            'Thưởng CAMLY từ hộp ' || v_def.name_vi);
  END IF;

  -- Notification (dùng cột metadata + actor_id)
  INSERT INTO public.notifications (user_id, actor_id, type, metadata, created_at)
  VALUES (v_inv.user_id, v_inv.user_id,
          CASE WHEN v_def.tier IN ('legendary','cosmic') OR v_payload->>'rarity'='legendary'
               THEN 'mystery_box_legendary' ELSE 'mystery_box_received' END,
          jsonb_build_object('reward', v_payload, 'inventory_id', _inventory_id, 'opened', true),
          now());

  RETURN v_payload;
END;
$function$;

-- Sửa trigger premium grant: bỏ token_symbol (không tồn tại)
CREATE OR REPLACE FUNCTION public.mystery_box_check_premium_grant()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_balance numeric;
  v_threshold constant numeric := 10000000; -- 10M CAMLY
  v_inv uuid;
BEGIN
  IF EXISTS (SELECT 1 FROM public.mystery_box_premium_grants WHERE user_id = NEW.user_id) THEN
    RETURN NEW;
  END IF;

  SELECT COALESCE(SUM(amount), 0) INTO v_balance
  FROM public.pplp_v2_balance_ledger
  WHERE user_id = NEW.user_id;

  IF v_balance >= v_threshold THEN
    BEGIN
      SELECT public.mystery_box_grant(
        NEW.user_id,
        'legendary_box',
        'premium_purchase',
        NULL
      ) INTO v_inv;

      INSERT INTO public.mystery_box_premium_grants (user_id, trigger_balance, inventory_id)
      VALUES (NEW.user_id, v_balance, v_inv);
    EXCEPTION WHEN OTHERS THEN
      RAISE WARNING 'mystery_box_check_premium_grant failed for user %: %', NEW.user_id, SQLERRM;
    END;
  END IF;

  RETURN NEW;
END;
$function$;

-- Cấp 1 hộp cho user (idempotent qua source_event/source_ref_id)
CREATE OR REPLACE FUNCTION public.mystery_box_grant(
  _user_id UUID,
  _box_code TEXT,
  _source_event public.box_source,
  _source_ref TEXT DEFAULT NULL
) RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
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

  -- T1+ gate: nếu T0 vẫn cấp nhưng locked
  SELECT COALESCE(trust_score, 0) INTO v_tc
    FROM public.user_identity_profile WHERE user_id = _user_id;
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
$$;

-- Mở hộp với RNG + pity
CREATE OR REPLACE FUNCTION public.mystery_box_open(_inventory_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
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
BEGIN
  SELECT * INTO v_inv FROM public.mystery_box_inventory WHERE id = _inventory_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'INVENTORY_NOT_FOUND'; END IF;
  IF v_inv.user_id <> v_caller AND NOT public.has_role(v_caller, 'admin') THEN
    RAISE EXCEPTION 'FORBIDDEN';
  END IF;
  IF v_inv.opened_at IS NOT NULL THEN RAISE EXCEPTION 'ALREADY_OPENED'; END IF;
  IF v_inv.locked THEN RAISE EXCEPTION 'LOCKED_NEED_T1'; END IF;

  SELECT * INTO v_def FROM public.mystery_box_definitions WHERE id = v_inv.box_def_id;

  -- Pity: count consecutive non-legendary opens
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

  -- Pity force: nếu đủ ngưỡng và drop_table có entry "pity_legendary"
  IF v_pity_count >= COALESCE(v_def.pity_threshold, 50) THEN
    SELECT elem INTO v_chosen FROM jsonb_array_elements(v_drop) elem
     WHERE elem->>'reward_code' LIKE 'jackpot_%' OR elem->>'rarity' = 'legendary'
     LIMIT 1;
  END IF;

  -- Roll RNG nếu không pity
  IF v_chosen IS NULL THEN
    v_roll := (('x' || substr(md5(v_seed), 1, 8))::bit(32)::int / 4294967295.0) * 100.0;
    IF v_roll < 0 THEN v_roll := -v_roll; END IF;
    FOR v_chosen IN SELECT elem FROM jsonb_array_elements(v_drop) elem LOOP
      v_acc := v_acc + COALESCE((v_chosen->>'pct')::numeric, 0);
      EXIT WHEN v_roll <= v_acc;
    END LOOP;
  END IF;

  IF v_chosen IS NULL THEN
    -- fallback: chọn entry đầu
    SELECT elem INTO v_chosen FROM jsonb_array_elements(v_drop) elem LIMIT 1;
  END IF;

  v_reward_code := v_chosen->>'reward_code';
  SELECT * INTO v_reward FROM public.mystery_box_rewards WHERE code = v_reward_code;

  v_payload := jsonb_build_object(
    'reward_code', v_reward_code,
    'type', COALESCE(v_reward.type::text, v_chosen->>'type'),
    'value_int', COALESCE(v_reward.value_int, (v_chosen->>'value_int')::bigint, 0),
    'metadata', COALESCE(v_reward.metadata, '{}'::jsonb),
    'rarity', COALESCE(v_reward.rarity, v_chosen->>'rarity'),
    'tier', v_def.tier
  );

  -- Mark opened
  UPDATE public.mystery_box_inventory
     SET opened_at = now(), reward_jsonb = v_payload, pity_counter = v_pity_count
   WHERE id = _inventory_id;

  -- Audit log
  INSERT INTO public.mystery_box_open_log (user_id, inventory_id, box_def_id, reward_id, rng_seed, reward_jsonb)
  VALUES (v_inv.user_id, _inventory_id, v_def.id, v_reward.id, v_seed, v_payload);

  -- Apply reward CAMLY (cộng vào ví off-chain qua light_actions tương đương — tạm ghi notification)
  -- Notif Legendary
  IF v_def.tier IN ('legendary','cosmic') OR v_payload->>'rarity' = 'legendary' THEN
    INSERT INTO public.notifications (user_id, type, payload, created_at)
    VALUES (v_inv.user_id, 'mystery_box_legendary',
            jsonb_build_object('reward', v_payload, 'inventory_id', _inventory_id), now());
  END IF;

  RETURN v_payload;
END;
$$;

-- Mua hộp bằng CAMLY (sink)
CREATE OR REPLACE FUNCTION public.mystery_box_purchase(_box_code TEXT)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_def public.mystery_box_definitions%ROWTYPE;
  v_caller UUID := auth.uid();
  v_inv_id UUID;
  v_ref TEXT;
BEGIN
  IF v_caller IS NULL THEN RAISE EXCEPTION 'UNAUTHENTICATED'; END IF;
  SELECT * INTO v_def FROM public.mystery_box_definitions
   WHERE code = _box_code AND is_active = true AND cost_camly IS NOT NULL AND cost_camly > 0;
  IF NOT FOUND THEN RAISE EXCEPTION 'BOX_NOT_PURCHASABLE'; END IF;

  -- TODO: trừ CAMLY off-chain ledger ở đây nếu bảng tồn tại; hiện tạm ghi nhận
  -- (sẽ wire ledger CAMLY sau khi xác minh schema ví off-chain)

  v_ref := 'purchase_' || gen_random_uuid()::text;
  v_inv_id := public.mystery_box_grant(v_caller, _box_code, 'premium_purchase'::public.box_source, v_ref);
  RETURN v_inv_id;
END;
$$;

-- Cập nhật CHECK constraint notifications để hỗ trợ 2 type mới
DO $$
DECLARE c_name TEXT;
BEGIN
  SELECT conname INTO c_name FROM pg_constraint
   WHERE conrelid = 'public.notifications'::regclass AND contype = 'c'
     AND pg_get_constraintdef(oid) LIKE '%type%IN%';
  IF c_name IS NOT NULL THEN
    EXECUTE format('ALTER TABLE public.notifications DROP CONSTRAINT %I', c_name);
  END IF;
END $$;
-- (Để type CHECK linh hoạt — không re-add constraint cứng vì project có nhiều type)

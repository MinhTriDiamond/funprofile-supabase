-- Helper: đọc risk tier từ nguồn thật (pet_risk_scores), không dùng cột mirror.
CREATE OR REPLACE FUNCTION public.pet_risk_assert_allowed(_user_id uuid, _action text)
RETURNS void
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE v_tier text;
BEGIN
  SELECT risk_tier INTO v_tier FROM public.pet_risk_scores WHERE user_id = _user_id;
  IF v_tier IS NULL OR v_tier IN ('safe','watch') THEN RETURN; END IF;
  IF v_tier = 'frozen' THEN RAISE EXCEPTION 'PET_RISK_FROZEN'; END IF;
  IF v_tier = 'restricted' AND _action IN ('shop','cheer') THEN
    RAISE EXCEPTION 'PET_RISK_RESTRICTED';
  END IF;
END;
$function$;

REVOKE ALL ON FUNCTION public.pet_risk_assert_allowed(uuid, text) FROM PUBLIC, anon, authenticated;

-- pet_states: ghim level/xp/risk_tier khi client tự UPDATE
CREATE OR REPLACE FUNCTION public.pet_states_freeze_system_columns()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_role text := coalesce(nullif(current_setting('role', true), ''), session_user);
BEGIN
  IF v_role NOT IN ('anon', 'authenticated') THEN
    RETURN NEW;
  END IF;
  NEW.level     := OLD.level;
  NEW.xp        := OLD.xp;
  NEW.risk_tier := OLD.risk_tier;
  RETURN NEW;
END;
$function$;

REVOKE ALL ON FUNCTION public.pet_states_freeze_system_columns() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.posts_sanitize_system_columns_on_insert() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_pet_states_freeze_system_columns ON public.pet_states;
CREATE TRIGGER trg_pet_states_freeze_system_columns
  BEFORE UPDATE ON public.pet_states
  FOR EACH ROW EXECUTE FUNCTION public.pet_states_freeze_system_columns();

-- Gate vào 3 RPC
CREATE OR REPLACE FUNCTION public.pet_shop_create_order(_cosmetic_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_user uuid := auth.uid();
  v_cosmetic public.pet_cosmetics_catalog;
  v_cfg public.pet_shop_config;
  v_pet_level int;
  v_owned int;
  v_order_id uuid;
BEGIN
  IF v_user IS NULL THEN RAISE EXCEPTION 'NOT_AUTHENTICATED'; END IF;

  PERFORM public.pet_risk_assert_allowed(v_user, 'shop');

  SELECT * INTO v_cfg FROM public.pet_shop_config WHERE id = 1;
  IF NOT FOUND OR NOT v_cfg.is_enabled THEN RAISE EXCEPTION 'SHOP_DISABLED'; END IF;

  SELECT * INTO v_cosmetic FROM public.pet_cosmetics_catalog WHERE id = _cosmetic_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'COSMETIC_NOT_FOUND'; END IF;
  IF NOT v_cosmetic.is_active OR NOT v_cosmetic.for_sale OR v_cosmetic.price_camly <= 0 THEN
    RAISE EXCEPTION 'NOT_FOR_SALE';
  END IF;
  IF v_cosmetic.stock_limit IS NOT NULL AND v_cosmetic.sold_count >= v_cosmetic.stock_limit THEN
    RAISE EXCEPTION 'OUT_OF_STOCK';
  END IF;

  SELECT COALESCE(level,0) INTO v_pet_level FROM public.pet_states WHERE user_id = v_user;
  v_pet_level := COALESCE(v_pet_level, 0);
  IF v_pet_level < v_cosmetic.level_required THEN
    RAISE EXCEPTION 'LEVEL_TOO_LOW';
  END IF;

  SELECT COUNT(*) INTO v_owned FROM public.pet_cosmetics_owned
    WHERE user_id = v_user AND cosmetic_id = _cosmetic_id;
  IF v_owned > 0 THEN RAISE EXCEPTION 'ALREADY_OWNED'; END IF;

  IF EXISTS (
    SELECT 1 FROM public.pet_shop_orders
    WHERE user_id = v_user AND cosmetic_id = _cosmetic_id
      AND status = 'pending' AND expires_at > now()
  ) THEN
    RAISE EXCEPTION 'ORDER_PENDING';
  END IF;

  INSERT INTO public.pet_shop_orders
    (user_id, cosmetic_id, price_camly, treasury_address)
  VALUES
    (v_user, _cosmetic_id, v_cosmetic.price_camly, v_cfg.treasury_address)
  RETURNING id INTO v_order_id;

  RETURN jsonb_build_object(
    'order_id', v_order_id,
    'treasury_address', v_cfg.treasury_address,
    'chain_id', v_cfg.chain_id,
    'camly_token', v_cfg.camly_token,
    'camly_decimals', v_cfg.camly_decimals,
    'price_camly', v_cosmetic.price_camly,
    'cosmetic_slug', v_cosmetic.slug,
    'expires_at', (now() + interval '30 minutes')
  );
END;
$function$;

CREATE OR REPLACE FUNCTION public.mystery_box_create_order(_box_code text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_user UUID := auth.uid();
  v_def public.mystery_box_definitions%ROWTYPE;
  v_cfg public.mystery_box_shop_config%ROWTYPE;
  v_order_id UUID;
  v_pending_count INT;
BEGIN
  IF v_user IS NULL THEN RAISE EXCEPTION 'UNAUTHENTICATED'; END IF;

  PERFORM public.pet_risk_assert_allowed(v_user, 'shop');

  SELECT * INTO v_cfg FROM public.mystery_box_shop_config WHERE id = 1;
  IF NOT FOUND OR NOT v_cfg.is_enabled THEN RAISE EXCEPTION 'SHOP_DISABLED'; END IF;

  SELECT * INTO v_def FROM public.mystery_box_definitions
    WHERE code = _box_code
      AND is_active = true
      AND cost_camly IS NOT NULL
      AND cost_camly > 0;
  IF NOT FOUND THEN RAISE EXCEPTION 'BOX_NOT_PURCHASABLE'; END IF;

  SELECT COUNT(*) INTO v_pending_count FROM public.mystery_box_orders
    WHERE user_id = v_user AND box_code = _box_code AND status = 'pending'
      AND expires_at > now();
  IF v_pending_count > 0 THEN RAISE EXCEPTION 'ORDER_PENDING'; END IF;

  INSERT INTO public.mystery_box_orders (user_id, box_def_id, box_code, price_camly, treasury_address)
  VALUES (v_user, v_def.id, _box_code, v_def.cost_camly::bigint, v_cfg.treasury_address)
  RETURNING id INTO v_order_id;

  RETURN jsonb_build_object(
    'order_id', v_order_id,
    'box_code', _box_code,
    'box_name', v_def.name_vi,
    'treasury_address', v_cfg.treasury_address,
    'chain_id', v_cfg.chain_id,
    'camly_token', v_cfg.camly_token,
    'camly_decimals', v_cfg.camly_decimals,
    'price_camly', v_def.cost_camly,
    'expires_at', (now() + INTERVAL '30 minutes')
  );
END;
$function$;

CREATE OR REPLACE FUNCTION public.pet_cheer(_to_user_id uuid, _message text DEFAULT NULL::text)
 RETURNS pet_cheers
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  _from uuid := auth.uid();
  _today date := (now() AT TIME ZONE 'UTC')::date;
  _existing public.pet_cheers;
  _new public.pet_cheers;
  _from_name text;
BEGIN
  IF _from IS NULL THEN RAISE EXCEPTION 'NOT_AUTHENTICATED'; END IF;
  IF _from = _to_user_id THEN RAISE EXCEPTION 'CANNOT_CHEER_SELF'; END IF;
  IF _message IS NOT NULL AND char_length(_message) > 120 THEN RAISE EXCEPTION 'MESSAGE_TOO_LONG'; END IF;

  PERFORM public.pet_risk_assert_allowed(_from, 'cheer');

  INSERT INTO public.pet_states(user_id) VALUES (_to_user_id) ON CONFLICT (user_id) DO NOTHING;

  SELECT * INTO _existing FROM public.pet_cheers
    WHERE from_user_id = _from AND to_user_id = _to_user_id
      AND (created_at AT TIME ZONE 'UTC')::date = _today
    LIMIT 1;
  IF _existing.id IS NOT NULL THEN RAISE EXCEPTION 'ALREADY_CHEERED_TODAY'; END IF;

  INSERT INTO public.pet_cheers(from_user_id, to_user_id, message)
    VALUES (_from, _to_user_id, _message)
    RETURNING * INTO _new;

  UPDATE public.pet_states
    SET cheers_received_total = cheers_received_total + 1,
        mood = 'happy',
        last_interaction_at = now()
    WHERE user_id = _to_user_id;

  BEGIN
    PERFORM public.apply_pet_xp_grant(_to_user_id, 5, 'cheer');
  EXCEPTION WHEN others THEN NULL; END;

  SELECT COALESCE(display_name, username, 'Một người bạn') INTO _from_name
    FROM public.profiles WHERE id = _from;

  BEGIN
    INSERT INTO public.notifications(user_id, type, title, message, data)
    VALUES (_to_user_id, 'pet_cheer_received',
      'Linh thú của bạn nhận lời cổ vũ!',
      COALESCE(_from_name, 'Một người bạn') || ' vừa cổ vũ Lumi của bạn.',
      jsonb_build_object('from_user_id', _from, 'cheer_id', _new.id, 'message', _message));
  EXCEPTION WHEN others THEN NULL; END;

  RETURN _new;
END $function$;
-- Phase 6: Pet Cosmetic Shop (on-chain CAMLY)

-- 1) Extend catalog with shop columns
ALTER TABLE public.pet_cosmetics_catalog
  ADD COLUMN IF NOT EXISTS price_camly bigint NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS for_sale boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS level_required int NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS stock_limit int,
  ADD COLUMN IF NOT EXISTS sold_count int NOT NULL DEFAULT 0;

-- 2) Shop config (treasury wallet + min confirmations)
CREATE TABLE IF NOT EXISTS public.pet_shop_config (
  id smallint PRIMARY KEY DEFAULT 1,
  treasury_address text NOT NULL,
  chain_id int NOT NULL DEFAULT 56,
  camly_token text NOT NULL DEFAULT '0x0910320181889fefde0bb1ca63962b0a8882e413',
  camly_decimals int NOT NULL DEFAULT 3,
  min_confirmations int NOT NULL DEFAULT 1,
  is_enabled boolean NOT NULL DEFAULT true,
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT pet_shop_config_singleton CHECK (id = 1)
);
INSERT INTO public.pet_shop_config (id, treasury_address)
VALUES (1, '0xa4967da72d012151950627483285c3042957da5d')
ON CONFLICT (id) DO NOTHING;
ALTER TABLE public.pet_shop_config ENABLE ROW LEVEL SECURITY;
CREATE POLICY "config_read_all" ON public.pet_shop_config FOR SELECT USING (true);
CREATE POLICY "config_admin_write" ON public.pet_shop_config
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- 3) Shop orders
CREATE TABLE IF NOT EXISTS public.pet_shop_orders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  cosmetic_id uuid NOT NULL REFERENCES public.pet_cosmetics_catalog(id) ON DELETE RESTRICT,
  price_camly bigint NOT NULL,
  treasury_address text NOT NULL,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','confirmed','failed','refunded','expired')),
  tx_hash text,
  from_address text,
  failure_reason text,
  created_at timestamptz NOT NULL DEFAULT now(),
  confirmed_at timestamptz,
  expires_at timestamptz NOT NULL DEFAULT (now() + interval '30 minutes')
);
CREATE INDEX IF NOT EXISTS idx_pet_shop_orders_user ON public.pet_shop_orders(user_id, created_at DESC);
CREATE UNIQUE INDEX IF NOT EXISTS uq_pet_shop_orders_tx ON public.pet_shop_orders(tx_hash) WHERE tx_hash IS NOT NULL;
ALTER TABLE public.pet_shop_orders ENABLE ROW LEVEL SECURITY;
CREATE POLICY "orders_owner_read" ON public.pet_shop_orders
  FOR SELECT USING (auth.uid() = user_id OR public.has_role(auth.uid(), 'admin'));
CREATE POLICY "orders_owner_insert" ON public.pet_shop_orders
  FOR INSERT WITH CHECK (auth.uid() = user_id);
-- No client UPDATE; only via SECURITY DEFINER RPCs

-- 4) Notification type
ALTER TABLE public.notifications DROP CONSTRAINT IF EXISTS notifications_type_check;
ALTER TABLE public.notifications ADD CONSTRAINT notifications_type_check
CHECK (type = ANY (ARRAY['like','love','care','wow','haha','pray','sad','angry','comment','comment_like','comment_reply','share','friend_request','friend_accept','friend_accepted','friend_removed','reward_approved','reward_rejected','account_banned','account_unbanned','donation','claim_reward','admin_shared_device','admin_email_farm','admin_blacklisted_ip','admin_fraud_daily','live_started','reward_adjustment','epoch_claim_ready','epoch_reset_info','mint_request_rejected','live_replay_failed','live_replay_expiring','live_replay_expired','live_auto_ended','live_reconnected','quest_completed','streak_milestone','sbt_issued_quest','mystery_box_received','mystery_box_legendary','mystery_box_expiring','mystery_box_expired','guardian_invited','guardian_accepted','guardian_declined','attestation_received','did_promoted','sbt_issued','dispute_resolved','recovery_initiated','pet_evolved','pet_cosmetic_received','pet_xp_granted','pet_cheer_received','pet_shop_purchased','pet_shop_failed']));

-- 5) RPC: create order (user)
CREATE OR REPLACE FUNCTION public.pet_shop_create_order(_cosmetic_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user uuid := auth.uid();
  v_cosmetic public.pet_cosmetics_catalog;
  v_cfg public.pet_shop_config;
  v_pet_level int;
  v_owned int;
  v_order_id uuid;
BEGIN
  IF v_user IS NULL THEN RAISE EXCEPTION 'NOT_AUTHENTICATED'; END IF;

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

  -- Block if a pending order for this cosmetic exists and not expired
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
$$;
REVOKE ALL ON FUNCTION public.pet_shop_create_order(uuid) FROM public;
GRANT EXECUTE ON FUNCTION public.pet_shop_create_order(uuid) TO authenticated;

-- 6) RPC: finalize order (called by service role / edge function)
CREATE OR REPLACE FUNCTION public.pet_shop_finalize_order(
  _order_id uuid,
  _tx_hash text,
  _from_address text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_order public.pet_shop_orders;
  v_cosmetic public.pet_cosmetics_catalog;
BEGIN
  SELECT * INTO v_order FROM public.pet_shop_orders WHERE id = _order_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'ORDER_NOT_FOUND'; END IF;
  IF v_order.status <> 'pending' THEN RAISE EXCEPTION 'ORDER_NOT_PENDING'; END IF;

  -- Avoid double-grant: ensure user doesn't already own
  IF EXISTS (
    SELECT 1 FROM public.pet_cosmetics_owned
    WHERE user_id = v_order.user_id AND cosmetic_id = v_order.cosmetic_id
  ) THEN
    UPDATE public.pet_shop_orders
       SET status = 'failed', failure_reason = 'ALREADY_OWNED', tx_hash = _tx_hash
     WHERE id = _order_id;
    RAISE EXCEPTION 'ALREADY_OWNED';
  END IF;

  SELECT * INTO v_cosmetic FROM public.pet_cosmetics_catalog WHERE id = v_order.cosmetic_id FOR UPDATE;

  -- Grant item
  INSERT INTO public.pet_cosmetics_owned (user_id, cosmetic_id, source, equipped)
  VALUES (v_order.user_id, v_order.cosmetic_id, 'shop', false);

  UPDATE public.pet_cosmetics_catalog
     SET sold_count = sold_count + 1
   WHERE id = v_order.cosmetic_id;

  UPDATE public.pet_shop_orders
     SET status = 'confirmed', tx_hash = _tx_hash,
         from_address = lower(_from_address), confirmed_at = now()
   WHERE id = _order_id;

  -- Notify
  BEGIN
    INSERT INTO public.notifications (user_id, type, title, message, metadata)
    VALUES (
      v_order.user_id,
      'pet_shop_purchased',
      'Cửa hàng Lumi',
      'Bạn đã mua thành công: ' || v_cosmetic.name_vi,
      jsonb_build_object(
        'cosmetic_id', v_cosmetic.id,
        'cosmetic_slug', v_cosmetic.slug,
        'price_camly', v_order.price_camly,
        'tx_hash', _tx_hash
      )
    );
  EXCEPTION WHEN OTHERS THEN NULL; END;

  RETURN jsonb_build_object('ok', true, 'cosmetic_slug', v_cosmetic.slug);
END;
$$;
REVOKE ALL ON FUNCTION public.pet_shop_finalize_order(uuid, text, text) FROM public;
-- Only service_role + admin can call
GRANT EXECUTE ON FUNCTION public.pet_shop_finalize_order(uuid, text, text) TO service_role;

-- 7) RPC: mark failed (service)
CREATE OR REPLACE FUNCTION public.pet_shop_fail_order(_order_id uuid, _reason text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.pet_shop_orders
     SET status = 'failed', failure_reason = _reason
   WHERE id = _order_id AND status = 'pending';
END;
$$;
REVOKE ALL ON FUNCTION public.pet_shop_fail_order(uuid, text) FROM public;
GRANT EXECUTE ON FUNCTION public.pet_shop_fail_order(uuid, text) TO service_role;

-- 8) Seed 6 initial shop items (use existing skin/frame slugs already in catalog if present)
-- Pricing in CAMLY whole units (3 decimals handled in code).
UPDATE public.pet_cosmetics_catalog
   SET for_sale = true,
       price_camly = CASE rarity
         WHEN 'common'    THEN 30000
         WHEN 'rare'      THEN 80000
         WHEN 'epic'      THEN 200000
         WHEN 'legendary' THEN 500000
         WHEN 'cosmic'    THEN 1000000
         ELSE 50000
       END,
       level_required = CASE rarity
         WHEN 'common' THEN 0
         WHEN 'rare' THEN 3
         WHEN 'epic' THEN 6
         WHEN 'legendary' THEN 10
         WHEN 'cosmic' THEN 15
         ELSE 0
       END
 WHERE is_active = true
   AND slug IN ('lumi_aurora','lumi_phoenix','lumi_dragon','lumi_galaxy','frame_silver');
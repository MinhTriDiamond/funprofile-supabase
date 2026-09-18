
-- Mystery Box on-chain purchase flow
CREATE TABLE IF NOT EXISTS public.mystery_box_shop_config (
  id INT PRIMARY KEY DEFAULT 1,
  treasury_address TEXT NOT NULL,
  chain_id INT NOT NULL DEFAULT 56,
  camly_token TEXT NOT NULL,
  camly_decimals INT NOT NULL DEFAULT 3,
  min_confirmations INT NOT NULL DEFAULT 1,
  is_enabled BOOLEAN NOT NULL DEFAULT true,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT shop_singleton CHECK (id = 1)
);

INSERT INTO public.mystery_box_shop_config (id, treasury_address, chain_id, camly_token, camly_decimals, min_confirmations, is_enabled)
VALUES (1, '0xa4967da72d012151950627483285c3042957da5d', 56, '0x0910320181889fefde0bb1ca63962b0a8882e413', 3, 1, true)
ON CONFLICT (id) DO NOTHING;

ALTER TABLE public.mystery_box_shop_config ENABLE ROW LEVEL SECURITY;

CREATE POLICY "shop_config_public_read"
  ON public.mystery_box_shop_config FOR SELECT
  USING (true);

CREATE POLICY "shop_config_admin_write"
  ON public.mystery_box_shop_config FOR ALL
  USING (has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

CREATE TABLE IF NOT EXISTS public.mystery_box_orders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  box_def_id UUID NOT NULL REFERENCES public.mystery_box_definitions(id) ON DELETE RESTRICT,
  box_code TEXT NOT NULL,
  price_camly BIGINT NOT NULL,
  treasury_address TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending','confirmed','failed','expired','refunded')),
  tx_hash TEXT,
  from_address TEXT,
  failure_reason TEXT,
  inventory_id UUID REFERENCES public.mystery_box_inventory(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  confirmed_at TIMESTAMPTZ,
  expires_at TIMESTAMPTZ NOT NULL DEFAULT now() + INTERVAL '30 minutes'
);

CREATE INDEX IF NOT EXISTS idx_mb_orders_user ON public.mystery_box_orders(user_id, created_at DESC);
CREATE UNIQUE INDEX IF NOT EXISTS uq_mb_orders_tx ON public.mystery_box_orders(tx_hash) WHERE tx_hash IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS uq_mb_orders_one_pending
  ON public.mystery_box_orders(user_id, box_code) WHERE status = 'pending';

ALTER TABLE public.mystery_box_orders ENABLE ROW LEVEL SECURITY;

CREATE POLICY "mb_orders_owner_read"
  ON public.mystery_box_orders FOR SELECT
  USING (auth.uid() = user_id OR has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "mb_orders_owner_insert"
  ON public.mystery_box_orders FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "mb_orders_admin_all"
  ON public.mystery_box_orders FOR ALL
  USING (has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

-- RPC: create order
CREATE OR REPLACE FUNCTION public.mystery_box_create_order(_box_code TEXT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_user UUID := auth.uid();
  v_def public.mystery_box_definitions%ROWTYPE;
  v_cfg public.mystery_box_shop_config%ROWTYPE;
  v_order_id UUID;
  v_pending_count INT;
BEGIN
  IF v_user IS NULL THEN RAISE EXCEPTION 'UNAUTHENTICATED'; END IF;

  SELECT * INTO v_cfg FROM public.mystery_box_shop_config WHERE id = 1;
  IF NOT FOUND OR NOT v_cfg.is_enabled THEN RAISE EXCEPTION 'SHOP_DISABLED'; END IF;

  SELECT * INTO v_def FROM public.mystery_box_definitions
    WHERE code = _box_code
      AND is_active = true
      AND cost_camly IS NOT NULL
      AND cost_camly > 0;
  IF NOT FOUND THEN RAISE EXCEPTION 'BOX_NOT_PURCHASABLE'; END IF;

  -- Prevent duplicate pending
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
$$;

GRANT EXECUTE ON FUNCTION public.mystery_box_create_order(TEXT) TO authenticated;

-- RPC: finalize order (called by edge function with service role)
CREATE OR REPLACE FUNCTION public.mystery_box_finalize_order(
  _order_id UUID,
  _tx_hash TEXT,
  _from_address TEXT
) RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_order public.mystery_box_orders%ROWTYPE;
  v_inv_id UUID;
BEGIN
  SELECT * INTO v_order FROM public.mystery_box_orders WHERE id = _order_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'ORDER_NOT_FOUND'; END IF;
  IF v_order.status <> 'pending' THEN
    RAISE EXCEPTION 'ORDER_NOT_PENDING: %', v_order.status;
  END IF;

  -- Grant the box
  v_inv_id := public.mystery_box_grant(
    v_order.user_id,
    v_order.box_code,
    'premium_purchase'::public.box_source,
    'order_' || _order_id::text
  );

  UPDATE public.mystery_box_orders
     SET status = 'confirmed',
         tx_hash = _tx_hash,
         from_address = LOWER(_from_address),
         confirmed_at = now(),
         inventory_id = v_inv_id
   WHERE id = _order_id;

  RETURN jsonb_build_object('ok', true, 'inventory_id', v_inv_id);
END;
$$;

GRANT EXECUTE ON FUNCTION public.mystery_box_finalize_order(UUID, TEXT, TEXT) TO service_role;

-- RPC: fail order
CREATE OR REPLACE FUNCTION public.mystery_box_fail_order(
  _order_id UUID,
  _reason TEXT
) RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  UPDATE public.mystery_box_orders
     SET status = CASE WHEN _reason = 'EXPIRED' THEN 'expired' ELSE 'failed' END,
         failure_reason = _reason
   WHERE id = _order_id AND status = 'pending';
END;
$$;

GRANT EXECUTE ON FUNCTION public.mystery_box_fail_order(UUID, TEXT) TO service_role;

-- Deprecate old free-purchase RPC
CREATE OR REPLACE FUNCTION public.mystery_box_purchase(_box_code TEXT)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  RAISE EXCEPTION 'USE_ONCHAIN_ORDER: gọi mystery_box_create_order rồi confirm qua edge function thay vì RPC này.';
END;
$$;

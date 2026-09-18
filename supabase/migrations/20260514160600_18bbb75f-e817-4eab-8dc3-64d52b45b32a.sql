
-- 1. Notification types
ALTER TABLE public.notifications DROP CONSTRAINT IF EXISTS notifications_type_check;
ALTER TABLE public.notifications ADD CONSTRAINT notifications_type_check CHECK (type = ANY (ARRAY[
  'like','love','care','wow','haha','pray','sad','angry',
  'comment','comment_like','comment_reply','share',
  'friend_request','friend_accept','friend_accepted','friend_removed',
  'reward_approved','reward_rejected','account_banned','account_unbanned',
  'donation','claim_reward',
  'admin_shared_device','admin_email_farm','admin_blacklisted_ip','admin_fraud_daily',
  'live_started','reward_adjustment','epoch_claim_ready','epoch_reset_info',
  'mint_request_rejected',
  'live_replay_failed','live_replay_expiring','live_replay_expired',
  'live_auto_ended','live_reconnected',
  'quest_completed','streak_milestone','sbt_issued_quest',
  'mystery_box_received','mystery_box_legendary','mystery_box_expiring','mystery_box_expired'
]));

-- 2. TTL + risk flag
ALTER TABLE public.mystery_box_inventory
  ADD COLUMN IF NOT EXISTS expires_at timestamptz,
  ADD COLUMN IF NOT EXISTS risk_flag boolean NOT NULL DEFAULT false;

-- Default 90d cho box mới khi chưa mở
CREATE OR REPLACE FUNCTION public.mystery_box_set_expiry()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.expires_at IS NULL AND NEW.opened_at IS NULL THEN
    NEW.expires_at := now() + interval '90 days';
  END IF;
  RETURN NEW;
END;$$;
DROP TRIGGER IF EXISTS trg_mb_inv_expiry ON public.mystery_box_inventory;
CREATE TRIGGER trg_mb_inv_expiry
  BEFORE INSERT ON public.mystery_box_inventory
  FOR EACH ROW EXECUTE FUNCTION public.mystery_box_set_expiry();

-- Backfill cho box hiện có (nếu chưa mở mà chưa có expires_at)
UPDATE public.mystery_box_inventory
   SET expires_at = created_at + interval '90 days'
 WHERE expires_at IS NULL AND opened_at IS NULL;

-- 3. Admin audit log (M3)
CREATE TABLE IF NOT EXISTS public.mystery_box_grant_audit (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  inventory_id uuid REFERENCES public.mystery_box_inventory(id) ON DELETE SET NULL,
  granted_by uuid,
  target_user_id uuid NOT NULL,
  source public.box_source NOT NULL,
  box_code text,
  reason text,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.mystery_box_grant_audit ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS mb_audit_admin ON public.mystery_box_grant_audit;
CREATE POLICY mb_audit_admin ON public.mystery_box_grant_audit
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin'))
  WITH CHECK (public.has_role(auth.uid(),'admin'));
CREATE INDEX IF NOT EXISTS idx_mb_audit_target ON public.mystery_box_grant_audit(target_user_id, created_at DESC);

-- 4. Rewrite mystery_box_open: apply reward thật (LS / CAMLY) + cap 60 LS/ngày từ box
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

  -- Pity
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

  -- ============ APPLY REWARD ============
  IF v_type = 'ls' AND v_value > 0 THEN
    -- Cap 60 LS/ngày từ box
    SELECT COALESCE(SUM(light_score),0) INTO v_ls_today
      FROM public.light_actions
     WHERE user_id = v_inv.user_id
       AND action_type = 'MYSTERY_BOX_REWARD'
       AND created_at >= date_trunc('day', now() AT TIME ZONE 'UTC');
    v_ls_grant := LEAST(v_value::numeric, GREATEST(0, 60 - v_ls_today));
    IF v_ls_grant > 0 THEN
      INSERT INTO public.light_actions(
        user_id, action_type, reference_id, reference_type, content_preview,
        base_reward, quality_score, impact_score, integrity_score,
        unity_score, unity_multiplier, light_score, is_eligible, mint_status, evaluated_at
      ) VALUES (
        v_inv.user_id, 'MYSTERY_BOX_REWARD', _inventory_id, 'mystery_box',
        'Phần thưởng từ hộp ' || v_def.name_vi,
        v_ls_grant, 1.0, 1.0, 1.0, 50, 1.0, v_ls_grant, true, 'pending', now()
      );
    END IF;
  ELSIF v_type = 'camly' AND v_value > 0 THEN
    INSERT INTO public.pplp_v2_balance_ledger(user_id, entry_type, amount, reference_table, reference_id, note)
    VALUES (v_inv.user_id, 'mystery_box_reward', v_value, 'mystery_box_inventory', _inventory_id,
            'Thưởng CAMLY từ hộp ' || v_def.name_vi);
  END IF;
  -- pet_xp / pet_skin / cosmetic / sbt_trigger / box_upgrade: payload cho FE/edge xử lý sau

  -- Notification: nhận thưởng (mọi tier)
  INSERT INTO public.notifications (user_id, type, payload, created_at)
  VALUES (v_inv.user_id,
          CASE WHEN v_def.tier IN ('legendary','cosmic') OR v_payload->>'rarity'='legendary'
               THEN 'mystery_box_legendary' ELSE 'mystery_box_received' END,
          jsonb_build_object('reward', v_payload, 'inventory_id', _inventory_id, 'opened', true),
          now());

  RETURN v_payload;
END;
$function$;

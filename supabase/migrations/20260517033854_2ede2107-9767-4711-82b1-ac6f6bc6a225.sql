
-- 1. Add new pet_event_type enum values
ALTER TYPE public.pet_event_type ADD VALUE IF NOT EXISTS 'box_reward_xp';
ALTER TYPE public.pet_event_type ADD VALUE IF NOT EXISTS 'box_opened';

-- 2. Update notifications CHECK constraint
ALTER TABLE public.notifications DROP CONSTRAINT IF EXISTS notifications_type_check;
ALTER TABLE public.notifications ADD CONSTRAINT notifications_type_check CHECK (
  type = ANY (ARRAY[
    'like','love','care','wow','haha','pray','sad','angry',
    'comment','comment_like','comment_reply','share',
    'friend_request','friend_accept','friend_accepted','friend_removed',
    'reward_approved','reward_rejected','account_banned','account_unbanned',
    'donation','claim_reward',
    'admin_shared_device','admin_email_farm','admin_blacklisted_ip','admin_fraud_daily',
    'live_started','reward_adjustment','epoch_claim_ready','epoch_reset_info','mint_request_rejected',
    'live_replay_failed','live_replay_expiring','live_replay_expired','live_auto_ended','live_reconnected',
    'quest_completed','streak_milestone','sbt_issued_quest',
    'mystery_box_received','mystery_box_legendary','mystery_box_expiring','mystery_box_expired',
    'guardian_invited','guardian_accepted','guardian_declined','attestation_received',
    'did_promoted','sbt_issued','dispute_resolved','recovery_initiated',
    'pet_evolved','pet_cosmetic_received','pet_xp_granted'
  ])
);

-- 3. pet_cosmetics_catalog
CREATE TABLE IF NOT EXISTS public.pet_cosmetics_catalog (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug text NOT NULL UNIQUE,
  name_vi text NOT NULL,
  name_en text NOT NULL,
  slot text NOT NULL CHECK (slot IN ('hat','aura','background','accessory','skin')),
  rarity text NOT NULL CHECK (rarity IN ('common','rare','epic','legendary','cosmic')),
  sprite_url text,
  description_vi text,
  description_en text,
  unlock_condition text,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.pet_cosmetics_catalog ENABLE ROW LEVEL SECURITY;
CREATE POLICY "catalog_read_all" ON public.pet_cosmetics_catalog FOR SELECT USING (true);
CREATE POLICY "catalog_admin_write" ON public.pet_cosmetics_catalog FOR ALL TO authenticated
  USING (has_role(auth.uid(),'admin'::app_role)) WITH CHECK (has_role(auth.uid(),'admin'::app_role));

-- 4. pet_cosmetics_owned
CREATE TABLE IF NOT EXISTS public.pet_cosmetics_owned (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  cosmetic_id uuid NOT NULL REFERENCES public.pet_cosmetics_catalog(id) ON DELETE CASCADE,
  source_box_open_id uuid REFERENCES public.mystery_box_open_log(id) ON DELETE SET NULL,
  source text NOT NULL DEFAULT 'mystery_box',
  equipped boolean NOT NULL DEFAULT false,
  acquired_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(user_id, cosmetic_id)
);
CREATE INDEX IF NOT EXISTS idx_pet_cosmetics_owned_user ON public.pet_cosmetics_owned(user_id);
CREATE INDEX IF NOT EXISTS idx_pet_cosmetics_owned_equipped ON public.pet_cosmetics_owned(user_id) WHERE equipped = true;

ALTER TABLE public.pet_cosmetics_owned ENABLE ROW LEVEL SECURITY;
CREATE POLICY "owned_read_self" ON public.pet_cosmetics_owned FOR SELECT
  USING (auth.uid() = user_id OR has_role(auth.uid(),'admin'::app_role));
CREATE POLICY "owned_admin_all" ON public.pet_cosmetics_owned FOR ALL TO authenticated
  USING (has_role(auth.uid(),'admin'::app_role)) WITH CHECK (has_role(auth.uid(),'admin'::app_role));

-- 5. Seed catalog from existing rewards
INSERT INTO public.pet_cosmetics_catalog (slug, name_vi, name_en, slot, rarity, description_vi, description_en, unlock_condition) VALUES
('lumi_basic',    'Lumi Cơ bản',     'Lumi Basic',     'skin', 'common',    'Bộ skin mặc định cho Lumi.',           'Default Lumi skin.',                  'Mở hộp Phổ thông'),
('lumi_aurora',   'Lumi Cực Quang',  'Lumi Aurora',    'skin', 'rare',      'Skin phát ánh sáng cực quang.',        'Aurora glowing skin.',                'Mở hộp Hiếm'),
('lumi_phoenix',  'Lumi Phượng Hoàng','Lumi Phoenix',  'skin', 'epic',      'Skin lửa phượng hoàng.',               'Phoenix fire skin.',                  'Mở hộp Sử thi'),
('lumi_dragon',   'Lumi Rồng',       'Lumi Dragon',    'skin', 'legendary', 'Skin Lumi hoá rồng.',                  'Dragon transformation skin.',         'Mở hộp Huyền thoại'),
('lumi_galaxy',   'Lumi Thiên Hà',   'Lumi Galaxy',    'skin', 'cosmic',    'Skin thiên hà cực hiếm.',              'Cosmic galaxy skin.',                 'Mở hộp Vũ trụ'),
('frame_silver',  'Khung Bạc',       'Silver Frame',   'background','common','Khung nền bạc cho Lumi.',             'Silver background frame.',            'Mở hộp Phổ thông')
ON CONFLICT (slug) DO NOTHING;

-- Update reward metadata to point cosmetic_slug
UPDATE public.mystery_box_rewards SET metadata = metadata || jsonb_build_object('cosmetic_slug','lumi_basic')    WHERE code='skin_common';
UPDATE public.mystery_box_rewards SET metadata = metadata || jsonb_build_object('cosmetic_slug','lumi_aurora')   WHERE code='skin_rare';
UPDATE public.mystery_box_rewards SET metadata = metadata || jsonb_build_object('cosmetic_slug','lumi_phoenix')  WHERE code='skin_epic';
UPDATE public.mystery_box_rewards SET metadata = metadata || jsonb_build_object('cosmetic_slug','lumi_dragon')   WHERE code='skin_legendary';
UPDATE public.mystery_box_rewards SET metadata = metadata || jsonb_build_object('cosmetic_slug','lumi_galaxy')   WHERE code='skin_cosmic';
UPDATE public.mystery_box_rewards SET metadata = metadata || jsonb_build_object('cosmetic_slug','frame_silver')  WHERE code='frame_basic';

-- 6. RPC: pet_equip_cosmetic
CREATE OR REPLACE FUNCTION public.pet_equip_cosmetic(_cosmetic_id uuid)
RETURNS public.pet_cosmetics_owned
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  _user uuid := auth.uid();
  _slot text;
  _owned public.pet_cosmetics_owned;
BEGIN
  IF _user IS NULL THEN RAISE EXCEPTION 'NOT_AUTHENTICATED'; END IF;

  SELECT slot INTO _slot FROM public.pet_cosmetics_catalog WHERE id = _cosmetic_id AND is_active = true;
  IF _slot IS NULL THEN RAISE EXCEPTION 'COSMETIC_NOT_FOUND'; END IF;

  -- Must own it
  SELECT * INTO _owned FROM public.pet_cosmetics_owned WHERE user_id = _user AND cosmetic_id = _cosmetic_id;
  IF _owned.id IS NULL THEN RAISE EXCEPTION 'NOT_OWNED'; END IF;

  -- Unequip others in same slot
  UPDATE public.pet_cosmetics_owned o
    SET equipped = false
    FROM public.pet_cosmetics_catalog c
    WHERE o.cosmetic_id = c.id
      AND o.user_id = _user
      AND c.slot = _slot
      AND o.cosmetic_id <> _cosmetic_id;

  UPDATE public.pet_cosmetics_owned
    SET equipped = true
    WHERE id = _owned.id
    RETURNING * INTO _owned;

  RETURN _owned;
END $$;

-- 7. RPC: apply_pet_xp_grant (cap-respecting xp grant from external sources)
CREATE OR REPLACE FUNCTION public.apply_pet_xp_grant(_user_id uuid, _xp_delta int, _source text DEFAULT 'mystery_box')
RETURNS public.pet_states
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  _state public.pet_states;
  _today date := (now() AT TIME ZONE 'UTC')::date;
  _cap_event int := 100;
  _cap_day int := 1000;
  _new_xp int;
  _old_stage int;
  _new_stage int;
  _new_level int;
BEGIN
  IF _xp_delta IS NULL OR _xp_delta <= 0 THEN
    RETURN NULL;
  END IF;

  INSERT INTO public.pet_states(user_id) VALUES (_user_id) ON CONFLICT (user_id) DO NOTHING;
  SELECT * INTO _state FROM public.pet_states WHERE user_id = _user_id FOR UPDATE;

  IF _state.xp_today_date <> _today THEN
    _state.xp_today := 0;
    _state.xp_today_date := _today;
  END IF;

  IF _xp_delta > _cap_event THEN _xp_delta := _cap_event; END IF;
  IF _state.xp_today + _xp_delta > _cap_day THEN
    _xp_delta := GREATEST(0, _cap_day - _state.xp_today);
  END IF;

  IF _xp_delta = 0 THEN
    RETURN _state;
  END IF;

  _new_xp := _state.xp + _xp_delta;
  _old_stage := _state.evolution_stage;
  _new_stage := public.pet_stage_for_xp(_new_xp);
  _new_level := public.pet_level_for_xp(_new_xp);

  UPDATE public.pet_states SET
    xp = _new_xp,
    xp_today = _state.xp_today + _xp_delta,
    xp_today_date = _today,
    level = _new_level,
    evolution_stage = _new_stage,
    mood = 'excited',
    last_interaction_at = now()
  WHERE user_id = _user_id
  RETURNING * INTO _state;

  INSERT INTO public.pet_interactions(user_id, event, mood_before, mood_after, xp_delta)
  VALUES (_user_id, 'box_reward_xp', _state.mood, 'excited', _xp_delta);

  IF _new_stage > _old_stage THEN
    BEGIN
      INSERT INTO public.notifications(user_id, type, title, message, data)
      VALUES (_user_id, 'pet_evolved',
        'Lumi vừa tiến hoá!',
        'Linh thú của bạn đã đạt giai đoạn ' || _new_stage::text,
        jsonb_build_object('stage', _new_stage, 'level', _new_level, 'source', _source));
    EXCEPTION WHEN others THEN NULL; END;
  END IF;

  BEGIN
    INSERT INTO public.notifications(user_id, type, title, message, data)
    VALUES (_user_id, 'pet_xp_granted',
      'Lumi nhận ' || _xp_delta || ' XP',
      'Phần thưởng XP từ ' || _source,
      jsonb_build_object('xp_delta', _xp_delta, 'source', _source, 'new_level', _new_level));
  EXCEPTION WHEN others THEN NULL; END;

  RETURN _state;
END $$;

-- 8. Trigger function: award cosmetic / xp after box open
CREATE OR REPLACE FUNCTION public.pet_award_after_box_open()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  _reward public.mystery_box_rewards;
  _cosmetic_slug text;
  _cosmetic_id uuid;
  _cosmetic_name text;
  _xp_value int;
BEGIN
  IF NEW.reward_id IS NULL THEN RETURN NEW; END IF;
  SELECT * INTO _reward FROM public.mystery_box_rewards WHERE id = NEW.reward_id;
  IF _reward.id IS NULL THEN RETURN NEW; END IF;

  IF _reward.type IN ('pet_skin','cosmetic') THEN
    _cosmetic_slug := _reward.metadata->>'cosmetic_slug';
    IF _cosmetic_slug IS NOT NULL THEN
      SELECT id, name_vi INTO _cosmetic_id, _cosmetic_name
        FROM public.pet_cosmetics_catalog WHERE slug = _cosmetic_slug AND is_active = true;
      IF _cosmetic_id IS NOT NULL THEN
        INSERT INTO public.pet_cosmetics_owned(user_id, cosmetic_id, source_box_open_id, source)
        VALUES (NEW.user_id, _cosmetic_id, NEW.id, 'mystery_box')
        ON CONFLICT (user_id, cosmetic_id) DO NOTHING;

        BEGIN
          INSERT INTO public.notifications(user_id, type, title, message, data)
          VALUES (NEW.user_id, 'pet_cosmetic_received',
            'Lumi nhận trang phục mới!',
            'Bạn vừa mở được "' || _cosmetic_name || '" từ hộp.',
            jsonb_build_object('cosmetic_id', _cosmetic_id, 'slug', _cosmetic_slug, 'box_open_id', NEW.id));
        EXCEPTION WHEN others THEN NULL; END;
      END IF;
    END IF;
  ELSIF _reward.type = 'pet_xp' THEN
    _xp_value := _reward.value_int::int;
    IF _xp_value > 0 THEN
      PERFORM public.apply_pet_xp_grant(NEW.user_id, _xp_value, 'mystery_box');
    END IF;
  END IF;

  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS pet_award_after_box_open_trg ON public.mystery_box_open_log;
CREATE TRIGGER pet_award_after_box_open_trg
  AFTER INSERT ON public.mystery_box_open_log
  FOR EACH ROW EXECUTE FUNCTION public.pet_award_after_box_open();

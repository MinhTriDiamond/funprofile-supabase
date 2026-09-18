
-- Phase 4.3
UPDATE public.pet_cosmetics_catalog SET sprite_url = '/src/assets/pet/skin-lumi-basic.png'   WHERE slug = 'lumi_basic';
UPDATE public.pet_cosmetics_catalog SET sprite_url = '/src/assets/pet/skin-lumi-aurora.png'  WHERE slug = 'lumi_aurora';
UPDATE public.pet_cosmetics_catalog SET sprite_url = '/src/assets/pet/skin-lumi-phoenix.png' WHERE slug = 'lumi_phoenix';
UPDATE public.pet_cosmetics_catalog SET sprite_url = '/src/assets/pet/skin-lumi-dragon.png'  WHERE slug = 'lumi_dragon';
UPDATE public.pet_cosmetics_catalog SET sprite_url = '/src/assets/pet/skin-lumi-galaxy.png'  WHERE slug = 'lumi_galaxy';
UPDATE public.pet_cosmetics_catalog SET sprite_url = '/src/assets/pet/frame-silver.png'      WHERE slug = 'frame_silver';

INSERT INTO public.pet_voice_lines (trigger_event, mood, text_vi, text_en) VALUES
('box_opened','excited','Wow! Cùng mở hộp với bạn nè ✨', 'Wow! Opening the box together! ✨'),
('box_opened','excited','Hộp này có gì hay nè?', 'What''s in this box?!'),
('box_opened','excited','Lumi hồi hộp quá!', 'Lumi is so excited!')
ON CONFLICT DO NOTHING;

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

  BEGIN
    PERFORM public.apply_pet_event(NEW.user_id, 'box_opened'::pet_event_type);
  EXCEPTION WHEN others THEN NULL; END;

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

-- Phase 5
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
    'pet_evolved','pet_cosmetic_received','pet_xp_granted','pet_cheer_received'
  ])
);

ALTER TABLE public.pet_states ADD COLUMN IF NOT EXISTS cheers_received_total int NOT NULL DEFAULT 0;
ALTER TABLE public.pet_states ADD COLUMN IF NOT EXISTS last_renamed_at timestamptz;

CREATE TABLE IF NOT EXISTS public.pet_cheers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  from_user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  to_user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  message text,
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (from_user_id <> to_user_id),
  CHECK (message IS NULL OR char_length(message) <= 120)
);
CREATE INDEX IF NOT EXISTS idx_pet_cheers_to ON public.pet_cheers(to_user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_pet_cheers_from ON public.pet_cheers(from_user_id, created_at DESC);
CREATE UNIQUE INDEX IF NOT EXISTS uq_pet_cheers_daily
  ON public.pet_cheers (from_user_id, to_user_id, ((created_at AT TIME ZONE 'UTC')::date));

ALTER TABLE public.pet_cheers ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "pet_cheers_select_all" ON public.pet_cheers;
DROP POLICY IF EXISTS "pet_cheers_insert_self" ON public.pet_cheers;
CREATE POLICY "pet_cheers_select_all" ON public.pet_cheers FOR SELECT USING (true);
CREATE POLICY "pet_cheers_insert_self" ON public.pet_cheers FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = from_user_id);

CREATE OR REPLACE VIEW public.public_pet_states AS
SELECT
  ps.user_id,
  ps.name,
  ps.species,
  ps.mood,
  ps.level,
  ps.evolution_stage,
  ps.cheers_received_total,
  ps.visible,
  (
    SELECT c.slug
    FROM public.pet_cosmetics_owned o
    JOIN public.pet_cosmetics_catalog c ON c.id = o.cosmetic_id
    WHERE o.user_id = ps.user_id AND o.equipped = true AND c.slot = 'skin'
    LIMIT 1
  ) AS equipped_skin_slug,
  (
    SELECT c.slug
    FROM public.pet_cosmetics_owned o
    JOIN public.pet_cosmetics_catalog c ON c.id = o.cosmetic_id
    WHERE o.user_id = ps.user_id AND o.equipped = true AND c.slot = 'background'
    LIMIT 1
  ) AS equipped_frame_slug
FROM public.pet_states ps
WHERE ps.visible = true;

GRANT SELECT ON public.public_pet_states TO anon, authenticated;

CREATE OR REPLACE FUNCTION public.pet_cheer(_to_user_id uuid, _message text DEFAULT NULL)
RETURNS public.pet_cheers
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
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
END $$;

CREATE OR REPLACE FUNCTION public.pet_rename(_new_name text)
RETURNS public.pet_states
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  _user uuid := auth.uid();
  _state public.pet_states;
  _trim text;
  _blocked text[] := ARRAY[
    'admin','administrator','root','system','support','staff','moderator','mod',
    'fuck','shit','asshole','bitch','cunt','dick','nigger','retard','rape',
    'sex','porn','xxx','satan','lucifer','hitler','nazi'
  ];
  _b text;
BEGIN
  IF _user IS NULL THEN RAISE EXCEPTION 'NOT_AUTHENTICATED'; END IF;
  _trim := btrim(COALESCE(_new_name, ''));
  IF char_length(_trim) < 2 OR char_length(_trim) > 20 THEN RAISE EXCEPTION 'INVALID_LENGTH'; END IF;

  FOREACH _b IN ARRAY _blocked LOOP
    IF lower(_trim) LIKE '%' || _b || '%' THEN RAISE EXCEPTION 'BLOCKED_WORD'; END IF;
  END LOOP;

  INSERT INTO public.pet_states(user_id) VALUES (_user) ON CONFLICT (user_id) DO NOTHING;
  SELECT * INTO _state FROM public.pet_states WHERE user_id = _user FOR UPDATE;

  IF _state.last_renamed_at IS NOT NULL AND _state.last_renamed_at > now() - interval '7 days' THEN
    RAISE EXCEPTION 'RENAME_COOLDOWN';
  END IF;

  UPDATE public.pet_states
    SET name = _trim, last_renamed_at = now()
    WHERE user_id = _user
    RETURNING * INTO _state;

  RETURN _state;
END $$;

CREATE OR REPLACE FUNCTION public.pet_leaderboard_top(_limit int DEFAULT 50)
RETURNS TABLE (
  user_id uuid,
  name text,
  evolution_stage int,
  level int,
  cheers_received_total int,
  equipped_skin_slug text
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT user_id, name, evolution_stage, level, cheers_received_total, equipped_skin_slug
  FROM public.public_pet_states
  ORDER BY level DESC, cheers_received_total DESC, evolution_stage DESC
  LIMIT GREATEST(1, LEAST(_limit, 200));
$$;

GRANT EXECUTE ON FUNCTION public.pet_leaderboard_top(int) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.pet_cheer(uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.pet_rename(text) TO authenticated;

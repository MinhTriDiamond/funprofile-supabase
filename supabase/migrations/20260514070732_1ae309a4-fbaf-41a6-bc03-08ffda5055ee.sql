
-- Enums
CREATE TYPE public.pet_mood AS ENUM ('happy','calm','sad','excited','sleepy','hungry');
CREATE TYPE public.pet_event_type AS ENUM (
  'quest_completed','daily_streak_extended','streak_break',
  'donation_sent','reaction_added','inactive_24h','midnight_utc',
  'level_up','evolution','login'
);

-- pet_states
CREATE TABLE public.pet_states (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  name text NOT NULL DEFAULT 'Lumi',
  species text NOT NULL DEFAULT 'lumi',
  mood public.pet_mood NOT NULL DEFAULT 'calm',
  level int NOT NULL DEFAULT 1,
  xp int NOT NULL DEFAULT 0,
  xp_today int NOT NULL DEFAULT 0,
  xp_today_date date NOT NULL DEFAULT (now() AT TIME ZONE 'UTC')::date,
  evolution_stage int NOT NULL DEFAULT 1 CHECK (evolution_stage BETWEEN 1 AND 5),
  accessories jsonb NOT NULL DEFAULT '[]'::jsonb,
  last_interaction_at timestamptz NOT NULL DEFAULT now(),
  voice_enabled boolean NOT NULL DEFAULT true,
  visible boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_pet_states_last_interaction ON public.pet_states(last_interaction_at);

ALTER TABLE public.pet_states ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Owner read pet_states" ON public.pet_states FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Owner insert pet_states" ON public.pet_states FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Owner update pet_states" ON public.pet_states FOR UPDATE USING (auth.uid() = user_id);

-- pet_voice_lines (pool dùng chung)
CREATE TABLE public.pet_voice_lines (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  mood public.pet_mood NOT NULL,
  trigger_event public.pet_event_type NOT NULL,
  text_vi text NOT NULL,
  text_en text NOT NULL,
  audio_url text,
  sort_order int NOT NULL DEFAULT 0,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_pet_voice_lines_lookup ON public.pet_voice_lines(mood, trigger_event, is_active);

ALTER TABLE public.pet_voice_lines ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Public read pet_voice_lines" ON public.pet_voice_lines FOR SELECT USING (is_active = true);
CREATE POLICY "Admin write pet_voice_lines" ON public.pet_voice_lines FOR ALL
  USING (public.has_role(auth.uid(),'admin')) WITH CHECK (public.has_role(auth.uid(),'admin'));

-- pet_interactions (log)
CREATE TABLE public.pet_interactions (
  id bigserial PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  event public.pet_event_type NOT NULL,
  mood_before public.pet_mood,
  mood_after public.pet_mood,
  xp_delta int NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_pet_interactions_user_ts ON public.pet_interactions(user_id, created_at DESC);

ALTER TABLE public.pet_interactions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Owner read pet_interactions" ON public.pet_interactions FOR SELECT USING (auth.uid() = user_id);

-- updated_at trigger
CREATE TRIGGER pet_states_updated_at BEFORE UPDATE ON public.pet_states
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Evolution thresholds: stage 2=50xp, 3=200, 4=500, 5=1500
CREATE OR REPLACE FUNCTION public.pet_stage_for_xp(_xp int)
RETURNS int LANGUAGE sql IMMUTABLE AS $$
  SELECT CASE
    WHEN _xp >= 1500 THEN 5
    WHEN _xp >= 500 THEN 4
    WHEN _xp >= 200 THEN 3
    WHEN _xp >= 50 THEN 2
    ELSE 1
  END
$$;

-- Level: every 100 xp +1 level, cap 99
CREATE OR REPLACE FUNCTION public.pet_level_for_xp(_xp int)
RETURNS int LANGUAGE sql IMMUTABLE AS $$
  SELECT LEAST(99, GREATEST(1, 1 + (_xp / 100)))
$$;

-- Main RPC: apply event
CREATE OR REPLACE FUNCTION public.apply_pet_event(_user_id uuid, _event public.pet_event_type)
RETURNS public.pet_states
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _state public.pet_states;
  _xp_delta int := 0;
  _new_mood public.pet_mood;
  _today date := (now() AT TIME ZONE 'UTC')::date;
  _xp_cap_per_event int := 100;
  _xp_cap_per_day int := 1000;
  _new_xp int;
  _new_stage int;
  _new_level int;
  _old_stage int;
  _old_level int;
BEGIN
  -- Auto-create pet if missing
  INSERT INTO public.pet_states(user_id) VALUES (_user_id)
  ON CONFLICT (user_id) DO NOTHING;

  SELECT * INTO _state FROM public.pet_states WHERE user_id = _user_id FOR UPDATE;

  -- Reset daily counter
  IF _state.xp_today_date <> _today THEN
    _state.xp_today := 0;
    _state.xp_today_date := _today;
  END IF;

  -- Map event -> mood + xp
  CASE _event
    WHEN 'quest_completed'         THEN _xp_delta := 5;  _new_mood := 'happy';
    WHEN 'daily_streak_extended'   THEN _xp_delta := 10; _new_mood := 'excited';
    WHEN 'streak_break'            THEN _xp_delta := 0;  _new_mood := 'sad';
    WHEN 'donation_sent'           THEN _xp_delta := 8;  _new_mood := 'excited';
    WHEN 'reaction_added'          THEN _xp_delta := 1;  _new_mood := 'happy';
    WHEN 'inactive_24h'            THEN _xp_delta := 0;  _new_mood := 'hungry';
    WHEN 'midnight_utc'            THEN _xp_delta := 0;  _new_mood := 'sleepy';
    WHEN 'level_up'                THEN _xp_delta := 20; _new_mood := 'excited';
    WHEN 'evolution'               THEN _xp_delta := 0;  _new_mood := 'excited';
    WHEN 'login'                   THEN _xp_delta := 1;  _new_mood := 'calm';
  END CASE;

  -- Cap per event
  IF _xp_delta > _xp_cap_per_event THEN _xp_delta := _xp_cap_per_event; END IF;
  -- Cap per day
  IF _state.xp_today + _xp_delta > _xp_cap_per_day THEN
    _xp_delta := GREATEST(0, _xp_cap_per_day - _state.xp_today);
  END IF;

  _new_xp := _state.xp + _xp_delta;
  _old_stage := _state.evolution_stage;
  _old_level := _state.level;
  _new_stage := public.pet_stage_for_xp(_new_xp);
  _new_level := public.pet_level_for_xp(_new_xp);

  UPDATE public.pet_states SET
    mood = _new_mood,
    xp = _new_xp,
    xp_today = _state.xp_today + _xp_delta,
    xp_today_date = _today,
    level = _new_level,
    evolution_stage = _new_stage,
    last_interaction_at = now()
  WHERE user_id = _user_id
  RETURNING * INTO _state;

  INSERT INTO public.pet_interactions(user_id, event, mood_before, mood_after, xp_delta)
  VALUES (_user_id, _event, _state.mood, _new_mood, _xp_delta);

  -- Recurse for level_up / evolution side-effects (avoid infinite via stage check)
  IF _new_stage > _old_stage THEN
    PERFORM public.apply_pet_event(_user_id, 'evolution'::public.pet_event_type);
    -- Notification (best-effort, ignore failures)
    BEGIN
      INSERT INTO public.notifications(user_id, type, title, message, data)
      VALUES (_user_id, 'pet_evolved',
        'Lumi vừa tiến hoá!',
        'Linh thú của bạn đã đạt giai đoạn ' || _new_stage::text,
        jsonb_build_object('stage', _new_stage, 'level', _new_level));
    EXCEPTION WHEN others THEN NULL;
    END;
  END IF;

  RETURN _state;
END;
$$;

GRANT EXECUTE ON FUNCTION public.apply_pet_event(uuid, public.pet_event_type) TO authenticated, service_role;

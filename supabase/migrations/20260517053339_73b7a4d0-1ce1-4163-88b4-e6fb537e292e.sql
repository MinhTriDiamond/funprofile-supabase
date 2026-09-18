
-- 1. Seasons
CREATE TABLE IF NOT EXISTS public.pet_battle_seasons (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  start_at timestamptz NOT NULL,
  end_at timestamptz NOT NULL,
  is_current boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_pet_battle_seasons_current ON public.pet_battle_seasons(is_current) WHERE is_current = true;
ALTER TABLE public.pet_battle_seasons ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Anyone view seasons" ON public.pet_battle_seasons FOR SELECT USING (true);
CREATE POLICY "Admin manage seasons" ON public.pet_battle_seasons FOR ALL
  USING (public.has_role(auth.uid(),'admin')) WITH CHECK (public.has_role(auth.uid(),'admin'));

-- Seed first season (current week UTC)
INSERT INTO public.pet_battle_seasons(name, start_at, end_at, is_current)
VALUES (
  'Tuần ' || to_char(date_trunc('week', now()), 'IW/YYYY'),
  date_trunc('week', now()),
  date_trunc('week', now()) + interval '7 days',
  true
) ON CONFLICT DO NOTHING;

-- 2. Battles
CREATE TABLE IF NOT EXISTS public.pet_battles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  challenger_id uuid NOT NULL,
  opponent_id uuid NOT NULL,
  challenger_snapshot jsonb NOT NULL,
  opponent_snapshot jsonb NOT NULL,
  seed text NOT NULL DEFAULT encode(gen_random_bytes(16),'hex'),
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','accepted','resolved','declined','expired')),
  winner_id uuid,
  rounds jsonb NOT NULL DEFAULT '[]'::jsonb,
  xp_award_challenger integer NOT NULL DEFAULT 0,
  xp_award_opponent integer NOT NULL DEFAULT 0,
  season_id uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  resolved_at timestamptz,
  expires_at timestamptz NOT NULL DEFAULT (now() + interval '24 hours'),
  CHECK (challenger_id <> opponent_id)
);
CREATE INDEX IF NOT EXISTS idx_pet_battles_challenger ON public.pet_battles(challenger_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_pet_battles_opponent ON public.pet_battles(opponent_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_pet_battles_status ON public.pet_battles(status, created_at DESC);

ALTER TABLE public.pet_battles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users view own battles" ON public.pet_battles FOR SELECT
  USING (auth.uid() = challenger_id OR auth.uid() = opponent_id OR public.has_role(auth.uid(),'admin'));
CREATE POLICY "Admin manage battles" ON public.pet_battles FOR ALL
  USING (public.has_role(auth.uid(),'admin')) WITH CHECK (public.has_role(auth.uid(),'admin'));

-- 3. Leaderboard
CREATE TABLE IF NOT EXISTS public.pet_battle_leaderboard (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  season_id uuid NOT NULL REFERENCES public.pet_battle_seasons(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  wins integer NOT NULL DEFAULT 0,
  losses integer NOT NULL DEFAULT 0,
  draws integer NOT NULL DEFAULT 0,
  points integer NOT NULL DEFAULT 0,
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(season_id, user_id)
);
CREATE INDEX IF NOT EXISTS idx_pet_battle_lb_season_points ON public.pet_battle_leaderboard(season_id, points DESC);
ALTER TABLE public.pet_battle_leaderboard ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Anyone view leaderboard" ON public.pet_battle_leaderboard FOR SELECT USING (true);
CREATE POLICY "Admin manage leaderboard" ON public.pet_battle_leaderboard FOR ALL
  USING (public.has_role(auth.uid(),'admin')) WITH CHECK (public.has_role(auth.uid(),'admin'));

-- 4. RPC: compute stats
CREATE OR REPLACE FUNCTION public.pet_battle_compute_stats(_user_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_pet record;
  v_cheers integer := 0;
  v_cosmetic_bonus integer := 0;
  v_atk int; v_def int; v_spd int; v_lck int;
BEGIN
  SELECT * INTO v_pet FROM public.pet_states WHERE user_id = _user_id;
  IF v_pet IS NULL THEN RETURN NULL; END IF;

  SELECT COUNT(*) INTO v_cheers FROM public.pet_cheers
    WHERE to_user_id = _user_id AND created_at > now() - interval '7 days';

  SELECT COUNT(*) INTO v_cosmetic_bonus FROM public.pet_cosmetics_owned
    WHERE user_id = _user_id AND equipped = true;

  v_atk := 10 + v_pet.level * 3 + v_cosmetic_bonus * 2;
  v_def := 10 + v_pet.level * 2 + v_cosmetic_bonus * 2;
  v_spd := 8 + v_pet.level * 2 + LEAST(v_cheers, 30);
  v_lck := 5 + v_cosmetic_bonus + (v_pet.level / 2)::int;

  RETURN jsonb_build_object(
    'user_id', _user_id,
    'pet_name', v_pet.name,
    'pet_level', v_pet.level,
    'pet_mood', v_pet.mood,
    'atk', v_atk, 'def', v_def, 'spd', v_spd, 'lck', v_lck,
    'cheers_7d', v_cheers,
    'cosmetics_equipped', v_cosmetic_bonus
  );
END; $$;
GRANT EXECUTE ON FUNCTION public.pet_battle_compute_stats(uuid) TO authenticated, service_role;

-- 5. RPC: challenge
CREATE OR REPLACE FUNCTION public.pet_battle_challenge(_opponent_id uuid)
RETURNS public.pet_battles LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_me uuid := auth.uid();
  v_my_tier text; v_op_tier text;
  v_count_24h int;
  v_my_stats jsonb; v_op_stats jsonb;
  v_season uuid;
  v_row public.pet_battles;
BEGIN
  IF v_me IS NULL THEN RAISE EXCEPTION 'NOT_AUTHENTICATED'; END IF;
  IF v_me = _opponent_id THEN RAISE EXCEPTION 'CANNOT_CHALLENGE_SELF'; END IF;

  SELECT risk_tier INTO v_my_tier FROM public.pet_states WHERE user_id = v_me;
  IF v_my_tier IS NULL THEN RAISE EXCEPTION 'NO_PET'; END IF;
  IF v_my_tier IN ('restricted','frozen') THEN RAISE EXCEPTION 'RISK_BLOCKED'; END IF;

  SELECT risk_tier INTO v_op_tier FROM public.pet_states WHERE user_id = _opponent_id;
  IF v_op_tier IS NULL THEN RAISE EXCEPTION 'OPPONENT_NO_PET'; END IF;
  IF v_op_tier = 'frozen' THEN RAISE EXCEPTION 'OPPONENT_FROZEN'; END IF;

  SELECT COUNT(*) INTO v_count_24h FROM public.pet_battles
    WHERE challenger_id = v_me AND created_at > now() - interval '24 hours';
  IF v_count_24h >= 10 THEN RAISE EXCEPTION 'DAILY_LIMIT_REACHED'; END IF;

  IF EXISTS (SELECT 1 FROM public.pet_battles
    WHERE challenger_id = v_me AND opponent_id = _opponent_id AND status = 'pending') THEN
    RAISE EXCEPTION 'ALREADY_PENDING';
  END IF;

  v_my_stats := public.pet_battle_compute_stats(v_me);
  v_op_stats := public.pet_battle_compute_stats(_opponent_id);
  SELECT id INTO v_season FROM public.pet_battle_seasons WHERE is_current = true LIMIT 1;

  INSERT INTO public.pet_battles(challenger_id, opponent_id, challenger_snapshot, opponent_snapshot, season_id)
  VALUES (v_me, _opponent_id, v_my_stats, v_op_stats, v_season)
  RETURNING * INTO v_row;

  -- Notification cho đối thủ
  INSERT INTO public.notifications(user_id, type, title, message, metadata)
  VALUES (
    _opponent_id, 'pet_battle_challenge',
    'Có người thách đấu Lumi của bạn!',
    COALESCE((v_my_stats->>'pet_name'),'Lumi') || ' đang muốn đấu với linh thú của bạn.',
    jsonb_build_object('battle_id', v_row.id, 'challenger_id', v_me)
  );

  RETURN v_row;
END; $$;
GRANT EXECUTE ON FUNCTION public.pet_battle_challenge(uuid) TO authenticated;

-- 6. RPC: accept (deterministic resolve)
CREATE OR REPLACE FUNCTION public.pet_battle_accept(_battle_id uuid)
RETURNS public.pet_battles LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_me uuid := auth.uid();
  v_b public.pet_battles;
  v_op_tier text;
  v_rounds jsonb := '[]'::jsonb;
  v_score_c int := 0; v_score_o int := 0;
  v_winner uuid;
  v_xp_c int := 0; v_xp_o int := 0;
  v_points_c int := 0; v_points_o int := 0;
  v_rec int; v_atkc int; v_defc int; v_spdc int; v_lckc int;
  v_atko int; v_defo int; v_spdo int; v_lcko int;
  v_roll_c int; v_roll_o int;
  v_seed_hash bytea;
  i int;
BEGIN
  IF v_me IS NULL THEN RAISE EXCEPTION 'NOT_AUTHENTICATED'; END IF;
  SELECT * INTO v_b FROM public.pet_battles WHERE id = _battle_id FOR UPDATE;
  IF v_b IS NULL THEN RAISE EXCEPTION 'NOT_FOUND'; END IF;
  IF v_b.opponent_id <> v_me THEN RAISE EXCEPTION 'NOT_OPPONENT'; END IF;
  IF v_b.status <> 'pending' THEN RAISE EXCEPTION 'NOT_PENDING'; END IF;
  IF v_b.expires_at < now() THEN
    UPDATE public.pet_battles SET status='expired' WHERE id=_battle_id;
    RAISE EXCEPTION 'EXPIRED';
  END IF;

  SELECT risk_tier INTO v_op_tier FROM public.pet_states WHERE user_id = v_me;
  IF v_op_tier = 'frozen' THEN RAISE EXCEPTION 'RISK_BLOCKED'; END IF;

  v_atkc := (v_b.challenger_snapshot->>'atk')::int;
  v_defc := (v_b.challenger_snapshot->>'def')::int;
  v_spdc := (v_b.challenger_snapshot->>'spd')::int;
  v_lckc := (v_b.challenger_snapshot->>'lck')::int;
  v_atko := (v_b.opponent_snapshot->>'atk')::int;
  v_defo := (v_b.opponent_snapshot->>'def')::int;
  v_spdo := (v_b.opponent_snapshot->>'spd')::int;
  v_lcko := (v_b.opponent_snapshot->>'lck')::int;

  -- 5 rounds, deterministic RNG từ seed
  FOR i IN 1..5 LOOP
    v_seed_hash := digest(v_b.seed || ':' || i::text, 'sha256');
    v_roll_c := (get_byte(v_seed_hash, 0) % 20) + 1;  -- 1..20
    v_roll_o := (get_byte(v_seed_hash, 1) % 20) + 1;
    DECLARE
      dmg_c int := GREATEST(0, v_atkc + v_lckc + v_roll_c - v_defo - v_spdo/2);
      dmg_o int := GREATEST(0, v_atko + v_lcko + v_roll_o - v_defc - v_spdc/2);
    BEGIN
      v_score_c := v_score_c + dmg_c;
      v_score_o := v_score_o + dmg_o;
      v_rounds := v_rounds || jsonb_build_array(jsonb_build_object(
        'round', i, 'dmg_challenger', dmg_c, 'dmg_opponent', dmg_o,
        'roll_c', v_roll_c, 'roll_o', v_roll_o
      ));
    END;
  END LOOP;

  IF v_score_c > v_score_o THEN
    v_winner := v_b.challenger_id; v_xp_c := 30; v_xp_o := 5;
    v_points_c := 3; v_points_o := 0;
  ELSIF v_score_o > v_score_c THEN
    v_winner := v_b.opponent_id; v_xp_c := 5; v_xp_o := 30;
    v_points_c := 0; v_points_o := 3;
  ELSE
    v_winner := NULL; v_xp_c := 10; v_xp_o := 10;
    v_points_c := 1; v_points_o := 1;
  END IF;

  -- Risk-restricted = không nhận XP
  IF (SELECT risk_tier FROM public.pet_states WHERE user_id = v_b.challenger_id) = 'restricted' THEN v_xp_c := 0; END IF;
  IF v_op_tier = 'restricted' THEN v_xp_o := 0; END IF;

  UPDATE public.pet_battles SET
    status='resolved', winner_id=v_winner, rounds=v_rounds,
    xp_award_challenger=v_xp_c, xp_award_opponent=v_xp_o,
    resolved_at = now()
  WHERE id = _battle_id RETURNING * INTO v_b;

  -- Cộng XP trực tiếp vào pet_states (giới hạn xp_today 500/ngày)
  UPDATE public.pet_states
    SET xp = xp + v_xp_c,
        xp_today = LEAST(500, COALESCE(xp_today,0) + v_xp_c),
        xp_today_date = CURRENT_DATE
  WHERE user_id = v_b.challenger_id AND v_xp_c > 0;

  UPDATE public.pet_states
    SET xp = xp + v_xp_o,
        xp_today = LEAST(500, COALESCE(xp_today,0) + v_xp_o),
        xp_today_date = CURRENT_DATE
  WHERE user_id = v_b.opponent_id AND v_xp_o > 0;

  -- Update leaderboard
  IF v_b.season_id IS NOT NULL THEN
    INSERT INTO public.pet_battle_leaderboard(season_id, user_id, wins, losses, draws, points)
    VALUES (v_b.season_id, v_b.challenger_id,
      CASE WHEN v_winner = v_b.challenger_id THEN 1 ELSE 0 END,
      CASE WHEN v_winner = v_b.opponent_id THEN 1 ELSE 0 END,
      CASE WHEN v_winner IS NULL THEN 1 ELSE 0 END,
      v_points_c)
    ON CONFLICT (season_id, user_id) DO UPDATE SET
      wins = pet_battle_leaderboard.wins + EXCLUDED.wins,
      losses = pet_battle_leaderboard.losses + EXCLUDED.losses,
      draws = pet_battle_leaderboard.draws + EXCLUDED.draws,
      points = pet_battle_leaderboard.points + EXCLUDED.points,
      updated_at = now();

    INSERT INTO public.pet_battle_leaderboard(season_id, user_id, wins, losses, draws, points)
    VALUES (v_b.season_id, v_b.opponent_id,
      CASE WHEN v_winner = v_b.opponent_id THEN 1 ELSE 0 END,
      CASE WHEN v_winner = v_b.challenger_id THEN 1 ELSE 0 END,
      CASE WHEN v_winner IS NULL THEN 1 ELSE 0 END,
      v_points_o)
    ON CONFLICT (season_id, user_id) DO UPDATE SET
      wins = pet_battle_leaderboard.wins + EXCLUDED.wins,
      losses = pet_battle_leaderboard.losses + EXCLUDED.losses,
      draws = pet_battle_leaderboard.draws + EXCLUDED.draws,
      points = pet_battle_leaderboard.points + EXCLUDED.points,
      updated_at = now();
  END IF;

  -- Notifications cho cả 2
  INSERT INTO public.notifications(user_id, type, title, message, metadata) VALUES
    (v_b.challenger_id, 'pet_battle_result',
      CASE WHEN v_winner = v_b.challenger_id THEN 'Bạn thắng trận đấu Lumi!'
           WHEN v_winner IS NULL THEN 'Trận đấu Lumi hoà'
           ELSE 'Bạn thua trận đấu Lumi' END,
      'XP nhận: ' || v_xp_c,
      jsonb_build_object('battle_id', v_b.id, 'winner_id', v_winner, 'xp', v_xp_c)),
    (v_b.opponent_id, 'pet_battle_result',
      CASE WHEN v_winner = v_b.opponent_id THEN 'Bạn thắng trận đấu Lumi!'
           WHEN v_winner IS NULL THEN 'Trận đấu Lumi hoà'
           ELSE 'Bạn thua trận đấu Lumi' END,
      'XP nhận: ' || v_xp_o,
      jsonb_build_object('battle_id', v_b.id, 'winner_id', v_winner, 'xp', v_xp_o));

  RETURN v_b;
END; $$;
GRANT EXECUTE ON FUNCTION public.pet_battle_accept(uuid) TO authenticated;

-- 7. RPC: decline
CREATE OR REPLACE FUNCTION public.pet_battle_decline(_battle_id uuid)
RETURNS public.pet_battles LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_me uuid := auth.uid();
  v_b public.pet_battles;
BEGIN
  SELECT * INTO v_b FROM public.pet_battles WHERE id = _battle_id FOR UPDATE;
  IF v_b IS NULL THEN RAISE EXCEPTION 'NOT_FOUND'; END IF;
  IF v_b.opponent_id <> v_me THEN RAISE EXCEPTION 'NOT_OPPONENT'; END IF;
  IF v_b.status <> 'pending' THEN RAISE EXCEPTION 'NOT_PENDING'; END IF;
  UPDATE public.pet_battles SET status='declined', resolved_at=now() WHERE id=_battle_id RETURNING * INTO v_b;
  RETURN v_b;
END; $$;
GRANT EXECUTE ON FUNCTION public.pet_battle_decline(uuid) TO authenticated;

-- 8. Cron expire pending battles (qua function nội bộ, không cần edge)
CREATE OR REPLACE FUNCTION public.pet_battle_expire_pending()
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_cnt int;
BEGIN
  UPDATE public.pet_battles SET status='expired'
  WHERE status='pending' AND expires_at < now();
  GET DIAGNOSTICS v_cnt = ROW_COUNT;
  RETURN v_cnt;
END; $$;
GRANT EXECUTE ON FUNCTION public.pet_battle_expire_pending() TO service_role;

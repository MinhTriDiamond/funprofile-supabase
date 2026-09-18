-- =========================================================
-- B3-02 LỚP 2: atomic daily mint cap
-- =========================================================
CREATE TABLE IF NOT EXISTS public.pplp_daily_action_mint (
  action_name text NOT NULL,
  day_utc date NOT NULL,
  reserved_wei numeric(78,0) NOT NULL DEFAULT 0,
  cap_wei numeric(78,0) NOT NULL DEFAULT 950000::numeric * 1e18,
  reserve_count integer NOT NULL DEFAULT 0,
  release_count integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (action_name, day_utc)
);

GRANT SELECT ON public.pplp_daily_action_mint TO authenticated;
GRANT ALL ON public.pplp_daily_action_mint TO service_role;
ALTER TABLE public.pplp_daily_action_mint ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admins can view daily mint cap" ON public.pplp_daily_action_mint;
CREATE POLICY "Admins can view daily mint cap"
ON public.pplp_daily_action_mint FOR SELECT TO authenticated
USING (public.has_role(auth.uid(), 'admin'::app_role));

CREATE OR REPLACE FUNCTION public.pplp_daily_action_mint_touch()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN NEW.updated_at := now(); RETURN NEW; END; $$;

DROP TRIGGER IF EXISTS trg_pplp_daily_action_mint_touch ON public.pplp_daily_action_mint;
CREATE TRIGGER trg_pplp_daily_action_mint_touch
BEFORE UPDATE ON public.pplp_daily_action_mint
FOR EACH ROW EXECUTE FUNCTION public.pplp_daily_action_mint_touch();

-- Reserve: atomic, race-safe. Chỉ service_role hoặc admin JWT.
CREATE OR REPLACE FUNCTION public.pplp_reserve_daily_mint(
  p_action_name text,
  p_amount_wei numeric,
  p_source text DEFAULT 'auto'
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_role text := coalesce(nullif(current_setting('role', true), ''), session_user);
  v_day date := (now() AT TIME ZONE 'utc')::date;
  v_action text := coalesce(nullif(p_action_name, ''), 'FUN_REWARD');
  v_amount numeric := coalesce(p_amount_wei, 0);
  v_cap numeric;
  v_reserved numeric;
  v_new numeric;
BEGIN
  IF v_role IN ('anon') THEN
    RAISE EXCEPTION 'FORBIDDEN: anonymous cannot reserve mint cap';
  END IF;
  IF v_role = 'authenticated' AND NOT public.has_role(auth.uid(), 'admin'::app_role) THEN
    RAISE EXCEPTION 'FORBIDDEN: admin only';
  END IF;
  IF v_amount <= 0 THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'INVALID_AMOUNT');
  END IF;

  INSERT INTO public.pplp_daily_action_mint (action_name, day_utc, reserved_wei, reserve_count)
  VALUES (v_action, v_day, 0, 0)
  ON CONFLICT (action_name, day_utc) DO NOTHING;

  -- Lock hàng của (action, day) → 2 request đồng thời tuần tự hoá tại đây.
  SELECT cap_wei, reserved_wei INTO v_cap, v_reserved
  FROM public.pplp_daily_action_mint
  WHERE action_name = v_action AND day_utc = v_day
  FOR UPDATE;

  v_new := v_reserved + v_amount;
  IF v_new > v_cap THEN
    RETURN jsonb_build_object(
      'ok', false, 'reason', 'DAILY_CAP_EXCEEDED',
      'action_name', v_action, 'day_utc', v_day,
      'cap_wei', v_cap::text, 'reserved_wei', v_reserved::text,
      'remaining_wei', greatest(v_cap - v_reserved, 0)::text,
      'requested_wei', v_amount::text
    );
  END IF;

  UPDATE public.pplp_daily_action_mint
  SET reserved_wei = v_new, reserve_count = reserve_count + 1
  WHERE action_name = v_action AND day_utc = v_day;

  RETURN jsonb_build_object(
    'ok', true, 'action_name', v_action, 'day_utc', v_day,
    'reserved_wei', v_new::text,
    'remaining_wei', (v_cap - v_new)::text,
    'source', coalesce(p_source, 'auto')
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.pplp_release_daily_mint(
  p_action_name text,
  p_amount_wei numeric,
  p_source text DEFAULT 'auto'
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_role text := coalesce(nullif(current_setting('role', true), ''), session_user);
  v_day date := (now() AT TIME ZONE 'utc')::date;
  v_action text := coalesce(nullif(p_action_name, ''), 'FUN_REWARD');
  v_amount numeric := coalesce(p_amount_wei, 0);
  v_reserved numeric;
BEGIN
  IF v_role IN ('anon') THEN
    RAISE EXCEPTION 'FORBIDDEN: anonymous cannot release mint cap';
  END IF;
  IF v_role = 'authenticated' AND NOT public.has_role(auth.uid(), 'admin'::app_role) THEN
    RAISE EXCEPTION 'FORBIDDEN: admin only';
  END IF;
  IF v_amount <= 0 THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'INVALID_AMOUNT');
  END IF;

  UPDATE public.pplp_daily_action_mint
  SET reserved_wei = greatest(reserved_wei - v_amount, 0),
      release_count = release_count + 1
  WHERE action_name = v_action AND day_utc = v_day
  RETURNING reserved_wei INTO v_reserved;

  IF v_reserved IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'NO_ROW');
  END IF;

  RETURN jsonb_build_object('ok', true, 'action_name', v_action, 'day_utc', v_day,
    'reserved_wei', v_reserved::text, 'source', coalesce(p_source, 'auto'));
END;
$$;

REVOKE ALL ON FUNCTION public.pplp_reserve_daily_mint(text, numeric, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.pplp_release_daily_mint(text, numeric, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.pplp_reserve_daily_mint(text, numeric, text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.pplp_release_daily_mint(text, numeric, text) TO authenticated, service_role;

-- Backfill hôm nay từ các mint đã confirmed để không cấp vượt trần trong ngày.
INSERT INTO public.pplp_daily_action_mint (action_name, day_utc, reserved_wei, reserve_count)
SELECT coalesce(nullif(action_name, ''), 'FUN_REWARD') AS action_name,
       (now() AT TIME ZONE 'utc')::date,
       sum(coalesce(amount_wei, '0')::numeric),
       count(*)
FROM public.pplp_mint_requests
WHERE status = 'confirmed'
  AND confirmed_at >= date_trunc('day', now() AT TIME ZONE 'utc')
GROUP BY 1
ON CONFLICT (action_name, day_utc) DO UPDATE
  SET reserved_wei = greatest(public.pplp_daily_action_mint.reserved_wei, EXCLUDED.reserved_wei);

-- =========================================================
-- B3-03: khoá điểm tại lần chấm đầu + giám sát sửa sau chấm
-- =========================================================
ALTER TABLE public.posts
  ADD COLUMN IF NOT EXISTS scored_at timestamptz,
  ADD COLUMN IF NOT EXISTS scored_content_hash text;

CREATE TABLE IF NOT EXISTS public.post_edit_after_score_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  post_id uuid NOT NULL,
  user_id uuid,
  scored_at timestamptz,
  old_hash text,
  new_hash text,
  old_length integer,
  new_length integer,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.post_edit_after_score_log TO authenticated;
GRANT ALL ON public.post_edit_after_score_log TO service_role;
ALTER TABLE public.post_edit_after_score_log ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admins can view post edit after score log" ON public.post_edit_after_score_log;
CREATE POLICY "Admins can view post edit after score log"
ON public.post_edit_after_score_log FOR SELECT TO authenticated
USING (public.has_role(auth.uid(), 'admin'::app_role));

CREATE INDEX IF NOT EXISTS idx_post_edit_after_score_created
  ON public.post_edit_after_score_log (created_at DESC);

-- Trigger: đóng dấu lần chấm đầu + khoá điểm khi sửa nội dung sau chấm
CREATE OR REPLACE FUNCTION public.posts_lock_score_on_edit()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_new_hash text := md5(coalesce(NEW.content, ''));
BEGIN
  -- 1) Đóng dấu lần chấm đầu tiên (khi is_reward_eligible được set khác NULL)
  IF NEW.scored_at IS NULL AND NEW.is_reward_eligible IS NOT NULL THEN
    NEW.scored_at := now();
    NEW.scored_content_hash := v_new_hash;
    RETURN NEW;
  END IF;

  -- 2) Đã chấm rồi: điểm/eligibility bị khoá, sửa nội dung không đổi kết quả
  IF OLD.scored_at IS NOT NULL THEN
    NEW.is_reward_eligible := OLD.is_reward_eligible;
    NEW.scored_at := OLD.scored_at;
    NEW.scored_content_hash := OLD.scored_content_hash;

    IF v_new_hash IS DISTINCT FROM md5(coalesce(OLD.content, '')) THEN
      INSERT INTO public.post_edit_after_score_log
        (post_id, user_id, scored_at, old_hash, new_hash, old_length, new_length)
      VALUES (OLD.id, OLD.user_id, OLD.scored_at,
              md5(coalesce(OLD.content, '')), v_new_hash,
              length(coalesce(OLD.content, '')), length(coalesce(NEW.content, '')));
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_posts_lock_score_on_edit ON public.posts;
CREATE TRIGGER trg_posts_lock_score_on_edit
BEFORE UPDATE ON public.posts
FOR EACH ROW EXECUTE FUNCTION public.posts_lock_score_on_edit();

-- Backfill mốc chấm cho bài đã chấm trước đây (không đổi điểm)
UPDATE public.posts
SET scored_at = coalesce(updated_at, created_at),
    scored_content_hash = md5(coalesce(content, ''))
WHERE is_reward_eligible IS NOT NULL AND scored_at IS NULL;

-- Giám sát: tỉ lệ sửa-sau-chấm vượt ngưỡng → notify admin (dedupe theo ngày)
CREATE OR REPLACE FUNCTION public.pplp_post_edit_after_score_check(
  p_min_events integer DEFAULT 20,
  p_max_rate numeric DEFAULT 0.05
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_role text := coalesce(nullif(current_setting('role', true), ''), session_user);
  v_since timestamptz := now() - interval '24 hours';
  v_events integer;
  v_scored integer;
  v_rate numeric;
  v_day date := (now() AT TIME ZONE 'utc')::date;
  v_notified integer := 0;
BEGIN
  IF v_role = 'anon' THEN
    RAISE EXCEPTION 'FORBIDDEN';
  END IF;
  IF v_role = 'authenticated' AND NOT public.has_role(auth.uid(), 'admin'::app_role) THEN
    RAISE EXCEPTION 'FORBIDDEN: admin only';
  END IF;

  SELECT count(*) INTO v_events FROM public.post_edit_after_score_log WHERE created_at >= v_since;
  SELECT greatest(count(*), 1) INTO v_scored FROM public.posts WHERE scored_at >= v_since;
  v_rate := v_events::numeric / v_scored::numeric;

  IF v_events >= p_min_events AND v_rate > p_max_rate THEN
    INSERT INTO public.notifications (user_id, type, title, message, link)
    SELECT ur.user_id, 'system_alert',
           'Cảnh báo: sửa bài sau khi đã chấm điểm tăng bất thường',
           format('24h qua: %s lượt sửa sau chấm / %s bài được chấm (%s%%), vượt ngưỡng %s%%.',
                  v_events, v_scored, round(v_rate * 100, 2), round(p_max_rate * 100, 2)),
           '/admin'
    FROM public.user_roles ur
    WHERE ur.role = 'admin'::app_role
      AND NOT EXISTS (
        SELECT 1 FROM public.notifications n
        WHERE n.user_id = ur.user_id
          AND n.type = 'system_alert'
          AND n.title = 'Cảnh báo: sửa bài sau khi đã chấm điểm tăng bất thường'
          AND n.created_at >= v_day::timestamptz
      );
    v_notified := 1;
  END IF;

  RETURN jsonb_build_object(
    'events_24h', v_events, 'scored_24h', v_scored,
    'rate', round(v_rate, 4), 'threshold', p_max_rate,
    'min_events', p_min_events, 'notified', v_notified
  );
END;
$$;

REVOKE ALL ON FUNCTION public.pplp_post_edit_after_score_check(integer, numeric) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.pplp_post_edit_after_score_check(integer, numeric) TO authenticated, service_role;
-- Trigger function: thưởng friend cho cả 2 bên khi friendship chuyển sang accepted
CREATE OR REPLACE FUNCTION public.reward_friendship_accepted()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_today_start_utc timestamptz;
  v_today_end_utc   timestamptz;
  v_count_sender    int;
  v_count_receiver  int;
  v_base_reward     numeric := 20;
  v_daily_cap       int     := 10;
BEGIN
  IF NEW.status <> 'accepted' THEN
    RETURN NEW;
  END IF;
  IF TG_OP = 'UPDATE' AND OLD.status = 'accepted' THEN
    RETURN NEW;
  END IF;

  v_today_start_utc := date_trunc('day', (now() AT TIME ZONE 'Asia/Ho_Chi_Minh'))
                       AT TIME ZONE 'Asia/Ho_Chi_Minh';
  v_today_end_utc   := v_today_start_utc + interval '1 day';

  -- Sender (NEW.user_id)
  SELECT COUNT(*) INTO v_count_sender
  FROM public.light_actions
  WHERE actor_id = NEW.user_id
    AND action_type = 'friend'
    AND created_at >= v_today_start_utc
    AND created_at <  v_today_end_utc;

  IF v_count_sender < v_daily_cap AND NOT EXISTS (
    SELECT 1 FROM public.light_actions
    WHERE action_type = 'friend'
      AND actor_id = NEW.user_id
      AND reference_id = NEW.friend_id
  ) THEN
    INSERT INTO public.light_actions
      (actor_id, user_id, action_type, reference_id, light_score, mint_amount, created_at)
    VALUES
      (NEW.user_id, NEW.user_id, 'friend', NEW.friend_id, v_base_reward, 0, now());
  END IF;

  -- Receiver (NEW.friend_id)
  SELECT COUNT(*) INTO v_count_receiver
  FROM public.light_actions
  WHERE actor_id = NEW.friend_id
    AND action_type = 'friend'
    AND created_at >= v_today_start_utc
    AND created_at <  v_today_end_utc;

  IF v_count_receiver < v_daily_cap AND NOT EXISTS (
    SELECT 1 FROM public.light_actions
    WHERE action_type = 'friend'
      AND actor_id = NEW.friend_id
      AND reference_id = NEW.user_id
  ) THEN
    INSERT INTO public.light_actions
      (actor_id, user_id, action_type, reference_id, light_score, mint_amount, created_at)
    VALUES
      (NEW.friend_id, NEW.friend_id, 'friend', NEW.user_id, v_base_reward, 0, now());
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_reward_friendship_accepted ON public.friendships;

CREATE TRIGGER trg_reward_friendship_accepted
AFTER INSERT OR UPDATE OF status ON public.friendships
FOR EACH ROW
WHEN (NEW.status = 'accepted')
EXECUTE FUNCTION public.reward_friendship_accepted();

-- Backfill 30 ngày qua: sender thiếu
INSERT INTO public.light_actions
  (actor_id, user_id, action_type, reference_id, light_score, mint_amount, created_at)
SELECT f.user_id, f.user_id, 'friend', f.friend_id, 20, 0, COALESCE(f.updated_at, f.created_at)
FROM public.friendships f
WHERE f.status = 'accepted'
  AND COALESCE(f.updated_at, f.created_at) > now() - interval '30 days'
  AND NOT EXISTS (
    SELECT 1 FROM public.light_actions la
    WHERE la.action_type = 'friend'
      AND la.actor_id = f.user_id
      AND la.reference_id = f.friend_id
  );

-- Backfill 30 ngày qua: receiver thiếu
INSERT INTO public.light_actions
  (actor_id, user_id, action_type, reference_id, light_score, mint_amount, created_at)
SELECT f.friend_id, f.friend_id, 'friend', f.user_id, 20, 0, COALESCE(f.updated_at, f.created_at)
FROM public.friendships f
WHERE f.status = 'accepted'
  AND COALESCE(f.updated_at, f.created_at) > now() - interval '30 days'
  AND NOT EXISTS (
    SELECT 1 FROM public.light_actions la
    WHERE la.action_type = 'friend'
      AND la.actor_id = f.friend_id
      AND la.reference_id = f.user_id
  );
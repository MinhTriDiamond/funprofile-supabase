-- 1) Cập nhật function: chỉ reward sender
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
  v_base_reward     numeric := 20;
  v_daily_cap       int     := 10;
BEGIN
  IF NEW.status <> 'accepted' THEN RETURN NEW; END IF;
  IF TG_OP = 'UPDATE' AND OLD.status = 'accepted' THEN RETURN NEW; END IF;

  v_today_start_utc := date_trunc('day', (now() AT TIME ZONE 'Asia/Ho_Chi_Minh'))
                       AT TIME ZONE 'Asia/Ho_Chi_Minh';
  v_today_end_utc   := v_today_start_utc + interval '1 day';

  -- CHỈ reward sender (NEW.user_id - người tạo bản ghi friendships, tức người gửi lời mời)
  SELECT COUNT(*) INTO v_count_sender
  FROM light_actions
  WHERE actor_id = NEW.user_id AND action_type='friend'
    AND created_at >= v_today_start_utc AND created_at < v_today_end_utc;

  IF v_count_sender < v_daily_cap AND NOT EXISTS (
       SELECT 1 FROM light_actions
       WHERE action_type='friend'
         AND actor_id = NEW.user_id
         AND reference_id = NEW.friend_id
     ) THEN
    INSERT INTO light_actions (actor_id, user_id, action_type, reference_id, light_score, mint_amount, created_at)
    VALUES (NEW.user_id, NEW.user_id, 'friend', NEW.friend_id, v_base_reward, 0, now());
  END IF;

  RETURN NEW;
END;
$$;

-- 2) Gỡ light_actions đã cấp sai cho receiver
-- Receiver = light_action có (actor_id, reference_id) khớp với friendship mà actor_id = friend_id (không phải user_id/sender)
DELETE FROM light_actions la
WHERE la.action_type = 'friend'
  AND la.mint_amount = 0
  AND la.light_score = 20
  AND EXISTS (
    SELECT 1 FROM friendships f
    WHERE f.status = 'accepted'
      AND f.friend_id = la.actor_id
      AND f.user_id = la.reference_id
  );

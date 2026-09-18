
-- RPC function to batch ban ghost users (no avatar, no name, no activity)
CREATE OR REPLACE FUNCTION public.batch_ban_ghost_users(user_ids uuid[], admin_id uuid)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  banned_count integer := 0;
  uid uuid;
BEGIN
  -- Verify caller is admin
  IF NOT has_role(admin_id, 'admin') THEN
    RAISE EXCEPTION 'Unauthorized: admin role required';
  END IF;

  FOREACH uid IN ARRAY user_ids LOOP
    -- Ban and reset rewards
    UPDATE profiles SET
      is_banned = true,
      pending_reward = 0,
      approved_reward = 0,
      reward_status = 'banned',
      admin_notes = 'Tài khoản ảo - bị cấm tự động bởi admin'
    WHERE id = uid AND is_banned = false;

    IF FOUND THEN
      banned_count := banned_count + 1;
      
      -- Log audit
      INSERT INTO audit_logs (admin_id, target_user_id, action, reason)
      VALUES (admin_id, uid, 'batch_ban_ghost', 'Ghost account cleanup');
    END IF;
  END LOOP;

  RETURN banned_count;
END;
$$;

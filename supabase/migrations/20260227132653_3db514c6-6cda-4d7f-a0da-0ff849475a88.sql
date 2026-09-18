
CREATE OR REPLACE FUNCTION public.unban_user(p_admin_id uuid, p_user_id uuid, p_reason text DEFAULT 'Admin đã mở khóa tài khoản'::text)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $$
BEGIN
  -- Check admin role
  IF NOT public.has_role(p_admin_id, 'admin') THEN
    RAISE EXCEPTION 'Only admins can unban users';
  END IF;
  
  -- Update profile - unban
  UPDATE profiles SET 
    is_banned = false,
    banned_at = NULL,
    ban_reason = NULL,
    reward_status = 'approved'
  WHERE id = p_user_id AND is_banned = true;
  
  IF NOT FOUND THEN
    RAISE EXCEPTION 'User not found or not banned';
  END IF;
  
  -- Remove wallet from blacklist (only wallets linked to this user)
  DELETE FROM blacklisted_wallets WHERE user_id = p_user_id;
  
  -- Log the action
  INSERT INTO audit_logs (admin_id, action, target_user_id, reason)
  VALUES (p_admin_id, 'UNBAN_USER', p_user_id, p_reason);
  
  -- Notify user
  INSERT INTO notifications (user_id, actor_id, type)
  VALUES (p_user_id, p_admin_id, 'account_unbanned');
  
  RETURN true;
END;
$$;

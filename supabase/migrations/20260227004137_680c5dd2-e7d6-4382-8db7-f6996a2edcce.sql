
CREATE OR REPLACE FUNCTION public.ban_user_permanently(p_admin_id uuid, p_user_id uuid, p_reason text DEFAULT 'Lạm dụng hệ thống'::text)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $$
DECLARE
  v_wallet text;
BEGIN
  -- Check admin role
  IF NOT public.has_role(p_admin_id, 'admin') THEN
    RAISE EXCEPTION 'Only admins can ban users';
  END IF;
  
  -- Get user wallet
  SELECT wallet_address INTO v_wallet FROM profiles WHERE id = p_user_id;
  
  -- Update profile - ban nhưng KHÔNG reset rewards (giữ nguyên số liệu)
  UPDATE profiles SET 
    is_banned = true,
    banned_at = now(),
    ban_reason = p_reason
  WHERE id = p_user_id;
  
  -- Blacklist wallet if exists
  IF v_wallet IS NOT NULL AND v_wallet != '' THEN
    INSERT INTO blacklisted_wallets (wallet_address, reason, is_permanent, user_id, created_by)
    VALUES (lower(v_wallet), p_reason, true, p_user_id, p_admin_id)
    ON CONFLICT (wallet_address) DO NOTHING;
  END IF;
  
  -- Auto-reject all pending mint requests
  UPDATE pplp_mint_requests
  SET status = 'rejected',
      error_message = 'User banned: ' || p_reason,
      reviewed_by = p_admin_id,
      reviewed_at = now()
  WHERE user_id = p_user_id
    AND status IN ('pending', 'pending_sig', 'signing');
  
  -- Log the action
  INSERT INTO audit_logs (admin_id, action, target_user_id, reason)
  VALUES (p_admin_id, 'BAN_USER_PERMANENT', p_user_id, p_reason);
  
  -- Create notification for the user
  INSERT INTO notifications (user_id, actor_id, type)
  VALUES (p_user_id, p_admin_id, 'account_banned');
  
  RETURN true;
END;
$$;

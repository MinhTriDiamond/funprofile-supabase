-- Create blacklisted_wallets table
CREATE TABLE IF NOT EXISTS public.blacklisted_wallets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  wallet_address text NOT NULL UNIQUE,
  user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  reason text NOT NULL DEFAULT 'Lạm dụng hệ thống',
  is_permanent boolean NOT NULL DEFAULT true,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL
);

-- Enable RLS on blacklisted_wallets
ALTER TABLE public.blacklisted_wallets ENABLE ROW LEVEL SECURITY;

-- RLS policies for blacklisted_wallets
CREATE POLICY "Only admins can view blacklisted wallets" 
ON public.blacklisted_wallets 
FOR SELECT 
USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Only admins can insert blacklisted wallets" 
ON public.blacklisted_wallets 
FOR INSERT 
WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Only admins can delete blacklisted wallets" 
ON public.blacklisted_wallets 
FOR DELETE 
USING (public.has_role(auth.uid(), 'admin'));

-- Create reward_approvals table for tracking approval history
CREATE TABLE IF NOT EXISTS public.reward_approvals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  admin_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE SET NULL,
  amount bigint NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
  admin_note text,
  reviewed_at timestamp with time zone DEFAULT now(),
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

-- Enable RLS on reward_approvals
ALTER TABLE public.reward_approvals ENABLE ROW LEVEL SECURITY;

-- RLS policies for reward_approvals
CREATE POLICY "Admins can view all approvals" 
ON public.reward_approvals 
FOR SELECT 
USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Users can view their own approvals" 
ON public.reward_approvals 
FOR SELECT 
USING (auth.uid() = user_id);

CREATE POLICY "Only admins can insert approvals" 
ON public.reward_approvals 
FOR INSERT 
WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- Add pending_reward and approved_reward columns to profiles if not exist
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'profiles' AND column_name = 'pending_reward') THEN
    ALTER TABLE public.profiles ADD COLUMN pending_reward bigint NOT NULL DEFAULT 0;
  END IF;
  
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'profiles' AND column_name = 'approved_reward') THEN
    ALTER TABLE public.profiles ADD COLUMN approved_reward bigint NOT NULL DEFAULT 0;
  END IF;
  
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'profiles' AND column_name = 'wallet_address') THEN
    ALTER TABLE public.profiles ADD COLUMN wallet_address text;
  END IF;
  
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'profiles' AND column_name = 'ban_reason') THEN
    ALTER TABLE public.profiles ADD COLUMN ban_reason text;
  END IF;
  
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'profiles' AND column_name = 'banned_at') THEN
    ALTER TABLE public.profiles ADD COLUMN banned_at timestamp with time zone;
  END IF;
END $$;

-- Create function to ban user permanently
CREATE OR REPLACE FUNCTION public.ban_user_permanently(
  p_admin_id uuid, 
  p_user_id uuid, 
  p_reason text DEFAULT 'Lạm dụng hệ thống'
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
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
  
  -- Update profile - ban, reset rewards
  UPDATE profiles SET 
    is_banned = true,
    banned_at = now(),
    ban_reason = p_reason,
    pending_reward = 0,
    approved_reward = 0
  WHERE id = p_user_id;
  
  -- Blacklist wallet if exists
  IF v_wallet IS NOT NULL AND v_wallet != '' THEN
    INSERT INTO blacklisted_wallets (wallet_address, reason, is_permanent, user_id, created_by)
    VALUES (lower(v_wallet), p_reason, true, p_user_id, p_admin_id)
    ON CONFLICT (wallet_address) DO NOTHING;
  END IF;
  
  -- Log the action
  INSERT INTO audit_logs (admin_id, action, target_user_id, reason)
  VALUES (p_admin_id, 'BAN_USER_PERMANENT', p_user_id, p_reason);
  
  -- Create notification for the user
  INSERT INTO notifications (user_id, actor_id, type)
  VALUES (p_user_id, p_admin_id, 'account_banned');
  
  RETURN true;
END;
$$;

-- Create function to approve user reward
CREATE OR REPLACE FUNCTION public.approve_user_reward(
  p_user_id uuid, 
  p_admin_id uuid, 
  p_note text DEFAULT NULL
)
RETURNS bigint
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_pending_amount bigint;
BEGIN
  -- Check admin role
  IF NOT public.has_role(p_admin_id, 'admin') THEN
    RAISE EXCEPTION 'Only admins can approve rewards';
  END IF;

  SELECT pending_reward INTO v_pending_amount FROM profiles WHERE id = p_user_id;
  
  IF v_pending_amount IS NULL OR v_pending_amount <= 0 THEN
    RAISE EXCEPTION 'No pending reward to approve';
  END IF;
  
  -- Move pending → approved
  UPDATE profiles SET 
    pending_reward = 0,
    approved_reward = COALESCE(approved_reward, 0) + v_pending_amount,
    reward_status = 'approved'
  WHERE id = p_user_id;
  
  -- Record approval
  INSERT INTO reward_approvals (user_id, amount, status, admin_id, admin_note, reviewed_at)
  VALUES (p_user_id, v_pending_amount, 'approved', p_admin_id, p_note, now());
  
  -- Log the action
  INSERT INTO audit_logs (admin_id, action, target_user_id, reason, details)
  VALUES (p_admin_id, 'APPROVE_REWARD', p_user_id, p_note, jsonb_build_object('amount', v_pending_amount));
  
  -- Notify user
  INSERT INTO notifications (user_id, actor_id, type)
  VALUES (p_user_id, p_admin_id, 'reward_approved');
  
  RETURN v_pending_amount;
END;
$$;

-- Create function to reject user reward
CREATE OR REPLACE FUNCTION public.reject_user_reward(
  p_user_id uuid, 
  p_admin_id uuid, 
  p_note text DEFAULT NULL
)
RETURNS bigint
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_pending_amount bigint;
BEGIN
  -- Check admin role
  IF NOT public.has_role(p_admin_id, 'admin') THEN
    RAISE EXCEPTION 'Only admins can reject rewards';
  END IF;

  SELECT pending_reward INTO v_pending_amount FROM profiles WHERE id = p_user_id;
  
  -- Reset pending to 0
  UPDATE profiles SET 
    pending_reward = 0,
    reward_status = 'rejected'
  WHERE id = p_user_id;
  
  -- Record rejection
  INSERT INTO reward_approvals (user_id, amount, status, admin_id, admin_note, reviewed_at)
  VALUES (p_user_id, v_pending_amount, 'rejected', p_admin_id, p_note, now());
  
  -- Log the action
  INSERT INTO audit_logs (admin_id, action, target_user_id, reason, details)
  VALUES (p_admin_id, 'REJECT_REWARD', p_user_id, p_note, jsonb_build_object('amount', v_pending_amount));
  
  -- Notify user gently
  INSERT INTO notifications (user_id, actor_id, type)
  VALUES (p_user_id, p_admin_id, 'reward_rejected');
  
  RETURN v_pending_amount;
END;
$$;

-- Insert default admin role for the specified user (70640edc-337f-4e89-bd7e-9501bd79ec9f)
INSERT INTO public.user_roles (user_id, role)
VALUES ('70640edc-337f-4e89-bd7e-9501bd79ec9f', 'admin')
ON CONFLICT (user_id, role) DO NOTHING;
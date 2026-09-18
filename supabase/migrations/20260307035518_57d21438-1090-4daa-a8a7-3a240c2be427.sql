
-- Add has_password column to profiles
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS has_password boolean DEFAULT false;

-- Create account_activity_logs table
CREATE TABLE public.account_activity_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  action TEXT NOT NULL,
  details JSONB,
  ip_address TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.account_activity_logs ENABLE ROW LEVEL SECURITY;

-- User xem log của mình
CREATE POLICY "Users view own logs" ON public.account_activity_logs
  FOR SELECT TO authenticated USING (user_id = auth.uid());

-- Client insert CHỈ cho action ít nhạy cảm
CREATE POLICY "Users insert safe actions" ON public.account_activity_logs
  FOR INSERT TO authenticated 
  WITH CHECK (
    user_id = auth.uid() 
    AND action IN ('email_link_started', 'email_link_verification_sent', 'wallet_link_started')
  );

-- Admin xem tất cả
CREATE POLICY "Admins view all logs" ON public.account_activity_logs
  FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'));

-- Create RPC for trusted server-side log insert (for sensitive actions)
CREATE OR REPLACE FUNCTION public.log_security_action(
  p_user_id UUID,
  p_action TEXT,
  p_details JSONB DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Only allow known sensitive actions
  IF p_action NOT IN ('password_set', 'wallet_link_succeeded', 'wallet_link_failed', 'email_link_verified') THEN
    RAISE EXCEPTION 'Unknown security action: %', p_action;
  END IF;
  
  INSERT INTO public.account_activity_logs (user_id, action, details)
  VALUES (p_user_id, p_action, p_details);
END;
$$;

-- Index for quick lookups
CREATE INDEX IF NOT EXISTS idx_account_activity_logs_user_id ON public.account_activity_logs(user_id);
CREATE INDEX IF NOT EXISTS idx_account_activity_logs_action ON public.account_activity_logs(action);

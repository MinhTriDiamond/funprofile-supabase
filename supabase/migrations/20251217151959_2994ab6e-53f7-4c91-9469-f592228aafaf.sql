-- Add ban/restrict fields to profiles
ALTER TABLE public.profiles 
ADD COLUMN IF NOT EXISTS is_banned boolean NOT NULL DEFAULT false,
ADD COLUMN IF NOT EXISTS is_restricted boolean NOT NULL DEFAULT false;

-- Create audit_logs table for tracking all admin actions
CREATE TABLE IF NOT EXISTS public.audit_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  admin_id uuid NOT NULL REFERENCES auth.users(id),
  action text NOT NULL,
  target_user_id uuid REFERENCES auth.users(id),
  details jsonb,
  reason text,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

-- Enable RLS on audit_logs
ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;

-- Only admins can view audit logs
CREATE POLICY "Only admins can view audit logs"
ON public.audit_logs
FOR SELECT
USING (public.has_role(auth.uid(), 'admin'));

-- Only admins can insert audit logs
CREATE POLICY "Only admins can insert audit logs"
ON public.audit_logs
FOR INSERT
WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- Create reward_adjustments table to track manual reward changes
CREATE TABLE IF NOT EXISTS public.reward_adjustments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id),
  admin_id uuid NOT NULL REFERENCES auth.users(id),
  amount bigint NOT NULL,
  reason text NOT NULL,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

-- Enable RLS on reward_adjustments
ALTER TABLE public.reward_adjustments ENABLE ROW LEVEL SECURITY;

-- Users can view their own adjustments, admins can view all
CREATE POLICY "Users can view their own adjustments"
ON public.reward_adjustments
FOR SELECT
USING (auth.uid() = user_id OR public.has_role(auth.uid(), 'admin'));

-- Only admins can insert adjustments
CREATE POLICY "Only admins can insert adjustments"
ON public.reward_adjustments
FOR INSERT
WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- Insert default admin role for the specified user (if not exists)
INSERT INTO public.user_roles (user_id, role)
VALUES ('70640edc-337f-4e89-bd7e-9501bd79ec9f', 'admin')
ON CONFLICT (user_id, role) DO NOTHING;

-- Create index for faster queries
CREATE INDEX IF NOT EXISTS idx_audit_logs_admin_id ON public.audit_logs(admin_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_target_user_id ON public.audit_logs(target_user_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_created_at ON public.audit_logs(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_reward_adjustments_user_id ON public.reward_adjustments(user_id);
CREATE INDEX IF NOT EXISTS idx_profiles_is_banned ON public.profiles(is_banned);
CREATE INDEX IF NOT EXISTS idx_profiles_is_restricted ON public.profiles(is_restricted);
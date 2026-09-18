
-- Create login_ip_logs table for IP tracking
CREATE TABLE public.login_ip_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  ip_address text NOT NULL,
  user_agent text,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.login_ip_logs ENABLE ROW LEVEL SECURITY;

-- Admin can read
CREATE POLICY "Admins can view login IP logs"
ON public.login_ip_logs
FOR SELECT
TO authenticated
USING (public.has_role(auth.uid(), 'admin'));

-- Service role can insert
CREATE POLICY "Service role can insert IP logs"
ON public.login_ip_logs
FOR ALL
USING (auth.role() = 'service_role')
WITH CHECK (auth.role() = 'service_role');

-- Index for efficient queries
CREATE INDEX idx_login_ip_logs_user_id ON public.login_ip_logs(user_id);
CREATE INDEX idx_login_ip_logs_ip_address ON public.login_ip_logs(ip_address);
CREATE INDEX idx_login_ip_logs_created_at ON public.login_ip_logs(created_at DESC);

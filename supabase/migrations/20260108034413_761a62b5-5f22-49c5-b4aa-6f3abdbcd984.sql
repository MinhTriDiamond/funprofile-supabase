-- Create pending_provisions table for tracking accounts waiting for password set
CREATE TABLE public.pending_provisions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email text NOT NULL,
  fun_profile_id uuid,
  merge_request_id uuid REFERENCES public.account_merge_requests(id) ON DELETE SET NULL,
  platform_id text NOT NULL,
  platform_user_id text,
  platform_data jsonb DEFAULT '{}',
  password_token_hash text NOT NULL,
  token_expires_at timestamp with time zone NOT NULL,
  status text DEFAULT 'pending' CHECK (status IN ('pending', 'completed', 'expired')),
  completed_at timestamp with time zone,
  created_at timestamp with time zone DEFAULT now(),
  UNIQUE(email)
);

-- Indexes for performance
CREATE INDEX idx_pending_provisions_token ON public.pending_provisions(password_token_hash);
CREATE INDEX idx_pending_provisions_status ON public.pending_provisions(status);
CREATE INDEX idx_pending_provisions_email ON public.pending_provisions(email);

-- Enable RLS
ALTER TABLE public.pending_provisions ENABLE ROW LEVEL SECURITY;

-- Only service role can access this table (edge functions)
CREATE POLICY "Service role only" ON public.pending_provisions
  FOR ALL USING (false);

-- Add new columns to account_merge_requests
ALTER TABLE public.account_merge_requests 
ADD COLUMN IF NOT EXISTS auto_provisioned boolean DEFAULT false,
ADD COLUMN IF NOT EXISTS provision_status text DEFAULT NULL;
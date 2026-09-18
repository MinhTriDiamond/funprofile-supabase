
CREATE TABLE IF NOT EXISTS public.email_confirm_tokens (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  email text NOT NULL,
  token text NOT NULL UNIQUE,
  expires_at timestamptz NOT NULL,
  used_at timestamptz,
  request_ip text,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT ALL ON public.email_confirm_tokens TO service_role;
ALTER TABLE public.email_confirm_tokens ENABLE ROW LEVEL SECURITY;
CREATE POLICY "no_direct_access_confirm_tokens" ON public.email_confirm_tokens FOR ALL TO authenticated USING (false) WITH CHECK (false);
CREATE INDEX IF NOT EXISTS idx_email_confirm_tokens_user ON public.email_confirm_tokens(user_id);
CREATE INDEX IF NOT EXISTS idx_email_confirm_tokens_expires ON public.email_confirm_tokens(expires_at);

CREATE TABLE IF NOT EXISTS public.password_reset_tokens (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  email text NOT NULL,
  token text NOT NULL UNIQUE,
  expires_at timestamptz NOT NULL,
  used_at timestamptz,
  request_ip text,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT ALL ON public.password_reset_tokens TO service_role;
ALTER TABLE public.password_reset_tokens ENABLE ROW LEVEL SECURITY;
CREATE POLICY "no_direct_access_reset_tokens" ON public.password_reset_tokens FOR ALL TO authenticated USING (false) WITH CHECK (false);
CREATE INDEX IF NOT EXISTS idx_password_reset_tokens_user ON public.password_reset_tokens(user_id);
CREATE INDEX IF NOT EXISTS idx_password_reset_tokens_expires ON public.password_reset_tokens(expires_at);

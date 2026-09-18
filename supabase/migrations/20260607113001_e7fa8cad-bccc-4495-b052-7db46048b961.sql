CREATE TABLE IF NOT EXISTS public.email_delivery_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  provider text NOT NULL DEFAULT 'resend',
  email_type text NOT NULL,
  recipient_masked text NOT NULL,
  recipient_domain text,
  resend_message_id text,
  status text NOT NULL DEFAULT 'pending',
  error_code text,
  error_message text,
  redirect_to text,
  metadata jsonb DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.email_delivery_logs TO authenticated;
GRANT ALL ON public.email_delivery_logs TO service_role;

ALTER TABLE public.email_delivery_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can view email logs"
ON public.email_delivery_logs
FOR SELECT
TO authenticated
USING (public.has_role(auth.uid(), 'admin'));

CREATE INDEX IF NOT EXISTS idx_email_delivery_logs_created_at
  ON public.email_delivery_logs(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_email_delivery_logs_email_type
  ON public.email_delivery_logs(email_type, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_email_delivery_logs_status
  ON public.email_delivery_logs(status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_email_delivery_logs_message_id
  ON public.email_delivery_logs(resend_message_id) WHERE resend_message_id IS NOT NULL;

CREATE TRIGGER trg_email_delivery_logs_updated_at
  BEFORE UPDATE ON public.email_delivery_logs
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
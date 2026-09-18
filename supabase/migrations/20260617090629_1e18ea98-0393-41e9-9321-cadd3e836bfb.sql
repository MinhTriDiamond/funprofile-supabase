
CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE public.app_secrets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text UNIQUE NOT NULL CHECK (name ~ '^[A-Z][A-Z0-9_]{2,127}$'),
  encrypted_value bytea NOT NULL,
  description text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid REFERENCES auth.users(id),
  updated_by uuid REFERENCES auth.users(id)
);

GRANT SELECT ON public.app_secrets TO authenticated;
GRANT ALL ON public.app_secrets TO service_role;

ALTER TABLE public.app_secrets ENABLE ROW LEVEL SECURITY;

CREATE POLICY "admin read app_secrets metadata"
  ON public.app_secrets
  FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "service_role manage app_secrets"
  ON public.app_secrets
  FOR ALL TO service_role
  USING (true) WITH CHECK (true);

CREATE TABLE public.app_secrets_audit (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  secret_name text NOT NULL,
  action text NOT NULL CHECK (action IN ('create','update','delete')),
  actor_id uuid REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.app_secrets_audit TO authenticated;
GRANT ALL ON public.app_secrets_audit TO service_role;

ALTER TABLE public.app_secrets_audit ENABLE ROW LEVEL SECURITY;

CREATE POLICY "admin read app_secrets_audit"
  ON public.app_secrets_audit
  FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "service_role manage app_secrets_audit"
  ON public.app_secrets_audit
  FOR ALL TO service_role
  USING (true) WITH CHECK (true);

CREATE OR REPLACE FUNCTION public.app_secrets_touch_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

CREATE TRIGGER app_secrets_touch
BEFORE UPDATE ON public.app_secrets
FOR EACH ROW EXECUTE FUNCTION public.app_secrets_touch_updated_at();

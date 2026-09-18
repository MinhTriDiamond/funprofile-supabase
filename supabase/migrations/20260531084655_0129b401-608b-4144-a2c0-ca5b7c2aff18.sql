-- B.0: profiles.identity_is_test
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS identity_is_test boolean NOT NULL DEFAULT false;

-- B.4: identity_audit_logs
CREATE TABLE IF NOT EXISTS public.identity_audit_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  subject_user_id uuid NOT NULL,
  actor_type text NOT NULL CHECK (actor_type IN ('webhook','system','admin','user')),
  actor_user_id uuid,
  source text NOT NULL,
  action text NOT NULL,
  old_status text,
  new_status text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.identity_audit_logs TO authenticated;
GRANT ALL ON public.identity_audit_logs TO service_role;

ALTER TABLE public.identity_audit_logs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admins read all identity audit logs" ON public.identity_audit_logs;
CREATE POLICY "Admins read all identity audit logs"
  ON public.identity_audit_logs FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

DROP POLICY IF EXISTS "Subject can read own identity audit logs" ON public.identity_audit_logs;
CREATE POLICY "Subject can read own identity audit logs"
  ON public.identity_audit_logs FOR SELECT TO authenticated
  USING (subject_user_id = auth.uid());

CREATE INDEX IF NOT EXISTS idx_identity_audit_subject
  ON public.identity_audit_logs(subject_user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_identity_audit_source
  ON public.identity_audit_logs(source, created_at DESC);
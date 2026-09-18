CREATE TABLE public.export_audit_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  export_type text NOT NULL CHECK (export_type IN ('excel','pdf','csv')),
  surface text NOT NULL,
  filter_params jsonb NOT NULL DEFAULT '{}'::jsonb,
  row_count integer NOT NULL DEFAULT 0,
  role text NOT NULL DEFAULT 'user' CHECK (role IN ('user','admin')),
  status text NOT NULL DEFAULT 'success' CHECK (status IN ('success','failed','blocked_limit')),
  error_message text,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT ON public.export_audit_logs TO authenticated;
GRANT ALL ON public.export_audit_logs TO service_role;

ALTER TABLE public.export_audit_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "user insert own export log"
  ON public.export_audit_logs FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "user read own export log"
  ON public.export_audit_logs FOR SELECT TO authenticated
  USING (user_id = auth.uid());

CREATE POLICY "admin read all export logs"
  ON public.export_audit_logs FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(),'admin'));

CREATE INDEX idx_export_audit_user_time
  ON public.export_audit_logs (user_id, created_at DESC);

CREATE INDEX idx_export_audit_created
  ON public.export_audit_logs (created_at DESC);
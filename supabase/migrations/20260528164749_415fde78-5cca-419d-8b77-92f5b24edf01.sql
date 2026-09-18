CREATE TABLE public.fun_core_proxy_audit (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_id uuid NOT NULL,
  endpoint text NOT NULL,
  target_user_id uuid NOT NULL,
  upstream_status int,
  success boolean NOT NULL,
  duration_ms int,
  error_code text,
  trace_id text,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.fun_core_proxy_audit TO authenticated;
GRANT ALL ON public.fun_core_proxy_audit TO service_role;

ALTER TABLE public.fun_core_proxy_audit ENABLE ROW LEVEL SECURITY;

CREATE POLICY "admin read fun_core_proxy_audit"
  ON public.fun_core_proxy_audit
  FOR SELECT
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

CREATE INDEX idx_fcpa_created ON public.fun_core_proxy_audit (created_at DESC);
CREATE INDEX idx_fcpa_target ON public.fun_core_proxy_audit (target_user_id);
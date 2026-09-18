
CREATE TABLE public.pplp_recovery_runs (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  approved_by UUID NOT NULL,
  approved_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  status TEXT NOT NULL DEFAULT 'pending',
  max_per_run INT NOT NULL DEFAULT 50,
  total_eligible INT NOT NULL DEFAULT 0,
  total_recovered INT NOT NULL DEFAULT 0,
  total_skipped INT NOT NULL DEFAULT 0,
  reason_filter TEXT NOT NULL DEFAULT 'lockWithPPLP reverted',
  month_filter TEXT NOT NULL,
  notes TEXT,
  last_tick_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT pplp_recovery_runs_status_chk CHECK (status IN ('pending','running','completed','cancelled'))
);

CREATE INDEX idx_pplp_recovery_runs_status ON public.pplp_recovery_runs(status, created_at);

GRANT SELECT, INSERT, UPDATE ON public.pplp_recovery_runs TO authenticated;
GRANT ALL ON public.pplp_recovery_runs TO service_role;

ALTER TABLE public.pplp_recovery_runs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins view recovery runs"
  ON public.pplp_recovery_runs FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins create recovery runs"
  ON public.pplp_recovery_runs FOR INSERT TO authenticated
  WITH CHECK (public.has_role(auth.uid(), 'admin') AND approved_by = auth.uid());

CREATE POLICY "Admins update recovery runs"
  ON public.pplp_recovery_runs FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

CREATE TRIGGER trg_pplp_recovery_runs_updated
  BEFORE UPDATE ON public.pplp_recovery_runs
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

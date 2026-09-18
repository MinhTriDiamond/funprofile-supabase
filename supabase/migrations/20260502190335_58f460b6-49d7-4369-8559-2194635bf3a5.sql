CREATE TABLE IF NOT EXISTS public.admin_repricing_progress (
  job_key TEXT PRIMARY KEY,
  total_initial INTEGER NOT NULL DEFAULT 0,
  total_processed INTEGER NOT NULL DEFAULT 0,
  batches_run INTEGER NOT NULL DEFAULT 0,
  remaining INTEGER NOT NULL DEFAULT 0,
  started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_batch_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  status TEXT NOT NULL DEFAULT 'running',
  cumulative_stats JSONB NOT NULL DEFAULT '{}'::jsonb,
  updated_by UUID,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.admin_repricing_progress ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "admins read repricing progress" ON public.admin_repricing_progress;
CREATE POLICY "admins read repricing progress"
ON public.admin_repricing_progress FOR SELECT
TO authenticated
USING (public.has_role(auth.uid(), 'admin'));

DROP POLICY IF EXISTS "admins write repricing progress" ON public.admin_repricing_progress;
CREATE POLICY "admins write repricing progress"
ON public.admin_repricing_progress FOR ALL
TO authenticated
USING (public.has_role(auth.uid(), 'admin'))
WITH CHECK (public.has_role(auth.uid(), 'admin'));
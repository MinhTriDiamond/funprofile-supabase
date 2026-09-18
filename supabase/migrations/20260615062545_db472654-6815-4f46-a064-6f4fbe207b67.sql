
-- ============================================================
-- FP-2A: Federation Backfill + Event Outbox (schema only)
-- ============================================================

-- 1) federation_sync_jobs
CREATE TABLE public.federation_sync_jobs (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  mode TEXT NOT NULL CHECK (mode IN ('dry_run','run_one','run_batch','retry_failed')),
  scope TEXT NOT NULL DEFAULT 'identity_backfill',
  filters JSONB NOT NULL DEFAULT '{}'::jsonb,
  batch_size INTEGER NOT NULL DEFAULT 1,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','running','paused','stopped','completed','failed')),
  total_count INTEGER NOT NULL DEFAULT 0,
  processed_count INTEGER NOT NULL DEFAULT 0,
  succeeded_count INTEGER NOT NULL DEFAULT 0,
  failed_count INTEGER NOT NULL DEFAULT 0,
  skipped_count INTEGER NOT NULL DEFAULT 0,
  last_error TEXT,
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  started_at TIMESTAMPTZ,
  finished_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.federation_sync_jobs TO authenticated;
GRANT ALL ON public.federation_sync_jobs TO service_role;

ALTER TABLE public.federation_sync_jobs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins manage federation_sync_jobs"
ON public.federation_sync_jobs
FOR ALL
TO authenticated
USING (public.has_role(auth.uid(), 'admin'))
WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE INDEX idx_fed_jobs_status ON public.federation_sync_jobs(status, created_at DESC);

-- 2) federation_sync_logs
CREATE TABLE public.federation_sync_logs (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  job_id UUID NOT NULL REFERENCES public.federation_sync_jobs(id) ON DELETE CASCADE,
  target_user_id UUID,
  platform TEXT NOT NULL DEFAULT 'fun-profile',
  platform_user_id TEXT NOT NULL,
  idempotency_key TEXT NOT NULL,
  trace_id TEXT NOT NULL,
  endpoint TEXT NOT NULL,
  http_method TEXT NOT NULL DEFAULT 'POST',
  http_status INTEGER,
  request_sample JSONB,
  response_sample JSONB,
  attempts INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','ok','failed','skipped')),
  last_error TEXT,
  ecosystem_identity_id TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.federation_sync_logs TO authenticated;
GRANT ALL ON public.federation_sync_logs TO service_role;

ALTER TABLE public.federation_sync_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins manage federation_sync_logs"
ON public.federation_sync_logs
FOR ALL
TO authenticated
USING (public.has_role(auth.uid(), 'admin'))
WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE INDEX idx_fed_logs_job ON public.federation_sync_logs(job_id, created_at DESC);
CREATE INDEX idx_fed_logs_status ON public.federation_sync_logs(status);
CREATE INDEX idx_fed_logs_user ON public.federation_sync_logs(target_user_id);
CREATE UNIQUE INDEX uniq_fed_logs_idem ON public.federation_sync_logs(idempotency_key);

-- 3) fun_profile_event_outbox (schema only — FP-3A sẽ publish)
CREATE TABLE public.fun_profile_event_outbox (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  event_type TEXT NOT NULL CHECK (event_type IN (
    'PLATFORM_USER_CREATED',
    'PROFILE_UPDATED',
    'DID_PROMOTED',
    'SBT_ISSUED',
    'WALLET_LINKED',
    'WALLET_UNLINKED'
  )),
  aggregate_type TEXT NOT NULL DEFAULT 'platform_user',
  aggregate_id TEXT NOT NULL,
  payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','sent','failed','dead')),
  attempts INTEGER NOT NULL DEFAULT 0,
  trace_id TEXT,
  idempotency_key TEXT NOT NULL,
  next_attempt_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  sent_at TIMESTAMPTZ,
  last_error TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.fun_profile_event_outbox TO authenticated;
GRANT ALL ON public.fun_profile_event_outbox TO service_role;

ALTER TABLE public.fun_profile_event_outbox ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins manage fun_profile_event_outbox"
ON public.fun_profile_event_outbox
FOR ALL
TO authenticated
USING (public.has_role(auth.uid(), 'admin'))
WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE UNIQUE INDEX uniq_outbox_idem ON public.fun_profile_event_outbox(idempotency_key);
CREATE INDEX idx_outbox_status_next ON public.fun_profile_event_outbox(status, next_attempt_at);
CREATE INDEX idx_outbox_aggregate ON public.fun_profile_event_outbox(aggregate_type, aggregate_id);

-- updated_at triggers (reuse existing function if available)
CREATE OR REPLACE FUNCTION public.fp2a_touch_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

CREATE TRIGGER trg_fed_jobs_touch
BEFORE UPDATE ON public.federation_sync_jobs
FOR EACH ROW EXECUTE FUNCTION public.fp2a_touch_updated_at();

CREATE TRIGGER trg_fed_logs_touch
BEFORE UPDATE ON public.federation_sync_logs
FOR EACH ROW EXECUTE FUNCTION public.fp2a_touch_updated_at();

CREATE TRIGGER trg_outbox_touch
BEFORE UPDATE ON public.fun_profile_event_outbox
FOR EACH ROW EXECUTE FUNCTION public.fp2a_touch_updated_at();

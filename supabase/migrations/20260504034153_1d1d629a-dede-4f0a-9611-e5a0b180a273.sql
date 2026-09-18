
CREATE TABLE IF NOT EXISTS public.backlog_alert_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  alert_type text NOT NULL CHECK (alert_type IN ('soft_cap_exceeded','eta_threshold_exceeded')),
  action_name text NOT NULL,
  metric_value numeric NOT NULL,
  threshold_value numeric NOT NULL,
  message text NOT NULL,
  dedupe_key text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_backlog_alert_dedupe
  ON public.backlog_alert_events(dedupe_key);

CREATE INDEX IF NOT EXISTS idx_backlog_alert_created_at
  ON public.backlog_alert_events(created_at DESC);

ALTER TABLE public.backlog_alert_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins read backlog alerts"
  ON public.backlog_alert_events FOR SELECT
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins insert backlog alerts"
  ON public.backlog_alert_events FOR INSERT
  TO authenticated
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

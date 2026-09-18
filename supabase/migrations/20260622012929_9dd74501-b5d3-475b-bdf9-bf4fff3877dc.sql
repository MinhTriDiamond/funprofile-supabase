
-- 1) wallet_scan_metrics: 1 dòng / 1 request fetch-wallet-history
CREATE TABLE IF NOT EXISTS public.wallet_scan_metrics (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  scanned_addresses integer NOT NULL DEFAULT 0,
  verified_count integer NOT NULL DEFAULT 0,
  suspicious_count integer NOT NULL DEFAULT 0,
  registry_size integer NOT NULL DEFAULT 0,
  chains text[] NOT NULL DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS wallet_scan_metrics_created_idx
  ON public.wallet_scan_metrics (created_at DESC);

GRANT SELECT ON public.wallet_scan_metrics TO authenticated;
GRANT ALL ON public.wallet_scan_metrics TO service_role;

ALTER TABLE public.wallet_scan_metrics ENABLE ROW LEVEL SECURITY;

CREATE POLICY "wallet_scan_metrics admin read"
  ON public.wallet_scan_metrics FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role));


-- 2) registry_drift_alerts
CREATE TABLE IF NOT EXISTS public.registry_drift_alerts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  window_start timestamptz NOT NULL,
  window_end timestamptz NOT NULL,
  reason text NOT NULL,            -- 'unknown_contract_spike','symbol_collision_spike'...
  event_count integer NOT NULL,
  threshold integer NOT NULL,
  sample_contracts jsonb,          -- [{addr,symbol,count}]
  ack boolean NOT NULL DEFAULT false,
  ack_by uuid REFERENCES auth.users(id),
  ack_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS registry_drift_alerts_created_idx
  ON public.registry_drift_alerts (created_at DESC);
CREATE INDEX IF NOT EXISTS registry_drift_alerts_open_idx
  ON public.registry_drift_alerts (ack, created_at DESC);

GRANT SELECT, UPDATE ON public.registry_drift_alerts TO authenticated;
GRANT ALL ON public.registry_drift_alerts TO service_role;

ALTER TABLE public.registry_drift_alerts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "registry_drift_alerts admin read"
  ON public.registry_drift_alerts FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "registry_drift_alerts admin ack"
  ON public.registry_drift_alerts FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role));


-- 3) RPC tổng hợp Coverage 30 ngày
CREATE OR REPLACE FUNCTION public.tokens_registry_coverage_30d()
RETURNS TABLE (
  total_scans bigint,
  total_verified bigint,
  total_suspicious bigint,
  coverage_pct numeric,
  top_suspicious jsonb,
  by_reason jsonb
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin'::app_role) THEN
    RAISE EXCEPTION 'admin only';
  END IF;

  RETURN QUERY
  WITH m AS (
    SELECT
      COUNT(*)::bigint AS total_scans,
      COALESCE(SUM(verified_count),0)::bigint AS total_verified,
      COALESCE(SUM(suspicious_count),0)::bigint AS total_suspicious
    FROM public.wallet_scan_metrics
    WHERE created_at > now() - interval '30 days'
  ),
  s AS (
    SELECT jsonb_agg(row_to_json(t)) AS top_suspicious
    FROM (
      SELECT
        COALESCE(lower(raw_token_address),'(native)') AS contract,
        raw_symbol,
        COUNT(*)::bigint AS occurrences,
        MAX(last_seen_at) AS last_seen
      FROM public.suspicious_wallet_events
      WHERE last_seen_at > now() - interval '30 days'
      GROUP BY 1, 2
      ORDER BY occurrences DESC
      LIMIT 20
    ) t
  ),
  r AS (
    SELECT jsonb_object_agg(reason, c) AS by_reason
    FROM (
      SELECT reason, COUNT(*)::bigint AS c
      FROM public.suspicious_wallet_events
      WHERE last_seen_at > now() - interval '30 days'
      GROUP BY reason
    ) z
  )
  SELECT
    m.total_scans,
    m.total_verified,
    m.total_suspicious,
    CASE
      WHEN (m.total_verified + m.total_suspicious) = 0 THEN NULL
      ELSE ROUND( (m.total_verified::numeric * 100.0) / (m.total_verified + m.total_suspicious)::numeric, 2)
    END AS coverage_pct,
    COALESCE(s.top_suspicious, '[]'::jsonb),
    COALESCE(r.by_reason, '{}'::jsonb)
  FROM m, s, r;
END;
$$;

REVOKE ALL ON FUNCTION public.tokens_registry_coverage_30d() FROM public, anon;
GRANT EXECUTE ON FUNCTION public.tokens_registry_coverage_30d() TO authenticated;

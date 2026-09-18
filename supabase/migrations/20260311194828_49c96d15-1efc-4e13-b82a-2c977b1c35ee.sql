
-- Sybil cluster tracking table
CREATE TABLE IF NOT EXISTS public.sybil_clusters (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  cluster_type text NOT NULL, -- 'ip', 'device', 'behavioral', 'ai_detected'
  cluster_key text NOT NULL, -- IP address, device hash, or AI-generated cluster ID
  user_ids text[] NOT NULL DEFAULT '{}',
  confidence_score numeric NOT NULL DEFAULT 0, -- 0-100 AI confidence
  risk_level integer NOT NULL DEFAULT 0, -- 0=monitor, 1=flagged, 2=limited, 3=suspended
  ai_analysis jsonb, -- Full AI analysis result
  detection_signals jsonb, -- Raw signals that triggered detection
  last_scanned_at timestamp with time zone DEFAULT now(),
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now(),
  resolved_at timestamp with time zone, -- Admin marked as resolved
  resolved_by uuid,
  admin_notes text
);

-- Enable RLS
ALTER TABLE public.sybil_clusters ENABLE ROW LEVEL SECURITY;

-- Only admins can read/write sybil clusters
CREATE POLICY "Admins can manage sybil clusters" ON public.sybil_clusters
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- Index for efficient lookups
CREATE INDEX IF NOT EXISTS idx_sybil_clusters_risk_level ON public.sybil_clusters(risk_level) WHERE risk_level > 0;
CREATE INDEX IF NOT EXISTS idx_sybil_clusters_type_key ON public.sybil_clusters(cluster_type, cluster_key);
CREATE INDEX IF NOT EXISTS idx_sybil_clusters_last_scanned ON public.sybil_clusters(last_scanned_at);

-- Add new PPLP v2.0 pillar columns to validations
ALTER TABLE public.pplp_v2_validations
  ADD COLUMN IF NOT EXISTS repentance numeric DEFAULT 0,
  ADD COLUMN IF NOT EXISTS gratitude numeric DEFAULT 0,
  ADD COLUMN IF NOT EXISTS service_pillar numeric DEFAULT 0,
  ADD COLUMN IF NOT EXISTS help_pillar numeric DEFAULT 0,
  ADD COLUMN IF NOT EXISTS giving_pillar numeric DEFAULT 0,
  ADD COLUMN IF NOT EXISTS ego_signal numeric DEFAULT 0,
  ADD COLUMN IF NOT EXISTS authenticity numeric DEFAULT 0,
  ADD COLUMN IF NOT EXISTS love_tone numeric DEFAULT 0,
  ADD COLUMN IF NOT EXISTS depth_score numeric DEFAULT 0,
  ADD COLUMN IF NOT EXISTS intent_score numeric DEFAULT 0;

-- Add engagement fields to user actions
ALTER TABLE public.pplp_v2_user_actions
  ADD COLUMN IF NOT EXISTS platform text DEFAULT 'internal',
  ADD COLUMN IF NOT EXISTS metrics jsonb DEFAULT '{}';

-- Create fraud signals table
CREATE TABLE IF NOT EXISTS public.pplp_v2_fraud_signals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  action_id uuid REFERENCES public.pplp_v2_user_actions(id) ON DELETE SET NULL,
  signal_type text NOT NULL CHECK (signal_type IN ('SYBIL', 'BOT', 'SPAM', 'COLLUSION', 'FAKE_ENGAGEMENT')),
  severity numeric NOT NULL DEFAULT 0 CHECK (severity >= 0 AND severity <= 1),
  details jsonb DEFAULT '{}',
  source text NOT NULL DEFAULT 'system',
  resolved boolean DEFAULT false,
  resolved_at timestamptz,
  resolved_by uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.pplp_v2_fraud_signals ENABLE ROW LEVEL SECURITY;

-- Only service role can access fraud signals (internal use)
CREATE POLICY "Service role full access on fraud_signals"
  ON public.pplp_v2_fraud_signals
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- Index for quick lookups
CREATE INDEX IF NOT EXISTS idx_fraud_signals_user ON public.pplp_v2_fraud_signals(user_id);
CREATE INDEX IF NOT EXISTS idx_fraud_signals_type ON public.pplp_v2_fraud_signals(signal_type);
CREATE INDEX IF NOT EXISTS idx_fraud_signals_unresolved ON public.pplp_v2_fraud_signals(resolved) WHERE resolved = false;
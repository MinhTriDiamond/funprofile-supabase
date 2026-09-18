
-- Create user_dimension_scores table for 5 Pillars of Light Score
CREATE TABLE public.user_dimension_scores (
  user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  identity_score NUMERIC DEFAULT 0,
  activity_score NUMERIC DEFAULT 0,
  onchain_score NUMERIC DEFAULT 0,
  transparency_score NUMERIC DEFAULT 100,
  ecosystem_score NUMERIC DEFAULT 0,
  risk_penalty NUMERIC DEFAULT 0,
  streak_bonus_pct NUMERIC DEFAULT 0,
  inactive_days INTEGER DEFAULT 0,
  decay_applied BOOLEAN DEFAULT FALSE,
  total_light_score NUMERIC DEFAULT 0,
  level_name TEXT DEFAULT 'Light Seed',
  computed_at TIMESTAMPTZ DEFAULT now(),
  created_at TIMESTAMPTZ DEFAULT now()
);

-- RLS: users can only read their own dimension scores
ALTER TABLE public.user_dimension_scores ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users read own dimension scores"
  ON public.user_dimension_scores
  FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

-- Service role can insert/update (used by edge function)
CREATE POLICY "Service role can manage dimension scores"
  ON public.user_dimension_scores
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);


-- 1. pet_risk_signals
CREATE TABLE IF NOT EXISTS public.pet_risk_signals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  signal_type text NOT NULL CHECK (signal_type IN ('xp_burst','cheer_loop','self_cheer','box_streak','shop_velocity','device_share','ip_share','tc_low')),
  severity numeric(4,3) NOT NULL DEFAULT 0.2 CHECK (severity >= 0 AND severity <= 1),
  evidence jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_pet_risk_signals_user_created ON public.pet_risk_signals(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_pet_risk_signals_type_created ON public.pet_risk_signals(signal_type, created_at DESC);

ALTER TABLE public.pet_risk_signals ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users view own risk signals"
ON public.pet_risk_signals FOR SELECT
USING (auth.uid() = user_id OR public.has_role(auth.uid(),'admin'));

CREATE POLICY "Admin manage risk signals"
ON public.pet_risk_signals FOR ALL
USING (public.has_role(auth.uid(),'admin'))
WITH CHECK (public.has_role(auth.uid(),'admin'));

-- 2. pet_risk_scores (1 dòng / user)
CREATE TABLE IF NOT EXISTS public.pet_risk_scores (
  user_id uuid PRIMARY KEY,
  risk_score numeric(4,3) NOT NULL DEFAULT 0 CHECK (risk_score >= 0 AND risk_score <= 1),
  risk_tier text NOT NULL DEFAULT 'safe' CHECK (risk_tier IN ('safe','watch','restricted','frozen')),
  signal_count integer NOT NULL DEFAULT 0,
  last_reasons jsonb NOT NULL DEFAULT '[]'::jsonb,
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.pet_risk_scores ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users view own risk score"
ON public.pet_risk_scores FOR SELECT
USING (auth.uid() = user_id OR public.has_role(auth.uid(),'admin'));

CREATE POLICY "Admin manage risk scores"
ON public.pet_risk_scores FOR ALL
USING (public.has_role(auth.uid(),'admin'))
WITH CHECK (public.has_role(auth.uid(),'admin'));

-- 3. pet_risk_appeals
CREATE TABLE IF NOT EXISTS public.pet_risk_appeals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  message text NOT NULL,
  evidence_urls text[] DEFAULT '{}',
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','approved','rejected')),
  admin_id uuid,
  admin_note text,
  created_at timestamptz NOT NULL DEFAULT now(),
  resolved_at timestamptz
);
CREATE INDEX IF NOT EXISTS idx_pet_risk_appeals_user ON public.pet_risk_appeals(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_pet_risk_appeals_status ON public.pet_risk_appeals(status, created_at DESC);

ALTER TABLE public.pet_risk_appeals ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users view own appeals"
ON public.pet_risk_appeals FOR SELECT
USING (auth.uid() = user_id OR public.has_role(auth.uid(),'admin'));

CREATE POLICY "Users create own appeals"
ON public.pet_risk_appeals FOR INSERT
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Admin update appeals"
ON public.pet_risk_appeals FOR UPDATE
USING (public.has_role(auth.uid(),'admin'))
WITH CHECK (public.has_role(auth.uid(),'admin'));

-- 4. Cột mirror
ALTER TABLE public.pet_states
  ADD COLUMN IF NOT EXISTS risk_tier text NOT NULL DEFAULT 'safe'
  CHECK (risk_tier IN ('safe','watch','restricted','frozen'));

ALTER TABLE public.pet_cosmetics_owned
  ADD COLUMN IF NOT EXISTS flagged_at timestamptz;

-- 5. RPC recompute
CREATE OR REPLACE FUNCTION public.pet_risk_recompute(_user_id uuid)
RETURNS public.pet_risk_scores
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_score numeric(4,3) := 0;
  v_tier text := 'safe';
  v_count integer := 0;
  v_reasons jsonb := '[]'::jsonb;
  v_row public.pet_risk_scores;
BEGIN
  SELECT
    COALESCE(LEAST(1.0, SUM(severity * exp(-extract(epoch from (now() - created_at))/(7*86400)))::numeric), 0),
    COUNT(*),
    COALESCE(jsonb_agg(DISTINCT signal_type), '[]'::jsonb)
  INTO v_score, v_count, v_reasons
  FROM public.pet_risk_signals
  WHERE user_id = _user_id
    AND created_at > now() - interval '7 days';

  v_tier := CASE
    WHEN v_score >= 0.80 THEN 'frozen'
    WHEN v_score >= 0.55 THEN 'restricted'
    WHEN v_score >= 0.25 THEN 'watch'
    ELSE 'safe'
  END;

  INSERT INTO public.pet_risk_scores(user_id, risk_score, risk_tier, signal_count, last_reasons, updated_at)
  VALUES (_user_id, v_score, v_tier, v_count, v_reasons, now())
  ON CONFLICT (user_id) DO UPDATE
    SET risk_score = EXCLUDED.risk_score,
        risk_tier = EXCLUDED.risk_tier,
        signal_count = EXCLUDED.signal_count,
        last_reasons = EXCLUDED.last_reasons,
        updated_at = now()
  RETURNING * INTO v_row;

  UPDATE public.pet_states SET risk_tier = v_tier WHERE user_id = _user_id;

  RETURN v_row;
END;
$$;

REVOKE ALL ON FUNCTION public.pet_risk_recompute(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.pet_risk_recompute(uuid) TO authenticated, service_role;

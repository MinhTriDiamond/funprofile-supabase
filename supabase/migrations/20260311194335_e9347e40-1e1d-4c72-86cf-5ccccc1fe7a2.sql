
-- Add fraud_risk_level to profiles for 3-step progressive detection
-- 0 = normal, 1 = flagged (internal only), 2 = soft warning (claim speed limited), 3 = manual review (on_hold)
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS fraud_risk_level integer NOT NULL DEFAULT 0;

-- Add claim_speed_limit_until for Step 2 cooldown (1 claim per 48h)
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS claim_speed_limit_until timestamp with time zone;

-- Index for efficient fraud scan queries
CREATE INDEX IF NOT EXISTS idx_profiles_fraud_risk_level ON public.profiles(fraud_risk_level) WHERE fraud_risk_level > 0;

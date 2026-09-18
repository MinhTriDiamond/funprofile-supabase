
-- Add fraud_trusted and max_claim_per_request columns to profiles
ALTER TABLE public.profiles 
  ADD COLUMN IF NOT EXISTS fraud_trusted boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS max_claim_per_request integer DEFAULT NULL;

-- Create function for fraud risk decay (reduces fraud_risk_level by 1 every 7 clean days)
-- This will be called by daily-fraud-scan
CREATE OR REPLACE FUNCTION public.decay_fraud_risk()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  decayed_count integer := 0;
BEGIN
  -- Find users with fraud_risk_level > 0 who have not had any fraud signals in the last 7 days
  UPDATE profiles
  SET 
    fraud_risk_level = GREATEST(0, fraud_risk_level - 1),
    claim_speed_limit_until = CASE WHEN fraud_risk_level - 1 < 2 THEN NULL ELSE claim_speed_limit_until END,
    max_claim_per_request = CASE WHEN fraud_risk_level - 1 < 2 THEN NULL ELSE max_claim_per_request END,
    reward_status = CASE 
      WHEN fraud_risk_level - 1 < 3 AND reward_status = 'on_hold' AND NOT is_banned THEN 'approved'
      ELSE reward_status 
    END,
    admin_notes = '[Auto Decay] fraud_risk_level giảm 1 do không vi phạm 7 ngày. ' || COALESCE(admin_notes, '')
  WHERE fraud_risk_level > 0
    AND is_banned = false
    AND id NOT IN (
      SELECT DISTINCT actor_id FROM pplp_fraud_signals 
      WHERE created_at > now() - interval '7 days'
        AND severity >= 2
    );
  
  GET DIAGNOSTICS decayed_count = ROW_COUNT;
  RETURN decayed_count;
END;
$$;


-- 1. Create a safe public view for live_sessions (hide internal Agora/recording fields)
CREATE OR REPLACE VIEW public.public_live_sessions AS
SELECT
  id,
  host_user_id,
  owner_id,
  title,
  slug,
  status,
  privacy,
  viewer_count,
  started_at,
  ended_at,
  created_at,
  updated_at,
  post_id,
  channel_name,
  device_id,
  recording_status
FROM public.live_sessions;

-- 2. Restrict pplp_action_caps to authenticated users only
DROP POLICY IF EXISTS "pplp_action_caps_select" ON public.pplp_action_caps;
CREATE POLICY "pplp_action_caps_authenticated_only"
  ON public.pplp_action_caps
  FOR SELECT
  TO authenticated
  USING (true);

-- Revoke anon access
REVOKE SELECT ON public.pplp_action_caps FROM anon;

-- 3. Create a safe view for system_config (hide sensitive fields)
CREATE OR REPLACE VIEW public.public_system_config AS
SELECT key, value, updated_at
FROM public.system_config
WHERE key NOT IN (
  'TREASURY_PRIVATE_KEY',
  'TREASURY_WALLET_ADDRESS', 
  'TREASURY_CAMLY_SPENT',
  'TREASURY_CAMLY_RECEIVED',
  'FREEZE_ALL_CLAIMS',
  'COOLDOWN_MINUTES',
  'DAILY_CLAIM_LIMIT',
  'MAX_CLAIM_AMOUNT',
  'MIN_CLAIM_AMOUNT'
);

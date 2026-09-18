
-- A. WALLET HISTORY TABLE - Never lose wallet data
CREATE TABLE public.wallet_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  wallet_address TEXT NOT NULL,
  is_active BOOLEAN NOT NULL DEFAULT true,
  started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  ended_at TIMESTAMPTZ,
  change_reason TEXT DEFAULT 'user', -- user, admin, system
  ip_address TEXT,
  user_agent TEXT,
  device_hash TEXT,
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_wallet_history_user ON wallet_history(user_id);
CREATE INDEX idx_wallet_history_wallet ON wallet_history(wallet_address);
CREATE INDEX idx_wallet_history_active ON wallet_history(user_id, is_active) WHERE is_active = true;

ALTER TABLE wallet_history ENABLE ROW LEVEL SECURITY;

-- Users can read their own wallet history
CREATE POLICY "Users can view own wallet history"
ON wallet_history FOR SELECT
TO authenticated
USING (auth.uid() = user_id);

-- Only service role can insert/update (via edge functions)
CREATE POLICY "Service role manages wallet history"
ON wallet_history FOR ALL
TO service_role
USING (true)
WITH CHECK (true);

-- B. ADD SECURITY COLUMNS TO PROFILES
ALTER TABLE profiles 
  ADD COLUMN IF NOT EXISTS wallet_change_count_30d INTEGER DEFAULT 0,
  ADD COLUMN IF NOT EXISTS last_wallet_change_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS claim_freeze_until TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS wallet_risk_status TEXT DEFAULT 'normal' CHECK (wallet_risk_status IN ('normal', 'watch', 'review', 'blocked'));

-- C. SYSTEM CONFIG TABLE for feature flags
CREATE TABLE IF NOT EXISTS public.system_config (
  key TEXT PRIMARY KEY,
  value JSONB NOT NULL DEFAULT '{}',
  description TEXT,
  updated_at TIMESTAMPTZ DEFAULT now(),
  updated_by UUID
);

ALTER TABLE system_config ENABLE ROW LEVEL SECURITY;

-- Anyone can read config (feature flags are public)
CREATE POLICY "Anyone can read system config"
ON system_config FOR SELECT
USING (true);

-- Only admins can update
CREATE POLICY "Admins manage system config"
ON system_config FOR ALL
TO service_role
USING (true)
WITH CHECK (true);

-- Insert default feature flag
INSERT INTO system_config (key, value, description)
VALUES 
  ('WALLET_CHANGE_DISABLED', '{"enabled": true, "message": "Tạm khóa đổi ví để nâng cấp bảo mật. Vui lòng thử lại sau."}'::jsonb, 'Disable wallet changes globally'),
  ('WALLET_CHANGE_COOLDOWN_DAYS', '{"value": 30}'::jsonb, 'Cooldown days between wallet changes'),
  ('CLAIM_FREEZE_HOURS', '{"value": 72}'::jsonb, 'Hours to freeze claims after wallet change')
ON CONFLICT (key) DO NOTHING;

-- D. FUNCTION to recalculate wallet_change_count_30d
CREATE OR REPLACE FUNCTION public.get_wallet_change_count_30d(p_user_id UUID)
RETURNS INTEGER
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COUNT(*)::INTEGER
  FROM wallet_history
  WHERE user_id = p_user_id
    AND created_at >= now() - INTERVAL '30 days'
    AND change_reason != 'migration'; -- Don't count initial migration
$$;

-- E. FUNCTION for secure wallet change with all checks
CREATE OR REPLACE FUNCTION public.process_wallet_change(
  p_user_id UUID,
  p_new_wallet TEXT,
  p_old_wallet TEXT DEFAULT NULL,
  p_reason TEXT DEFAULT 'user',
  p_ip TEXT DEFAULT NULL,
  p_user_agent TEXT DEFAULT NULL,
  p_device_hash TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_config_disabled JSONB;
  v_cooldown_days INTEGER;
  v_freeze_hours INTEGER;
  v_last_change TIMESTAMPTZ;
  v_change_count INTEGER;
  v_new_risk TEXT;
  v_freeze_until TIMESTAMPTZ;
  v_is_admin BOOLEAN;
BEGIN
  -- Check if admin override
  v_is_admin := (p_reason = 'admin');
  
  -- Check feature flag (skip for admin)
  IF NOT v_is_admin THEN
    SELECT value INTO v_config_disabled FROM system_config WHERE key = 'WALLET_CHANGE_DISABLED';
    IF v_config_disabled IS NOT NULL AND (v_config_disabled->>'enabled')::BOOLEAN = true THEN
      RETURN jsonb_build_object(
        'success', false,
        'error', 'WALLET_CHANGE_DISABLED',
        'message', COALESCE(v_config_disabled->>'message', 'Tạm khóa đổi ví để nâng cấp bảo mật.')
      );
    END IF;
  END IF;
  
  -- Get cooldown config
  SELECT COALESCE((value->>'value')::INTEGER, 30) INTO v_cooldown_days 
  FROM system_config WHERE key = 'WALLET_CHANGE_COOLDOWN_DAYS';
  v_cooldown_days := COALESCE(v_cooldown_days, 30);
  
  -- Get freeze config
  SELECT COALESCE((value->>'value')::INTEGER, 72) INTO v_freeze_hours
  FROM system_config WHERE key = 'CLAIM_FREEZE_HOURS';
  v_freeze_hours := COALESCE(v_freeze_hours, 72);
  
  -- Check cooldown (skip for admin)
  IF NOT v_is_admin THEN
    SELECT last_wallet_change_at INTO v_last_change FROM profiles WHERE id = p_user_id;
    IF v_last_change IS NOT NULL AND v_last_change > now() - (v_cooldown_days || ' days')::INTERVAL THEN
      RETURN jsonb_build_object(
        'success', false,
        'error', 'COOLDOWN_ACTIVE',
        'message', format('Bạn chỉ được đổi ví 1 lần mỗi %s ngày. Vui lòng thử lại sau.', v_cooldown_days),
        'next_change_at', v_last_change + (v_cooldown_days || ' days')::INTERVAL
      );
    END IF;
  END IF;
  
  -- Check wallet not blacklisted
  IF EXISTS (SELECT 1 FROM blacklisted_wallets WHERE wallet_address = lower(p_new_wallet)) THEN
    RETURN jsonb_build_object('success', false, 'error', 'WALLET_BLACKLISTED', 'message', 'Ví này đã bị chặn.');
  END IF;
  
  -- Check wallet not used by another user
  IF EXISTS (
    SELECT 1 FROM profiles 
    WHERE (external_wallet_address = lower(p_new_wallet) OR wallet_address = lower(p_new_wallet) OR public_wallet_address = lower(p_new_wallet))
    AND id != p_user_id
  ) THEN
    RETURN jsonb_build_object('success', false, 'error', 'WALLET_IN_USE', 'message', 'Ví này đã được sử dụng bởi tài khoản khác.');
  END IF;
  
  -- Deactivate old wallet in history
  UPDATE wallet_history SET is_active = false, ended_at = now()
  WHERE user_id = p_user_id AND is_active = true;
  
  -- Insert new wallet history
  INSERT INTO wallet_history (user_id, wallet_address, is_active, change_reason, ip_address, user_agent, device_hash)
  VALUES (p_user_id, lower(p_new_wallet), true, p_reason, p_ip, p_user_agent, p_device_hash);
  
  -- Calculate risk
  v_change_count := get_wallet_change_count_30d(p_user_id);
  
  IF v_change_count >= 3 THEN
    v_new_risk := 'blocked';
    v_freeze_until := NULL; -- Permanently blocked until manual review
  ELSIF v_change_count >= 2 THEN
    v_new_risk := 'review';
    v_freeze_until := now() + INTERVAL '7 days';
  ELSE
    v_new_risk := 'watch';
    v_freeze_until := now() + (v_freeze_hours || ' hours')::INTERVAL;
  END IF;
  
  -- Admin bypass risk
  IF v_is_admin THEN
    v_new_risk := 'normal';
    v_freeze_until := NULL;
  END IF;
  
  -- Update profile
  UPDATE profiles SET
    external_wallet_address = lower(p_new_wallet),
    wallet_address = lower(p_new_wallet),
    public_wallet_address = lower(p_new_wallet),
    wallet_change_count_30d = v_change_count,
    last_wallet_change_at = now(),
    claim_freeze_until = v_freeze_until,
    wallet_risk_status = v_new_risk
  WHERE id = p_user_id;
  
  -- If risk elevated, freeze pending claims
  IF v_new_risk IN ('review', 'blocked') THEN
    UPDATE reward_claims SET status = 'pending_review'
    WHERE user_id = p_user_id AND status = 'pending';
    
    -- Create fraud signal
    INSERT INTO pplp_fraud_signals (actor_id, signal_type, severity, details, source)
    VALUES (p_user_id, 'WALLET_CHANGE_ABUSE', 
      CASE WHEN v_new_risk = 'blocked' THEN 5 ELSE 3 END,
      jsonb_build_object(
        'old_wallet', p_old_wallet,
        'new_wallet', p_new_wallet,
        'change_count_30d', v_change_count,
        'risk_status', v_new_risk,
        'ip', p_ip
      ),
      'wallet-change'
    );
  END IF;
  
  -- Audit log
  INSERT INTO audit_logs (admin_id, action, target_user_id, reason, details)
  VALUES (
    p_user_id, 'WALLET_CHANGE', p_user_id, p_reason,
    jsonb_build_object(
      'old_wallet', p_old_wallet,
      'new_wallet', lower(p_new_wallet),
      'change_count_30d', v_change_count,
      'risk_status', v_new_risk,
      'freeze_until', v_freeze_until,
      'ip', p_ip,
      'device_hash', p_device_hash
    )
  );
  
  RETURN jsonb_build_object(
    'success', true,
    'risk_status', v_new_risk,
    'freeze_until', v_freeze_until,
    'change_count_30d', v_change_count
  );
END;
$$;

-- F. MIGRATE EXISTING WALLET DATA to wallet_history
INSERT INTO wallet_history (user_id, wallet_address, is_active, started_at, change_reason)
SELECT id, lower(public_wallet_address), true, created_at, 'migration'
FROM profiles
WHERE public_wallet_address IS NOT NULL AND public_wallet_address != ''
ON CONFLICT DO NOTHING;

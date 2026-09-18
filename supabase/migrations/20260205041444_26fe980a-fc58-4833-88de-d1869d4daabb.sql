
-- =============================================
-- PPLP (Proof of Pure Love Protocol) Database Schema
-- =============================================

-- 1. LIGHT_ACTIONS - Ghi nhận mọi hành động tạo giá trị
CREATE TABLE public.light_actions (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  action_type TEXT NOT NULL CHECK (action_type IN ('post', 'comment', 'reaction', 'share', 'friend', 'livestream', 'new_user_bonus')),
  reference_id UUID, -- ID của post/comment/etc
  reference_type TEXT, -- 'post', 'comment', etc. for context
  content_preview TEXT, -- Preview của content để ANGEL AI đánh giá
  
  -- PPLP Scoring Components
  base_reward NUMERIC NOT NULL DEFAULT 0,
  quality_score NUMERIC NOT NULL DEFAULT 1.0 CHECK (quality_score >= 0.5 AND quality_score <= 3.0),
  impact_score NUMERIC NOT NULL DEFAULT 1.0 CHECK (impact_score >= 0.5 AND impact_score <= 5.0),
  integrity_score NUMERIC NOT NULL DEFAULT 1.0 CHECK (integrity_score >= 0 AND integrity_score <= 1.0),
  unity_score NUMERIC NOT NULL DEFAULT 50 CHECK (unity_score >= 0 AND unity_score <= 100),
  unity_multiplier NUMERIC NOT NULL DEFAULT 1.0 CHECK (unity_multiplier >= 0.5 AND unity_multiplier <= 2.5),
  
  -- Final Calculated Score
  light_score NUMERIC NOT NULL DEFAULT 0, -- BR × Q × I × K × Ux
  
  -- Mint Status
  is_eligible BOOLEAN NOT NULL DEFAULT false,
  mint_status TEXT NOT NULL DEFAULT 'pending' CHECK (mint_status IN ('pending', 'approved', 'minted', 'rejected', 'expired')),
  mint_amount NUMERIC DEFAULT 0,
  tx_hash TEXT,
  
  -- ANGEL AI Evaluation Response
  angel_evaluation JSONB,
  
  -- Timestamps
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  evaluated_at TIMESTAMPTZ,
  minted_at TIMESTAMPTZ
);

-- Indexes for light_actions
CREATE INDEX idx_light_actions_user_id ON public.light_actions(user_id);
CREATE INDEX idx_light_actions_action_type ON public.light_actions(action_type);
CREATE INDEX idx_light_actions_mint_status ON public.light_actions(mint_status);
CREATE INDEX idx_light_actions_created_at ON public.light_actions(created_at DESC);
CREATE INDEX idx_light_actions_reference ON public.light_actions(reference_type, reference_id);

-- 2. LIGHT_REPUTATION - Danh tiếng Ánh Sáng tích lũy
CREATE TABLE public.light_reputation (
  user_id UUID NOT NULL PRIMARY KEY REFERENCES public.profiles(id) ON DELETE CASCADE,
  
  -- Accumulated Stats
  total_light_score NUMERIC NOT NULL DEFAULT 0,
  tier INTEGER NOT NULL DEFAULT 0 CHECK (tier >= 0 AND tier <= 3), -- 0=New, 1=Seeker, 2=Bearer, 3=Guardian
  
  -- Mint Caps and Stats
  daily_mint_cap NUMERIC NOT NULL DEFAULT 500, -- Base cap, increases with tier
  total_minted NUMERIC NOT NULL DEFAULT 0,
  today_minted NUMERIC NOT NULL DEFAULT 0,
  today_date DATE NOT NULL DEFAULT CURRENT_DATE,
  
  -- Activity Stats
  actions_count INTEGER NOT NULL DEFAULT 0,
  avg_quality NUMERIC NOT NULL DEFAULT 1.0,
  avg_impact NUMERIC NOT NULL DEFAULT 1.0,
  avg_integrity NUMERIC NOT NULL DEFAULT 1.0,
  avg_unity NUMERIC NOT NULL DEFAULT 50,
  
  -- Pillar Scores (aggregated for UI display)
  pillar_service NUMERIC NOT NULL DEFAULT 0, -- Service to Life
  pillar_truth NUMERIC NOT NULL DEFAULT 0, -- Transparent Truth
  pillar_healing NUMERIC NOT NULL DEFAULT 0, -- Healing & Love
  pillar_value NUMERIC NOT NULL DEFAULT 0, -- Long-term Value
  pillar_unity NUMERIC NOT NULL DEFAULT 0, -- Unity
  
  -- Timestamps
  last_action_at TIMESTAMPTZ,
  last_mint_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Index for light_reputation
CREATE INDEX idx_light_reputation_tier ON public.light_reputation(tier);
CREATE INDEX idx_light_reputation_total_score ON public.light_reputation(total_light_score DESC);

-- 3. MINT_EPOCHS - Quản lý epoch mint (chống farm)
CREATE TABLE public.mint_epochs (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  epoch_date DATE NOT NULL UNIQUE,
  
  -- Global Stats
  total_minted NUMERIC NOT NULL DEFAULT 0,
  total_cap NUMERIC NOT NULL DEFAULT 10000000, -- 10M FUN per day globally
  total_actions INTEGER NOT NULL DEFAULT 0,
  unique_users INTEGER NOT NULL DEFAULT 0,
  
  -- Platform Pool (để tracking cross-platform)
  platform_pool JSONB NOT NULL DEFAULT '{"fun_profile": 0}'::jsonb,
  
  -- Timestamps
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Index for mint_epochs
CREATE INDEX idx_mint_epochs_date ON public.mint_epochs(epoch_date DESC);

-- =============================================
-- RLS POLICIES
-- =============================================

-- Enable RLS
ALTER TABLE public.light_actions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.light_reputation ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.mint_epochs ENABLE ROW LEVEL SECURITY;

-- LIGHT_ACTIONS Policies
CREATE POLICY "Users can view their own light actions"
  ON public.light_actions FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "System can insert light actions"
  ON public.light_actions FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "System can update light actions"
  ON public.light_actions FOR UPDATE
  USING (auth.uid() = user_id);

-- LIGHT_REPUTATION Policies
CREATE POLICY "Users can view their own reputation"
  ON public.light_reputation FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Anyone can view top reputations for leaderboard"
  ON public.light_reputation FOR SELECT
  USING (true);

CREATE POLICY "System can insert reputation"
  ON public.light_reputation FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "System can update own reputation"
  ON public.light_reputation FOR UPDATE
  USING (auth.uid() = user_id);

-- MINT_EPOCHS Policies (read-only for users)
CREATE POLICY "Anyone can view mint epochs"
  ON public.mint_epochs FOR SELECT
  USING (true);

-- =============================================
-- HELPER FUNCTIONS
-- =============================================

-- Function to calculate Unity Multiplier from Unity Score
CREATE OR REPLACE FUNCTION public.calculate_unity_multiplier(unity_score NUMERIC)
RETURNS NUMERIC AS $$
BEGIN
  -- Formula: Ux = 0.5 + (U / 50)
  -- U=0 → Ux=0.5, U=50 → Ux=1.5, U=100 → Ux=2.5
  RETURN GREATEST(0.5, LEAST(2.5, 0.5 + (unity_score / 50)));
END;
$$ LANGUAGE plpgsql IMMUTABLE;

-- Function to calculate Light Score
CREATE OR REPLACE FUNCTION public.calculate_light_score(
  base_reward NUMERIC,
  quality_score NUMERIC,
  impact_score NUMERIC,
  integrity_score NUMERIC,
  unity_multiplier NUMERIC
)
RETURNS NUMERIC AS $$
BEGIN
  -- Formula: Light Score = BR × Q × I × K × Ux
  RETURN ROUND(base_reward * quality_score * impact_score * integrity_score * unity_multiplier, 2);
END;
$$ LANGUAGE plpgsql IMMUTABLE;

-- Function to determine tier from total light score
CREATE OR REPLACE FUNCTION public.calculate_tier(total_score NUMERIC)
RETURNS INTEGER AS $$
BEGIN
  IF total_score >= 100000 THEN
    RETURN 3; -- Light Guardian
  ELSIF total_score >= 10000 THEN
    RETURN 2; -- Light Bearer
  ELSIF total_score >= 1000 THEN
    RETURN 1; -- Light Seeker
  ELSE
    RETURN 0; -- New Soul
  END IF;
END;
$$ LANGUAGE plpgsql IMMUTABLE;

-- Function to get daily cap based on tier
CREATE OR REPLACE FUNCTION public.get_daily_cap(tier INTEGER)
RETURNS NUMERIC AS $$
BEGIN
  CASE tier
    WHEN 0 THEN RETURN 500;   -- New Soul
    WHEN 1 THEN RETURN 1000;  -- Light Seeker
    WHEN 2 THEN RETURN 2500;  -- Light Bearer
    WHEN 3 THEN RETURN 5000;  -- Light Guardian
    ELSE RETURN 500;
  END CASE;
END;
$$ LANGUAGE plpgsql IMMUTABLE;

-- =============================================
-- RPC FUNCTION: get_user_light_score
-- =============================================

CREATE OR REPLACE FUNCTION public.get_user_light_score(p_user_id UUID)
RETURNS JSONB AS $$
DECLARE
  v_reputation light_reputation%ROWTYPE;
  v_pending_count INTEGER;
  v_pending_amount NUMERIC;
  v_recent_actions JSONB;
  v_tier_name TEXT;
BEGIN
  -- Get or create reputation record
  SELECT * INTO v_reputation FROM light_reputation WHERE user_id = p_user_id;
  
  IF NOT FOUND THEN
    -- Create default reputation
    INSERT INTO light_reputation (user_id) VALUES (p_user_id)
    RETURNING * INTO v_reputation;
  END IF;
  
  -- Reset today_minted if date changed
  IF v_reputation.today_date < CURRENT_DATE THEN
    UPDATE light_reputation 
    SET today_minted = 0, today_date = CURRENT_DATE, updated_at = now()
    WHERE user_id = p_user_id
    RETURNING * INTO v_reputation;
  END IF;
  
  -- Get pending actions count and amount
  SELECT COUNT(*), COALESCE(SUM(mint_amount), 0)
  INTO v_pending_count, v_pending_amount
  FROM light_actions
  WHERE user_id = p_user_id AND mint_status = 'approved';
  
  -- Get recent actions (last 10)
  SELECT COALESCE(jsonb_agg(
    jsonb_build_object(
      'id', id,
      'action_type', action_type,
      'light_score', light_score,
      'mint_status', mint_status,
      'mint_amount', mint_amount,
      'content_preview', LEFT(content_preview, 50),
      'created_at', created_at
    ) ORDER BY created_at DESC
  ), '[]'::jsonb)
  INTO v_recent_actions
  FROM (
    SELECT * FROM light_actions
    WHERE user_id = p_user_id
    ORDER BY created_at DESC
    LIMIT 10
  ) sub;
  
  -- Get tier name
  v_tier_name := CASE v_reputation.tier
    WHEN 0 THEN 'New Soul'
    WHEN 1 THEN 'Light Seeker'
    WHEN 2 THEN 'Light Bearer'
    WHEN 3 THEN 'Light Guardian'
    ELSE 'Unknown'
  END;
  
  RETURN jsonb_build_object(
    'user_id', p_user_id,
    'total_light_score', v_reputation.total_light_score,
    'tier', v_reputation.tier,
    'tier_name', v_tier_name,
    'daily_cap', v_reputation.daily_mint_cap,
    'today_minted', v_reputation.today_minted,
    'total_minted', v_reputation.total_minted,
    'actions_count', v_reputation.actions_count,
    'pending_count', v_pending_count,
    'pending_amount', v_pending_amount,
    'pillars', jsonb_build_object(
      'service', v_reputation.pillar_service,
      'truth', v_reputation.pillar_truth,
      'healing', v_reputation.pillar_healing,
      'value', v_reputation.pillar_value,
      'unity', v_reputation.pillar_unity
    ),
    'averages', jsonb_build_object(
      'quality', v_reputation.avg_quality,
      'impact', v_reputation.avg_impact,
      'integrity', v_reputation.avg_integrity,
      'unity', v_reputation.avg_unity
    ),
    'recent_actions', v_recent_actions,
    'last_action_at', v_reputation.last_action_at,
    'last_mint_at', v_reputation.last_mint_at
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- =============================================
-- TRIGGER: Auto-update reputation on new action
-- =============================================

CREATE OR REPLACE FUNCTION public.update_reputation_on_action()
RETURNS TRIGGER AS $$
DECLARE
  v_new_tier INTEGER;
  v_new_cap NUMERIC;
BEGIN
  -- Upsert reputation record
  INSERT INTO light_reputation (user_id, total_light_score, actions_count, last_action_at)
  VALUES (NEW.user_id, NEW.light_score, 1, now())
  ON CONFLICT (user_id) DO UPDATE SET
    total_light_score = light_reputation.total_light_score + NEW.light_score,
    actions_count = light_reputation.actions_count + 1,
    avg_quality = (light_reputation.avg_quality * light_reputation.actions_count + NEW.quality_score) / (light_reputation.actions_count + 1),
    avg_impact = (light_reputation.avg_impact * light_reputation.actions_count + NEW.impact_score) / (light_reputation.actions_count + 1),
    avg_integrity = (light_reputation.avg_integrity * light_reputation.actions_count + NEW.integrity_score) / (light_reputation.actions_count + 1),
    avg_unity = (light_reputation.avg_unity * light_reputation.actions_count + NEW.unity_score) / (light_reputation.actions_count + 1),
    last_action_at = now(),
    updated_at = now();
  
  -- Update tier and cap based on new total
  SELECT calculate_tier(total_light_score) INTO v_new_tier
  FROM light_reputation WHERE user_id = NEW.user_id;
  
  v_new_cap := get_daily_cap(v_new_tier);
  
  UPDATE light_reputation 
  SET tier = v_new_tier, daily_mint_cap = v_new_cap
  WHERE user_id = NEW.user_id;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER trigger_update_reputation
  AFTER INSERT ON public.light_actions
  FOR EACH ROW
  EXECUTE FUNCTION public.update_reputation_on_action();

-- =============================================
-- TRIGGER: Update mint_epochs on mint
-- =============================================

CREATE OR REPLACE FUNCTION public.update_epoch_on_mint()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.mint_status = 'minted' AND OLD.mint_status != 'minted' THEN
    -- Update epoch stats
    INSERT INTO mint_epochs (epoch_date, total_minted, total_actions, unique_users)
    VALUES (CURRENT_DATE, NEW.mint_amount, 1, 1)
    ON CONFLICT (epoch_date) DO UPDATE SET
      total_minted = mint_epochs.total_minted + NEW.mint_amount,
      total_actions = mint_epochs.total_actions + 1,
      updated_at = now();
    
    -- Update user reputation
    UPDATE light_reputation SET
      total_minted = total_minted + NEW.mint_amount,
      today_minted = CASE 
        WHEN today_date = CURRENT_DATE THEN today_minted + NEW.mint_amount
        ELSE NEW.mint_amount
      END,
      today_date = CURRENT_DATE,
      last_mint_at = now(),
      updated_at = now()
    WHERE user_id = NEW.user_id;
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER trigger_update_epoch_on_mint
  AFTER UPDATE ON public.light_actions
  FOR EACH ROW
  EXECUTE FUNCTION public.update_epoch_on_mint();

-- Enable realtime for light_actions (for live updates)
ALTER PUBLICATION supabase_realtime ADD TABLE public.light_actions;

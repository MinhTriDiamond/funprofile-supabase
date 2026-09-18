
-- Fix function search_path warnings for PPLP functions

-- Fix calculate_unity_multiplier
CREATE OR REPLACE FUNCTION public.calculate_unity_multiplier(unity_score NUMERIC)
RETURNS NUMERIC AS $$
BEGIN
  RETURN GREATEST(0.5, LEAST(2.5, 0.5 + (unity_score / 50)));
END;
$$ LANGUAGE plpgsql IMMUTABLE SET search_path = public;

-- Fix calculate_light_score
CREATE OR REPLACE FUNCTION public.calculate_light_score(
  base_reward NUMERIC,
  quality_score NUMERIC,
  impact_score NUMERIC,
  integrity_score NUMERIC,
  unity_multiplier NUMERIC
)
RETURNS NUMERIC AS $$
BEGIN
  RETURN ROUND(base_reward * quality_score * impact_score * integrity_score * unity_multiplier, 2);
END;
$$ LANGUAGE plpgsql IMMUTABLE SET search_path = public;

-- Fix calculate_tier
CREATE OR REPLACE FUNCTION public.calculate_tier(total_score NUMERIC)
RETURNS INTEGER AS $$
BEGIN
  IF total_score >= 100000 THEN
    RETURN 3;
  ELSIF total_score >= 10000 THEN
    RETURN 2;
  ELSIF total_score >= 1000 THEN
    RETURN 1;
  ELSE
    RETURN 0;
  END IF;
END;
$$ LANGUAGE plpgsql IMMUTABLE SET search_path = public;

-- Fix get_daily_cap
CREATE OR REPLACE FUNCTION public.get_daily_cap(tier INTEGER)
RETURNS NUMERIC AS $$
BEGIN
  CASE tier
    WHEN 0 THEN RETURN 500;
    WHEN 1 THEN RETURN 1000;
    WHEN 2 THEN RETURN 2500;
    WHEN 3 THEN RETURN 5000;
    ELSE RETURN 500;
  END CASE;
END;
$$ LANGUAGE plpgsql IMMUTABLE SET search_path = public;

-- Fix get_user_light_score
CREATE OR REPLACE FUNCTION public.get_user_light_score(p_user_id UUID)
RETURNS JSONB AS $$
DECLARE
  v_reputation light_reputation%ROWTYPE;
  v_pending_count INTEGER;
  v_pending_amount NUMERIC;
  v_recent_actions JSONB;
  v_tier_name TEXT;
BEGIN
  SELECT * INTO v_reputation FROM light_reputation WHERE user_id = p_user_id;
  
  IF NOT FOUND THEN
    INSERT INTO light_reputation (user_id) VALUES (p_user_id)
    RETURNING * INTO v_reputation;
  END IF;
  
  IF v_reputation.today_date < CURRENT_DATE THEN
    UPDATE light_reputation 
    SET today_minted = 0, today_date = CURRENT_DATE, updated_at = now()
    WHERE user_id = p_user_id
    RETURNING * INTO v_reputation;
  END IF;
  
  SELECT COUNT(*), COALESCE(SUM(mint_amount), 0)
  INTO v_pending_count, v_pending_amount
  FROM light_actions
  WHERE user_id = p_user_id AND mint_status = 'approved';
  
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
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- Fix update_reputation_on_action
CREATE OR REPLACE FUNCTION public.update_reputation_on_action()
RETURNS TRIGGER AS $$
DECLARE
  v_new_tier INTEGER;
  v_new_cap NUMERIC;
BEGIN
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
  
  SELECT calculate_tier(total_light_score) INTO v_new_tier
  FROM light_reputation WHERE user_id = NEW.user_id;
  
  v_new_cap := get_daily_cap(v_new_tier);
  
  UPDATE light_reputation 
  SET tier = v_new_tier, daily_mint_cap = v_new_cap
  WHERE user_id = NEW.user_id;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- Fix update_epoch_on_mint
CREATE OR REPLACE FUNCTION public.update_epoch_on_mint()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.mint_status = 'minted' AND OLD.mint_status != 'minted' THEN
    INSERT INTO mint_epochs (epoch_date, total_minted, total_actions, unique_users)
    VALUES (CURRENT_DATE, NEW.mint_amount, 1, 1)
    ON CONFLICT (epoch_date) DO UPDATE SET
      total_minted = mint_epochs.total_minted + NEW.mint_amount,
      total_actions = mint_epochs.total_actions + 1,
      updated_at = now();
    
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
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

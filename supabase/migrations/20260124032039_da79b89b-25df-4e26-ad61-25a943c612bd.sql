-- =====================================================
-- SECURITY FIX: Error-level security vulnerabilities
-- =====================================================

-- 1. FIX: Financial reconciliation function lacks authentication
-- Add admin role check to run_financial_reconciliation
CREATE OR REPLACE FUNCTION public.run_financial_reconciliation(p_admin_id uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  result JSONB := '[]'::jsonb;
  rec RECORD;
  v_level INTEGER := 1;
  v_status TEXT := 'ok';
  v_total_checked INTEGER := 0;
  v_total_mismatched INTEGER := 0;
  v_auto_adjusted INTEGER := 0;
  v_diff_percent NUMERIC;
BEGIN
  -- SECURITY FIX: Require admin role for this sensitive function
  IF p_admin_id IS NULL THEN
    RAISE EXCEPTION 'Admin ID required for financial reconciliation';
  END IF;
  
  IF NOT public.has_role(p_admin_id, 'admin') THEN
    RAISE EXCEPTION 'Only admins can run financial reconciliation';
  END IF;

  -- Compare aggregated transactions vs platform_financial_data
  FOR rec IN
    SELECT 
      pfd.user_id,
      pfd.client_id,
      pfd.total_profit as stored_profit,
      COALESCE(calc.calculated_profit, 0) as calculated_profit,
      ABS(pfd.total_profit - COALESCE(calc.calculated_profit, 0)) as diff,
      CASE 
        WHEN pfd.total_profit = 0 THEN 0
        ELSE ABS(pfd.total_profit - COALESCE(calc.calculated_profit, 0))::NUMERIC / GREATEST(ABS(pfd.total_profit), 1) * 100
      END as diff_percent
    FROM public.platform_financial_data pfd
    LEFT JOIN (
      SELECT 
        user_id,
        client_id,
        SUM(CASE 
          WHEN action IN ('WIN', 'CLAIM_REWARD', 'RECEIVE_MONEY', 'DEPOSIT', 'ADJUSTMENT_ADD') THEN amount
          WHEN action IN ('LOSS', 'SEND_MONEY', 'WITHDRAW', 'ADJUSTMENT_SUB') THEN -amount
          ELSE 0
        END) as calculated_profit
      FROM public.financial_transactions
      GROUP BY user_id, client_id
    ) calc ON pfd.user_id = calc.user_id AND pfd.client_id = calc.client_id
  LOOP
    v_total_checked := v_total_checked + 1;
    v_diff_percent := rec.diff_percent;
    
    IF rec.diff > 0 THEN
      v_total_mismatched := v_total_mismatched + 1;
      
      -- Determine level based on percentage
      IF v_diff_percent < 0.01 THEN
        -- Level 1: Auto-adjust minor rounding errors
        UPDATE public.platform_financial_data
        SET total_profit = rec.calculated_profit, updated_at = now()
        WHERE user_id = rec.user_id AND client_id = rec.client_id;
        v_auto_adjusted := v_auto_adjusted + 1;
        
        IF v_level < 2 THEN v_level := 1; END IF;
        IF v_status = 'ok' THEN v_status := 'minor_adjustment'; END IF;
        
      ELSIF v_diff_percent < 1 THEN
        -- Level 2: Needs manual review
        IF v_level < 3 THEN v_level := 2; END IF;
        IF v_status IN ('ok', 'minor_adjustment') THEN v_status := 'mismatch'; END IF;
        
      ELSE
        -- Level 3: Critical - possible fraud or serious bug
        v_level := 3;
        v_status := 'critical';
      END IF;
      
      -- Add to result
      result := result || jsonb_build_object(
        'user_id', rec.user_id,
        'client_id', rec.client_id,
        'stored', rec.stored_profit,
        'calculated', rec.calculated_profit,
        'diff', rec.diff,
        'diff_percent', round(v_diff_percent::NUMERIC, 4),
        'level', CASE 
          WHEN v_diff_percent < 0.01 THEN 1
          WHEN v_diff_percent < 1 THEN 2
          ELSE 3
        END
      );
    END IF;
  END LOOP;
  
  -- Log the reconciliation run
  INSERT INTO public.reconciliation_logs (
    status, level, discrepancies, total_checked, total_mismatched, auto_adjusted, run_by, notes
  )
  VALUES (
    v_status, v_level, result, v_total_checked, v_total_mismatched, (v_auto_adjusted > 0), p_admin_id,
    format('Checked %s records, found %s mismatches (%s auto-adjusted)', v_total_checked, v_total_mismatched, v_auto_adjusted)
  );
  
  RETURN jsonb_build_object(
    'status', v_status,
    'level', v_level,
    'total_checked', v_total_checked,
    'total_mismatched', v_total_mismatched,
    'auto_adjusted', v_auto_adjusted,
    'discrepancies', result
  );
END;
$function$;

-- 2. FIX: recalculate_user_financial also needs admin check
CREATE OR REPLACE FUNCTION public.recalculate_user_financial(p_user_id uuid, p_client_id text DEFAULT NULL::text, p_admin_id uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  rec RECORD;
  v_updated INTEGER := 0;
BEGIN
  -- SECURITY FIX: Require admin role for this sensitive function
  IF p_admin_id IS NULL THEN
    RAISE EXCEPTION 'Admin ID required for financial recalculation';
  END IF;
  
  IF NOT public.has_role(p_admin_id, 'admin') THEN
    RAISE EXCEPTION 'Only admins can recalculate user financials';
  END IF;

  -- Recalculate for specific user (and optionally specific platform)
  FOR rec IN
    SELECT 
      ft.user_id,
      ft.client_id,
      SUM(CASE WHEN ft.action = 'DEPOSIT' THEN ft.amount ELSE 0 END) as calc_deposit,
      SUM(CASE WHEN ft.action IN ('WITHDRAW', 'CLAIM_REWARD', 'SEND_MONEY') THEN ft.amount ELSE 0 END) as calc_withdraw,
      SUM(CASE WHEN ft.action = 'BET' THEN ft.amount ELSE 0 END) as calc_bet,
      SUM(CASE WHEN ft.action = 'WIN' THEN ft.amount ELSE 0 END) as calc_win,
      SUM(CASE WHEN ft.action = 'LOSS' THEN ft.amount ELSE 0 END) as calc_loss,
      SUM(CASE 
        WHEN ft.action IN ('WIN', 'CLAIM_REWARD', 'RECEIVE_MONEY', 'DEPOSIT', 'ADJUSTMENT_ADD') THEN ft.amount
        WHEN ft.action IN ('LOSS', 'SEND_MONEY', 'WITHDRAW', 'ADJUSTMENT_SUB') THEN -ft.amount
        ELSE 0
      END) as calc_profit
    FROM public.financial_transactions ft
    WHERE ft.user_id = p_user_id
      AND (p_client_id IS NULL OR ft.client_id = p_client_id)
    GROUP BY ft.user_id, ft.client_id
  LOOP
    UPDATE public.platform_financial_data
    SET 
      total_deposit = rec.calc_deposit,
      total_withdraw = rec.calc_withdraw,
      total_bet = rec.calc_bet,
      total_win = rec.calc_win,
      total_loss = rec.calc_loss,
      total_profit = rec.calc_profit,
      updated_at = now()
    WHERE user_id = rec.user_id AND client_id = rec.client_id;
    
    v_updated := v_updated + 1;
  END LOOP;
  
  RETURN jsonb_build_object(
    'success', true,
    'user_id', p_user_id,
    'client_id', p_client_id,
    'platforms_updated', v_updated
  );
END;
$function$;

-- 3. FIX: Custodial wallets - Create safe view and restrict direct table access
-- Create a safe view that EXCLUDES encrypted_private_key
CREATE OR REPLACE VIEW public.user_custodial_wallets AS
SELECT 
  id,
  user_id,
  wallet_address,
  chain_id,
  is_active,
  created_at,
  updated_at,
  last_activity_at
FROM public.custodial_wallets;

-- Grant access to the safe view
GRANT SELECT ON public.user_custodial_wallets TO authenticated;

-- Drop the old permissive policy
DROP POLICY IF EXISTS "Users can view their own custodial wallet address" ON public.custodial_wallets;

-- Create new restrictive policy - users can only view through service role or edge functions
CREATE POLICY "Service role only access"
ON public.custodial_wallets FOR SELECT
USING (auth.role() = 'service_role');

-- 4. FIX: Profiles table - restrict sensitive data access
-- Drop overly permissive policies
DROP POLICY IF EXISTS "Authenticated users can view basic profile info" ON public.profiles;
DROP POLICY IF EXISTS "Anyone can view profiles" ON public.profiles;

-- Keep admin and own profile access
-- Admins can already view all via existing policy
-- Users can view their own full profile via existing policy

-- Create policy for public profile access (via the public_profiles view)
-- The public_profiles view already exists and contains only safe fields
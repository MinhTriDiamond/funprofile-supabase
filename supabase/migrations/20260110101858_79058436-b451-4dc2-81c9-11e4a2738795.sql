-- =====================================================
-- FINANCIAL DATA CONTRACT IMPLEMENTATION
-- Phase A: Database Changes
-- =====================================================

-- 1. Create financial_transactions table (Immutable Transaction Log)
CREATE TABLE public.financial_transactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  client_id TEXT NOT NULL,
  
  -- Action types per Data Contract
  action TEXT NOT NULL CHECK (action IN (
    'CLAIM_REWARD', 'SEND_MONEY', 'RECEIVE_MONEY',
    'DEPOSIT', 'WITHDRAW', 'BET', 'WIN', 'LOSS',
    'ADJUSTMENT_ADD', 'ADJUSTMENT_SUB'  -- For corrections without DELETE/UPDATE
  )),
  
  amount BIGINT NOT NULL CHECK (amount >= 0),
  currency TEXT NOT NULL DEFAULT 'CAMLY',
  transaction_id TEXT NOT NULL,  -- ID from Platform for reconciliation
  
  -- Metadata
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  
  -- UNIQUE constraint for idempotency (same platform + same tx_id = already processed)
  CONSTRAINT unique_platform_transaction UNIQUE (client_id, transaction_id)
);

-- Indexes for performance
CREATE INDEX idx_financial_tx_user ON public.financial_transactions(user_id);
CREATE INDEX idx_financial_tx_client ON public.financial_transactions(client_id);
CREATE INDEX idx_financial_tx_action ON public.financial_transactions(action);
CREATE INDEX idx_financial_tx_created ON public.financial_transactions(created_at DESC);
CREATE INDEX idx_financial_tx_user_client ON public.financial_transactions(user_id, client_id);

-- RLS
ALTER TABLE public.financial_transactions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own transactions"
  ON public.financial_transactions FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Service role can manage all transactions"
  ON public.financial_transactions FOR ALL
  USING (auth.role() = 'service_role');

CREATE POLICY "Admins can view all transactions"
  ON public.financial_transactions FOR SELECT
  USING (public.has_role(auth.uid(), 'admin'));

-- 2. Create reconciliation_logs table
CREATE TABLE public.reconciliation_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  run_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  
  -- Status with 3 levels per Data Contract
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('ok', 'minor_adjustment', 'mismatch', 'critical')),
  level INTEGER NOT NULL DEFAULT 1 CHECK (level IN (1, 2, 3)),
  
  discrepancies JSONB DEFAULT '[]',
  total_checked INTEGER DEFAULT 0,
  total_mismatched INTEGER DEFAULT 0,
  auto_adjusted BOOLEAN DEFAULT false,
  
  notes TEXT,
  run_by UUID REFERENCES auth.users(id)
);

-- Index
CREATE INDEX idx_reconciliation_run_at ON public.reconciliation_logs(run_at DESC);
CREATE INDEX idx_reconciliation_status ON public.reconciliation_logs(status);

-- RLS
ALTER TABLE public.reconciliation_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can manage reconciliation logs"
  ON public.reconciliation_logs FOR ALL
  USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Service role full access"
  ON public.reconciliation_logs FOR ALL
  USING (auth.role() = 'service_role');

-- 3. Trigger to auto-update platform_financial_data from transactions
CREATE OR REPLACE FUNCTION public.update_financial_from_transaction()
RETURNS TRIGGER AS $$
DECLARE
  v_deposit BIGINT := 0;
  v_withdraw BIGINT := 0;
  v_bet BIGINT := 0;
  v_win BIGINT := 0;
  v_loss BIGINT := 0;
  v_profit BIGINT := 0;
BEGIN
  -- Map action to appropriate columns
  CASE NEW.action
    WHEN 'DEPOSIT' THEN
      v_deposit := NEW.amount;
      v_profit := NEW.amount;
    WHEN 'WITHDRAW' THEN
      v_withdraw := NEW.amount;
      v_profit := -NEW.amount;
    WHEN 'CLAIM_REWARD' THEN
      v_withdraw := NEW.amount;
      v_profit := NEW.amount;  -- Reward is positive profit
    WHEN 'BET' THEN
      v_bet := NEW.amount;
      -- Bet doesn't affect profit until WIN/LOSS
    WHEN 'WIN' THEN
      v_win := NEW.amount;
      v_profit := NEW.amount;
    WHEN 'LOSS' THEN
      v_loss := NEW.amount;
      v_profit := -NEW.amount;
    WHEN 'SEND_MONEY' THEN
      v_withdraw := NEW.amount;
      v_profit := -NEW.amount;
    WHEN 'RECEIVE_MONEY' THEN
      v_deposit := NEW.amount;
      v_profit := NEW.amount;
    WHEN 'ADJUSTMENT_ADD' THEN
      v_profit := NEW.amount;
    WHEN 'ADJUSTMENT_SUB' THEN
      v_profit := -NEW.amount;
  END CASE;

  -- Upsert into platform_financial_data with atomic addition
  INSERT INTO public.platform_financial_data (
    user_id, client_id,
    total_deposit, total_withdraw, total_bet, total_win, total_loss, total_profit,
    sync_count, last_sync_at
  )
  VALUES (
    NEW.user_id, NEW.client_id,
    v_deposit, v_withdraw, v_bet, v_win, v_loss, v_profit,
    1, now()
  )
  ON CONFLICT (user_id, client_id) DO UPDATE SET
    total_deposit = platform_financial_data.total_deposit + v_deposit,
    total_withdraw = platform_financial_data.total_withdraw + v_withdraw,
    total_bet = platform_financial_data.total_bet + v_bet,
    total_win = platform_financial_data.total_win + v_win,
    total_loss = platform_financial_data.total_loss + v_loss,
    total_profit = platform_financial_data.total_profit + v_profit,
    sync_count = platform_financial_data.sync_count + 1,
    last_sync_at = now(),
    updated_at = now();

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

CREATE TRIGGER trigger_financial_transaction
AFTER INSERT ON public.financial_transactions
FOR EACH ROW EXECUTE FUNCTION public.update_financial_from_transaction();

-- 4. Reconciliation function with 3 levels
CREATE OR REPLACE FUNCTION public.run_financial_reconciliation(p_admin_id UUID DEFAULT NULL)
RETURNS JSONB AS $$
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
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- 5. Recovery function - recalculate from transactions (Source of Truth)
CREATE OR REPLACE FUNCTION public.recalculate_user_financial(
  p_user_id UUID,
  p_client_id TEXT DEFAULT NULL
)
RETURNS JSONB AS $$
DECLARE
  rec RECORD;
  v_updated INTEGER := 0;
BEGIN
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
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;
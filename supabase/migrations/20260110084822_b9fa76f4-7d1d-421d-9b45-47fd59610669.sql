-- Phase 2: Database Restructuring for Cross-Platform Financial Data

-- 1. Add grand total columns to profiles (aggregated across all platforms)
ALTER TABLE public.profiles
ADD COLUMN IF NOT EXISTS grand_total_deposit BIGINT NOT NULL DEFAULT 0,
ADD COLUMN IF NOT EXISTS grand_total_withdraw BIGINT NOT NULL DEFAULT 0,
ADD COLUMN IF NOT EXISTS grand_total_bet BIGINT NOT NULL DEFAULT 0,
ADD COLUMN IF NOT EXISTS grand_total_win BIGINT NOT NULL DEFAULT 0,
ADD COLUMN IF NOT EXISTS grand_total_loss BIGINT NOT NULL DEFAULT 0,
ADD COLUMN IF NOT EXISTS grand_total_profit BIGINT NOT NULL DEFAULT 0,
ADD COLUMN IF NOT EXISTS financial_updated_at TIMESTAMP WITH TIME ZONE;

-- 2. Create platform_financial_data table for per-platform financial data
CREATE TABLE IF NOT EXISTS public.platform_financial_data (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  client_id TEXT NOT NULL,
  
  -- Financial totals for this platform
  total_deposit BIGINT NOT NULL DEFAULT 0,
  total_withdraw BIGINT NOT NULL DEFAULT 0,
  total_bet BIGINT NOT NULL DEFAULT 0,
  total_win BIGINT NOT NULL DEFAULT 0,
  total_loss BIGINT NOT NULL DEFAULT 0,
  total_profit BIGINT NOT NULL DEFAULT 0,
  
  -- Sync metadata
  last_sync_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  sync_count INTEGER NOT NULL DEFAULT 0,
  client_timestamp TIMESTAMP WITH TIME ZONE,
  
  -- Timestamps
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  
  -- Unique constraint: one record per user per platform
  CONSTRAINT platform_financial_data_unique UNIQUE (user_id, client_id)
);

-- 3. Create index for fast lookups
CREATE INDEX IF NOT EXISTS idx_platform_financial_user_client 
ON public.platform_financial_data(user_id, client_id);

CREATE INDEX IF NOT EXISTS idx_platform_financial_user 
ON public.platform_financial_data(user_id);

-- 4. Enable RLS
ALTER TABLE public.platform_financial_data ENABLE ROW LEVEL SECURITY;

-- 5. RLS Policies for platform_financial_data
-- Users can view their own financial data
CREATE POLICY "Users can view their own financial data"
ON public.platform_financial_data
FOR SELECT
USING (auth.uid() = user_id);

-- Service role can manage financial data (for edge functions)
CREATE POLICY "Service role can manage financial data"
ON public.platform_financial_data
FOR ALL
USING (auth.role() = 'service_role')
WITH CHECK (auth.role() = 'service_role');

-- Admins can view all financial data
CREATE POLICY "Admins can view all financial data"
ON public.platform_financial_data
FOR SELECT
USING (has_role(auth.uid(), 'admin'));

-- 6. Create function to update grand totals in profiles
CREATE OR REPLACE FUNCTION public.update_profile_grand_totals()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Recalculate grand totals from all platforms
  UPDATE public.profiles
  SET 
    grand_total_deposit = COALESCE((
      SELECT SUM(total_deposit) FROM platform_financial_data WHERE user_id = NEW.user_id
    ), 0),
    grand_total_withdraw = COALESCE((
      SELECT SUM(total_withdraw) FROM platform_financial_data WHERE user_id = NEW.user_id
    ), 0),
    grand_total_bet = COALESCE((
      SELECT SUM(total_bet) FROM platform_financial_data WHERE user_id = NEW.user_id
    ), 0),
    grand_total_win = COALESCE((
      SELECT SUM(total_win) FROM platform_financial_data WHERE user_id = NEW.user_id
    ), 0),
    grand_total_loss = COALESCE((
      SELECT SUM(total_loss) FROM platform_financial_data WHERE user_id = NEW.user_id
    ), 0),
    grand_total_profit = COALESCE((
      SELECT SUM(total_profit) FROM platform_financial_data WHERE user_id = NEW.user_id
    ), 0),
    financial_updated_at = now()
  WHERE id = NEW.user_id;
  
  RETURN NEW;
END;
$$;

-- 7. Create trigger to auto-update grand totals when platform data changes
DROP TRIGGER IF EXISTS trigger_update_grand_totals ON public.platform_financial_data;
CREATE TRIGGER trigger_update_grand_totals
AFTER INSERT OR UPDATE ON public.platform_financial_data
FOR EACH ROW
EXECUTE FUNCTION public.update_profile_grand_totals();

-- 8. Create trigger for updated_at
CREATE TRIGGER update_platform_financial_data_updated_at
BEFORE UPDATE ON public.platform_financial_data
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();
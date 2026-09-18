-- Create transactions table for tracking app transactions
CREATE TABLE public.transactions (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  tx_hash TEXT NOT NULL,
  from_address TEXT NOT NULL,
  to_address TEXT NOT NULL,
  amount TEXT NOT NULL,
  token_symbol TEXT NOT NULL,
  token_address TEXT,
  chain_id INTEGER NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.transactions ENABLE ROW LEVEL SECURITY;

-- Users can view their own transactions
CREATE POLICY "Users can view their own transactions"
ON public.transactions FOR SELECT
USING (auth.uid() = user_id);

-- Users can create their own transactions
CREATE POLICY "Users can create their own transactions"
ON public.transactions FOR INSERT
WITH CHECK (auth.uid() = user_id);

-- Create index for faster queries
CREATE INDEX idx_transactions_user_id ON public.transactions(user_id);
CREATE INDEX idx_transactions_created_at ON public.transactions(created_at DESC);

-- Create search logs table for rate limiting
CREATE TABLE public.search_logs (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  search_query TEXT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.search_logs ENABLE ROW LEVEL SECURITY;

-- Users can insert their own search logs
CREATE POLICY "Users can insert their own search logs"
ON public.search_logs FOR INSERT
WITH CHECK (auth.uid() = user_id);

-- Create index for rate limiting checks
CREATE INDEX idx_search_logs_user_created ON public.search_logs(user_id, created_at);

-- Function to check search rate limit
CREATE OR REPLACE FUNCTION public.check_search_rate_limit()
RETURNS TRIGGER AS $$
DECLARE
  search_count INT;
BEGIN
  SELECT COUNT(*) INTO search_count
  FROM search_logs
  WHERE user_id = NEW.user_id
  AND created_at > NOW() - INTERVAL '1 minute';
  
  IF search_count >= 20 THEN
    RAISE EXCEPTION 'Rate limit exceeded: Maximum 20 searches per minute';
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- Trigger for search rate limiting
CREATE TRIGGER check_search_rate_limit_trigger
BEFORE INSERT ON public.search_logs
FOR EACH ROW EXECUTE FUNCTION public.check_search_rate_limit();
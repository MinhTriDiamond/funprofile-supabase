ALTER TABLE public.pplp_mint_requests 
ADD COLUMN IF NOT EXISTS retry_count integer NOT NULL DEFAULT 0;

-- Make sender_id nullable (drop NOT NULL constraint if exists)
ALTER TABLE public.donations ALTER COLUMN sender_id DROP NOT NULL;

-- Add sender_address column for external wallet address
ALTER TABLE public.donations ADD COLUMN IF NOT EXISTS sender_address TEXT;

-- Add is_external flag for external transfers
ALTER TABLE public.donations ADD COLUMN IF NOT EXISTS is_external BOOLEAN DEFAULT false;

-- Index for efficient lookups
CREATE INDEX IF NOT EXISTS idx_donations_is_external ON public.donations(is_external) WHERE is_external = true;
CREATE INDEX IF NOT EXISTS idx_donations_sender_address ON public.donations(sender_address) WHERE sender_address IS NOT NULL;

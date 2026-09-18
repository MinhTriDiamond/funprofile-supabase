
-- 1. Update existing custodial rows to NULL
UPDATE public.profiles SET default_wallet_type = NULL WHERE default_wallet_type = 'custodial';

-- 2. Clear custodial_wallet_address for all rows
UPDATE public.profiles SET custodial_wallet_address = NULL WHERE custodial_wallet_address IS NOT NULL;

-- 3. Drop old constraint and add new one
ALTER TABLE public.profiles DROP CONSTRAINT IF EXISTS profiles_default_wallet_type_check;
ALTER TABLE public.profiles ADD CONSTRAINT profiles_default_wallet_type_check CHECK (default_wallet_type IS NULL OR default_wallet_type IN ('external', 'none'));

-- 4. Change default from 'custodial' to NULL
ALTER TABLE public.profiles ALTER COLUMN default_wallet_type SET DEFAULT NULL;

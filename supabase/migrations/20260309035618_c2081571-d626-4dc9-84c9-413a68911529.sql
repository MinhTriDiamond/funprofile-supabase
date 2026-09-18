-- 1. Add email column to profiles
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS email TEXT;

-- 2. Add login_wallet_address column to profiles
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS login_wallet_address TEXT;

-- 3. Sync email from auth.users for all existing users
UPDATE public.profiles p
SET email = u.email
FROM auth.users u
WHERE p.id = u.id AND u.email IS NOT NULL AND p.email IS NULL;

-- 4. Sync login_wallet_address from user_metadata for wallet-first accounts
UPDATE public.profiles p
SET login_wallet_address = lower(u.raw_user_meta_data->>'wallet_address')
FROM auth.users u
WHERE p.id = u.id 
  AND p.signup_method = 'wallet'
  AND u.raw_user_meta_data->>'wallet_address' IS NOT NULL
  AND p.login_wallet_address IS NULL;

-- 5. Mark deprecated columns with comments
COMMENT ON COLUMN public.profiles.wallet_address IS 'DEPRECATED: Legacy wallet address from early signup. Do not use in new code.';
COMMENT ON COLUMN public.profiles.custodial_wallet_address IS 'DEPRECATED: Custodial wallet removed. Data cleared. Do not use.';
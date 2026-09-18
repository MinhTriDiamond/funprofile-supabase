-- Phase 1: Add hybrid wallet fields to profiles table

-- 1. Add new columns for hybrid wallet system
ALTER TABLE profiles 
  ADD COLUMN IF NOT EXISTS external_wallet_address TEXT,
  ADD COLUMN IF NOT EXISTS custodial_wallet_address TEXT,
  ADD COLUMN IF NOT EXISTS default_wallet_type TEXT DEFAULT 'custodial';

-- 2. Add constraint for default_wallet_type
DO $$ 
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'valid_default_wallet_type'
  ) THEN
    ALTER TABLE profiles 
      ADD CONSTRAINT valid_default_wallet_type 
      CHECK (default_wallet_type IN ('custodial', 'external'));
  END IF;
END $$;

-- 3. Migrate data from custodial_wallets table to custodial_wallet_address
UPDATE profiles p 
SET custodial_wallet_address = cw.wallet_address
FROM custodial_wallets cw 
WHERE cw.user_id = p.id 
  AND cw.is_active = true
  AND p.custodial_wallet_address IS NULL;

-- 4. Migrate external wallet addresses
-- Users who logged in with MetaMask have wallet_address but no custodial wallet
UPDATE profiles 
SET external_wallet_address = wallet_address,
    default_wallet_type = 'external'
WHERE wallet_address IS NOT NULL 
  AND custodial_wallet_address IS NULL;

-- 5. For users with custodial wallet only, set default to custodial
UPDATE profiles 
SET default_wallet_type = 'custodial'
WHERE custodial_wallet_address IS NOT NULL 
  AND external_wallet_address IS NULL
  AND default_wallet_type IS NULL;

-- 6. Create indexes for new wallet columns
CREATE INDEX IF NOT EXISTS idx_profiles_external_wallet 
  ON profiles(external_wallet_address) 
  WHERE external_wallet_address IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_profiles_custodial_wallet 
  ON profiles(custodial_wallet_address) 
  WHERE custodial_wallet_address IS NOT NULL;

-- 7. Add comment to mark wallet_address as deprecated
COMMENT ON COLUMN profiles.wallet_address IS 
  'DEPRECATED: Use external_wallet_address or custodial_wallet_address instead';
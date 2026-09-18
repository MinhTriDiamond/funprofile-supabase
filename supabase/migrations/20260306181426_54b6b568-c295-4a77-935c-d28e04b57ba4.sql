-- Change default reward_status from 'pending' to 'inactive'
ALTER TABLE public.profiles ALTER COLUMN reward_status SET DEFAULT 'inactive';

-- Update existing 'pending' users who lack basic conditions to 'inactive'
UPDATE public.profiles 
SET reward_status = 'inactive'
WHERE reward_status = 'pending'
  AND (
    avatar_url IS NULL 
    OR cover_url IS NULL 
    OR full_name IS NULL 
    OR length(trim(full_name)) < 4
    OR public_wallet_address IS NULL
  );
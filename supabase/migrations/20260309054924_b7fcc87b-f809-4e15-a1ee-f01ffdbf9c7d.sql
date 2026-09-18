-- 1. Drop conflicting legacy constraint
ALTER TABLE public.profiles DROP CONSTRAINT IF EXISTS valid_default_wallet_type;

-- 2. Repair affected user: Minh Trí Test 4
UPDATE public.profiles 
SET external_wallet_address = '0xd84bd996f960da038dcb26af72a438f71e019a60',
    login_wallet_address = '0xd84bd996f960da038dcb26af72a438f71e019a60',
    signup_method = 'wallet',
    account_status = 'limited',
    reward_locked = true,
    default_wallet_type = 'external'
WHERE id = '39dcf6de-5ac9-417b-9a8b-fc52cd3c2061';
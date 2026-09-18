CREATE INDEX IF NOT EXISTS idx_custodial_wallets_lower_addr ON public.custodial_wallets (lower(wallet_address));
CREATE INDEX IF NOT EXISTS idx_profiles_lower_public_wallet ON public.profiles (lower(public_wallet_address));
CREATE INDEX IF NOT EXISTS idx_profiles_lower_btc_address ON public.profiles (lower(btc_address));
CREATE INDEX IF NOT EXISTS idx_btc_aux_lower_address ON public.profile_btc_aux_addresses (lower(address));
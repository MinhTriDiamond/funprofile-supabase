-- Fix search_path cho function normalize_wallet_addresses
CREATE OR REPLACE FUNCTION normalize_wallet_addresses()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.wallet_address := LOWER(NEW.wallet_address);
  NEW.external_wallet_address := LOWER(NEW.external_wallet_address);
  NEW.public_wallet_address := LOWER(NEW.public_wallet_address);
  NEW.login_wallet_address := LOWER(NEW.login_wallet_address);
  RETURN NEW;
END;
$$;
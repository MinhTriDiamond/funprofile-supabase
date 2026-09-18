-- Trigger tự động lowercase wallet addresses khi INSERT/UPDATE
CREATE OR REPLACE FUNCTION normalize_wallet_addresses()
RETURNS TRIGGER AS $$
BEGIN
  NEW.wallet_address := LOWER(NEW.wallet_address);
  NEW.external_wallet_address := LOWER(NEW.external_wallet_address);
  NEW.public_wallet_address := LOWER(NEW.public_wallet_address);
  NEW.login_wallet_address := LOWER(NEW.login_wallet_address);
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_normalize_wallet_addresses
BEFORE INSERT OR UPDATE ON profiles
FOR EACH ROW EXECUTE FUNCTION normalize_wallet_addresses();
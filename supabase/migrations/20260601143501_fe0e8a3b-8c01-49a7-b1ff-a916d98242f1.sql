DROP TRIGGER IF EXISTS trg_prevent_wallet_hijack ON public.profiles;
CREATE TRIGGER trg_prevent_wallet_hijack
  BEFORE INSERT OR UPDATE OF public_wallet_address, external_wallet_address, wallet_address, custodial_wallet_address
  ON public.profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.prevent_wallet_hijack();
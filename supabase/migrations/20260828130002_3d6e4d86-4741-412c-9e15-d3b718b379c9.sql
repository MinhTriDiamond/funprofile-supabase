CREATE OR REPLACE VIEW public.v_internal_addresses
WITH (security_invoker = true) AS
  SELECT DISTINCT addr FROM (
    SELECT lower(cw.wallet_address) AS addr
      FROM public.custodial_wallets cw
     WHERE cw.wallet_address IS NOT NULL AND cw.wallet_address <> ''
    UNION ALL
    SELECT lower(p.public_wallet_address)
      FROM public.profiles p
     WHERE p.public_wallet_address IS NOT NULL AND p.public_wallet_address <> ''
    UNION ALL
    SELECT lower(p.btc_address)
      FROM public.profiles p
     WHERE p.btc_address IS NOT NULL AND p.btc_address <> ''
    UNION ALL
    SELECT lower(a.address)
      FROM public.profile_btc_aux_addresses a
     WHERE a.address IS NOT NULL AND a.address <> ''
  ) s
  WHERE addr IS NOT NULL;

GRANT SELECT ON public.v_internal_addresses TO authenticated;
GRANT SELECT ON public.v_internal_addresses TO service_role;
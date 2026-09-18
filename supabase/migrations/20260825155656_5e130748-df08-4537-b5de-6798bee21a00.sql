REVOKE ALL ON FUNCTION public.claim_btc_ownership(text, uuid, text, text, uuid, text) FROM anon, authenticated;
REVOKE ALL ON FUNCTION public.log_btc_resolver_shadow_comparison(
  text, text, uuid, text, text, text, timestamptz, text, text, text
) FROM anon, authenticated;
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'donations','user_roles','custodial_wallets','otp_codes','wallet_challenges',
    'pplp_mint_requests','reward_approvals','profile_btc_aux_addresses',
    'blacklisted_ips','blacklisted_wallets','notifications','red_envelopes','system_config'
  ] LOOP
    EXECUTE format(
      'REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON public.%I FROM anon',
      t
    );
  END LOOP;
END $$;
-- 1. BTC backup/orphan tables: enable RLS + admin-only
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'btc_aux_misattribution_audit_20260612',
    'btc_donations_wrong_father_backup_20260621',
    'btc_father_aux_full_backup_20260621',
    'btc_transactions_orphan_backup_20260621',
    'btc_wallet_transfers_orphan_backup_20260621'
  ] LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('REVOKE ALL ON public.%I FROM anon, authenticated', t);
    EXECUTE format('GRANT SELECT ON public.%I TO authenticated', t);
    EXECUTE format('GRANT ALL ON public.%I TO service_role', t);
    EXECUTE format($f$DROP POLICY IF EXISTS "%s_admin_read" ON public.%I$f$, t, t);
    EXECUTE format($f$CREATE POLICY "%s_admin_read" ON public.%I FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'::app_role))$f$, t, t);
  END LOOP;
END $$;

-- 2. swap_transactions / wallet_transfers: owner + admin only
DROP POLICY IF EXISTS "Anyone can view swap transactions" ON public.swap_transactions;
CREATE POLICY "Owner or admin can view swap transactions"
  ON public.swap_transactions FOR SELECT TO authenticated
  USING (auth.uid() = user_id OR public.has_role(auth.uid(), 'admin'::app_role));

DROP POLICY IF EXISTS "Anyone can view wallet transfers" ON public.wallet_transfers;
CREATE POLICY "Owner or admin can view wallet transfers"
  ON public.wallet_transfers FOR SELECT TO authenticated
  USING (auth.uid() = user_id OR public.has_role(auth.uid(), 'admin'::app_role));

REVOKE SELECT ON public.swap_transactions FROM anon;
REVOKE SELECT ON public.wallet_transfers FROM anon;

-- 3. live_sessions: hide streaming secrets from anon/authenticated via column grants
DO $$
DECLARE cols text;
BEGIN
  SELECT string_agg(format('%I', column_name), ', ')
    INTO cols
  FROM information_schema.columns
  WHERE table_schema = 'public' AND table_name = 'live_sessions'
    AND column_name NOT IN ('stream_key_encrypted', 'rtmps_url', 'armed_session_token');

  EXECUTE 'REVOKE SELECT ON public.live_sessions FROM anon, authenticated';
  EXECUTE format('GRANT SELECT (%s) ON public.live_sessions TO anon, authenticated', cols);
  EXECUTE 'GRANT ALL ON public.live_sessions TO service_role';
END $$;

-- 4. mystery_box_orders / pet_shop_orders: drop public base-table read, serve public feed via definer views
DROP POLICY IF EXISTS "mb_orders_public_read_confirmed" ON public.mystery_box_orders;
DROP POLICY IF EXISTS "orders_public_read_confirmed" ON public.pet_shop_orders;
ALTER VIEW public.mystery_box_orders_public SET (security_invoker = off);
ALTER VIEW public.pet_shop_orders_public SET (security_invoker = off);
GRANT SELECT ON public.mystery_box_orders_public TO anon, authenticated;
GRANT SELECT ON public.pet_shop_orders_public TO anon, authenticated;
REVOKE SELECT ON public.mystery_box_orders FROM anon;
REVOKE SELECT ON public.pet_shop_orders FROM anon;

-- 5. profiles: column-level exposure control
DO $$
DECLARE
  anon_cols text;
  auth_cols text;
  anon_allow text[] := ARRAY[
    'id','username','username_normalized','full_name','display_name','avatar_url','cover_url','bio',
    'created_at','updated_at','location','workplace','education','relationship_status','social_links',
    'is_banned','is_restricted','account_status','fun_id','soul_level','pinned_post_id',
    'public_wallet_address','btc_address','btc_addresses','total_rewards',
    'total_light_score','display_light_score','raw_light_score','light_tier','iis_value',
    'identity_verified','identity_verified_at','identity_level','trust_level',
    'is_live','current_live_session_id','live_started_at','preferred_language','exclude_from_leaderboard',
    'law_of_light_accepted','law_of_light_accepted_at'
  ];
  auth_deny text[] := ARRAY[
    'email','farming_score','suspected_farming','avatar_phash','email_verified_at',
    'impersonation_scanned_at','cross_platform_data'
  ];
BEGIN
  SELECT string_agg(format('%I', column_name), ', ') INTO anon_cols
  FROM information_schema.columns
  WHERE table_schema='public' AND table_name='profiles' AND column_name = ANY(anon_allow);

  SELECT string_agg(format('%I', column_name), ', ') INTO auth_cols
  FROM information_schema.columns
  WHERE table_schema='public' AND table_name='profiles' AND NOT (column_name = ANY(auth_deny));

  EXECUTE 'REVOKE SELECT ON public.profiles FROM anon, authenticated';
  EXECUTE format('GRANT SELECT (%s) ON public.profiles TO anon', anon_cols);
  EXECUTE format('GRANT SELECT (%s) ON public.profiles TO authenticated', auth_cols);
  EXECUTE 'GRANT ALL ON public.profiles TO service_role';
END $$;
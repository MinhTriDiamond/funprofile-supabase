CREATE OR REPLACE FUNCTION public.refresh_app_stats_cache()
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  cutoff_date CONSTANT TIMESTAMPTZ := '2026-01-15 00:00:00+00';
  v_total_users BIGINT; v_total_posts BIGINT; v_total_photos BIGINT; v_total_videos BIGINT;
  v_total_livestreams BIGINT; v_total_rewards NUMERIC; v_treasury NUMERIC; v_claimed NUMERIC;
  v_user_count BIGINT; v_old_reward NUMERIC; v_new_reward NUMERIC;
  v_videos_combined BIGINT; v_sent JSONB; v_recv JSONB;
BEGIN
  SELECT COUNT(*) INTO v_total_users FROM profiles WHERE is_banned = false;
  SELECT COUNT(*) INTO v_total_posts FROM posts WHERE deleted_at IS NULL AND (post_type IS NULL OR post_type <> 'gift_celebration');
  SELECT COUNT(*) INTO v_total_photos FROM posts WHERE deleted_at IS NULL AND media_urls IS NOT NULL AND jsonb_array_length(media_urls) > 0;
  SELECT COUNT(*) INTO v_total_videos FROM posts WHERE deleted_at IS NULL AND video_url IS NOT NULL;
  SELECT COUNT(*) INTO v_total_livestreams FROM live_sessions WHERE status = 'ended';
  v_videos_combined := v_total_posts + v_total_livestreams;
  SELECT COALESCE(SUM(amount), 0) INTO v_treasury FROM reward_claims;
  v_claimed := v_treasury;
  SELECT COUNT(*) INTO v_user_count FROM profiles;
  v_old_reward := 0; v_new_reward := 0;
  v_total_rewards := (v_user_count * 50000);

  -- SENT = chỉ giao dịch từ user nội bộ
  SELECT COALESCE(jsonb_object_agg(sym, total), '{}'::jsonb) INTO v_sent
  FROM (
    SELECT UPPER(d.token_symbol) AS sym, SUM(d.amount::numeric) AS total
    FROM donations d
    WHERE d.status='confirmed' AND d.amount ~ '^[0-9]+(\.[0-9]*)?$'
      AND d.token_symbol IS NOT NULL AND d.sender_id IS NOT NULL
    GROUP BY UPPER(d.token_symbol)
  ) z;

  -- RECEIVED = mọi giao dịch on-chain vào user thật (gồm cả ví ngoài)
  SELECT COALESCE(jsonb_object_agg(sym, total), '{}'::jsonb) INTO v_recv
  FROM (
    SELECT UPPER(d.token_symbol) AS sym, SUM(d.amount::numeric) AS total
    FROM donations d
    LEFT JOIN profiles pr ON pr.id = d.recipient_id
    WHERE d.status='confirmed' AND d.amount ~ '^[0-9]+(\.[0-9]*)?$'
      AND d.token_symbol IS NOT NULL AND d.recipient_id IS NOT NULL
      AND NOT COALESCE(pr.exclude_from_leaderboard, false)
      AND d.leaderboard_eligibility IN ('internal','external_to_father','external_excluded')
    GROUP BY UPPER(d.token_symbol)
  ) z;

  INSERT INTO app_stats_cache (id, total_users, total_posts, total_photos, total_videos, total_livestreams,
    total_videos_combined, total_rewards, treasury_camly_received, total_camly_claimed,
    sent_token_totals, received_token_totals, refreshed_at)
  VALUES (1, v_total_users, v_total_posts, v_total_photos, v_total_videos, v_total_livestreams,
    v_videos_combined, v_total_rewards, v_treasury, v_claimed, v_sent, v_recv, now())
  ON CONFLICT (id) DO UPDATE SET
    total_users=EXCLUDED.total_users, total_posts=EXCLUDED.total_posts, total_photos=EXCLUDED.total_photos,
    total_videos=EXCLUDED.total_videos, total_livestreams=EXCLUDED.total_livestreams,
    total_videos_combined=EXCLUDED.total_videos_combined, total_rewards=EXCLUDED.total_rewards,
    treasury_camly_received=EXCLUDED.treasury_camly_received, total_camly_claimed=EXCLUDED.total_camly_claimed,
    sent_token_totals=EXCLUDED.sent_token_totals, received_token_totals=EXCLUDED.received_token_totals,
    refreshed_at=EXCLUDED.refreshed_at;
END; $function$;

CREATE OR REPLACE FUNCTION public.refresh_donation_board_base()
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE n integer;
BEGIN
  DELETE FROM public.donation_board_base;
  INSERT INTO public.donation_board_base (sender_id, recipient_id, token_symbol, amount_num, amount_usd, tx_hash, light_score_earned, chain_id, status, created_at, sender_excluded, recipient_excluded, registry_eligible, registry_max_single_usd)
  SELECT d.sender_id, d.recipient_id, d.token_symbol,
    CASE WHEN d.amount ~ '^[0-9]+(\.[0-9]*)?$' THEN d.amount::numeric END,
    COALESCE(d.amount_usd, 0)::numeric,
    d.tx_hash,
    COALESCE(d.light_score_earned, 0)::numeric,
    d.chain_id, d.status, d.created_at,
    COALESCE(ps.exclude_from_leaderboard, false),
    COALESCE(pr.exclude_from_leaderboard, false),
    (trg.symbol IS NOT NULL),
    trg.max_single_usd
  FROM public.donations d
  JOIN public.profiles ps ON ps.id = d.sender_id
  JOIN public.profiles pr ON pr.id = d.recipient_id
  LEFT JOIN LATERAL (
    SELECT tr.symbol, tr.max_single_usd FROM public.tokens_registry tr
    WHERE tr.chain_id = d.chain_id AND upper(tr.symbol) = upper(d.token_symbol)
      AND tr.is_leaderboard_eligible = true AND tr.is_active = true
    LIMIT 1
  ) trg ON true
  WHERE d.sender_id IS NOT NULL AND d.recipient_id IS NOT NULL AND d.sender_id <> d.recipient_id
    AND COALESCE(d.is_external, false) = false AND d.leaderboard_eligibility = 'internal';
  GET DIAGNOSTICS n = ROW_COUNT;
  RETURN n;
END;
$function$;

CREATE OR REPLACE FUNCTION public.refresh_gift_breakdown_cache()
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  n integer;
BEGIN
  DELETE FROM public.gift_breakdown_cache;

  -- donations, internal (== gift breakdown's donations set)
  INSERT INTO public.gift_breakdown_cache (source, direction, token_symbol, tx_count, total_amount)
  SELECT 'donations_internal', 'all', public.normalize_price_symbol(d.token_symbol),
         COUNT(*)::bigint, COALESCE(SUM((d.amount)::numeric), 0)
  FROM public.donations d
  WHERE d.status = 'confirmed'
    AND d.amount ~ '^[0-9]+(\.[0-9]*)?$'
    AND d.is_external IS NOT TRUE
    AND d.sender_id IS NOT NULL
    AND d.recipient_id IS NOT NULL
  GROUP BY public.normalize_price_symbol(d.token_symbol);

  -- donations, external
  INSERT INTO public.gift_breakdown_cache (source, direction, token_symbol, tx_count, total_amount)
  SELECT 'donations_external', 'all', public.normalize_price_symbol(d.token_symbol),
         COUNT(*)::bigint, COALESCE(SUM((d.amount)::numeric), 0)
  FROM public.donations d
  WHERE d.status = 'confirmed'
    AND d.amount ~ '^[0-9]+(\.[0-9]*)?$'
    AND (d.is_external IS TRUE OR d.sender_id IS NULL OR d.recipient_id IS NULL)
  GROUP BY public.normalize_price_symbol(d.token_symbol);

  -- wallet transfers, both directions
  INSERT INTO public.gift_breakdown_cache (source, direction, token_symbol, tx_count, total_amount)
  SELECT 'wallet_transfers',
         CASE wt.direction WHEN 'in' THEN 'received' ELSE 'sent' END,
         public.normalize_price_symbol(wt.token_symbol),
         COUNT(*)::bigint, COALESCE(SUM(wt.amount), 0)
  FROM public.wallet_transfers wt
  WHERE wt.status = 'confirmed' AND wt.direction IN ('in', 'out')
  GROUP BY 2, public.normalize_price_symbol(wt.token_symbol);

  -- swaps: 'sent' leg uses from_*, 'received' leg uses to_* (mirrors the RPC's CASE)
  INSERT INTO public.gift_breakdown_cache (source, direction, token_symbol, tx_count, total_amount)
  SELECT 'swaps', 'sent', public.normalize_price_symbol(s.from_symbol),
         COUNT(*)::bigint, COALESCE(SUM(s.from_amount), 0)
  FROM public.swap_transactions s
  WHERE s.status = 'confirmed'
  GROUP BY public.normalize_price_symbol(s.from_symbol);

  INSERT INTO public.gift_breakdown_cache (source, direction, token_symbol, tx_count, total_amount)
  SELECT 'swaps', 'received', public.normalize_price_symbol(s.to_symbol),
         COUNT(*)::bigint, COALESCE(SUM(s.to_amount), 0)
  FROM public.swap_transactions s
  WHERE s.status = 'confirmed'
  GROUP BY public.normalize_price_symbol(s.to_symbol);

  UPDATE public.gift_breakdown_cache SET refreshed_at = now();
  SELECT COUNT(*) INTO n FROM public.gift_breakdown_cache;
  RETURN n;
END;
$function$;
SELECT public.refresh_donation_board_base() AS board_rows;
SELECT public.refresh_gift_breakdown_cache() AS gift_rows;

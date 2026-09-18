-- ============================================================
-- BTC Raw-Satoshi Guard: RPC + notifications CHECK constraint
-- Verified 2026-07-13: 0 row nằm ngoài danh sách 41 type mới.
-- Migration chạy trong 1 transaction → DROP+ADD CHECK atomic.
-- ============================================================

CREATE OR REPLACE FUNCTION public.btc_raw_sat_guard_scan()
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  offenders_threshold jsonb;
  offenders_ratio jsonb;
  ok1 boolean;
  ok2 boolean;
BEGIN
  -- Tầng 1: ngưỡng > 1000 (bắt satoshi thô cỡ lớn)
  -- wallet_transfers.amount là numeric (verified 2026-07-13),
  -- KHÔNG cần cast; transactions/donations là text nên phải ::numeric.
  WITH offenders AS (
    SELECT 'transactions' AS source_table, id::text AS row_id, tx_hash,
           amount::numeric AS amt
    FROM public.transactions
    WHERE token_symbol = 'BTC' AND amount::numeric > 1000
    UNION ALL
    SELECT 'donations', id::text, tx_hash, amount::numeric
    FROM public.donations
    WHERE token_symbol = 'BTC' AND amount::numeric > 1000
    UNION ALL
    SELECT 'wallet_transfers', id::text, tx_hash, amount
    FROM public.wallet_transfers
    WHERE token_symbol = 'BTC' AND amount > 1000
  )
  SELECT COALESCE(jsonb_agg(to_jsonb(o.*)), '[]'::jsonb) INTO offenders_threshold
  FROM offenders o;
  ok1 := (jsonb_array_length(offenders_threshold) = 0);

  -- Tầng 2: cross-table ratio ~10^8 (bản chất bug — cùng tx_hash, 1 bảng raw, 1 bảng canonical)
  WITH all_btc AS (
    SELECT 'transactions' AS source_table, tx_hash, amount::numeric AS amt
    FROM public.transactions
    WHERE token_symbol = 'BTC' AND tx_hash IS NOT NULL AND amount::numeric > 0
    UNION ALL
    SELECT 'donations', tx_hash, amount::numeric
    FROM public.donations
    WHERE token_symbol = 'BTC' AND tx_hash IS NOT NULL AND amount::numeric > 0
    UNION ALL
    SELECT 'wallet_transfers', tx_hash, amount
    FROM public.wallet_transfers
    WHERE token_symbol = 'BTC' AND tx_hash IS NOT NULL AND amount > 0
  ),
  grouped AS (
    SELECT tx_hash,
           max(amt) AS max_amt,
           min(amt) AS min_amt,
           count(DISTINCT source_table) AS src_count,
           jsonb_agg(source_table || ':' || amt::text ORDER BY source_table) AS variants
    FROM all_btc
    GROUP BY tx_hash
  )
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
           'tx_hash', tx_hash,
           'max_amt', max_amt,
           'min_amt', min_amt,
           'ratio', (max_amt / NULLIF(min_amt, 0)),
           'variants', variants
         )), '[]'::jsonb) INTO offenders_ratio
  FROM grouped
  WHERE src_count >= 2
    AND min_amt > 0
    AND (max_amt / min_amt) BETWEEN 99999999.5 AND 100000000.5;
  ok2 := (jsonb_array_length(offenders_ratio) = 0);

  RETURN jsonb_build_object(
    'threshold_1000', jsonb_build_object('ok', ok1, 'offenders', offenders_threshold),
    'cross_table_ratio_1e8', jsonb_build_object('ok', ok2, 'offenders', offenders_ratio),
    'checked_at', now()
  );
END;
$$;

REVOKE ALL ON FUNCTION public.btc_raw_sat_guard_scan() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.btc_raw_sat_guard_scan() TO service_role;

-- ============================================================
-- notifications.type CHECK — 40 giá trị cũ + btc_guard_drift = 41
-- Đã verify: SELECT DISTINCT type WHERE type <> ALL(...) = 0 row
-- DROP + ADD trong cùng migration/transaction → atomic
-- ============================================================
ALTER TABLE public.notifications DROP CONSTRAINT IF EXISTS notifications_type_check;
ALTER TABLE public.notifications ADD CONSTRAINT notifications_type_check
  CHECK (type = ANY (ARRAY[
    'account_banned','account_unbanned','admin_email_farm','admin_fraud_daily',
    'admin_shared_device','attestation_received','btc_guard_drift','buddy_invite',
    'care','claim_reward','comment','comment_like','did_promoted','donation',
    'epoch_claim_ready','epoch_reset_info','friend_accepted','friend_removed',
    'friend_request','fun_mint_confirmed','fun_mint_signed','haha',
    'impersonation_alert','like','live_replay_failed','live_started','love',
    'mint_request_rejected','mystery_box_legendary','mystery_box_received',
    'pet_battle_challenge','pet_battle_result','pet_lumi_ready','post_tagged',
    'pray','recovery_initiated','reward_adjustment','sbt_issued','sbt_issued_quest',
    'wallet_reconciliation_alert','wow'
  ]));

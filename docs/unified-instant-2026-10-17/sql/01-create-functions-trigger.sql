-- append_donation_to_snapshot: instantly project one donation's unified-history rows
-- into public.unified_transactions_snapshot, replicating v_unified_transactions (don_out/don_in)
-- + the v_unified_transactions_primary wrapper rules (spam/ingest-filter/blacklist/dedup contest).
-- Created 2026-10-17 (Tri + Angel Muse). Records: docs/unified-instant-2026-10-17/
CREATE OR REPLACE FUNCTION public.append_donation_to_snapshot(p_donation_id uuid)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  r record;
  v_key text;
  v_inserted integer := 0;
BEGIN
  FOR r IN
      SELECT (('donations:'::text || (d.id)::text) || ':out'::text) AS id,
            'donations'::text AS source_table,
            (d.id)::text AS source_id,
            d.sender_id AS user_id,
            d.recipient_id AS counterparty_user_id,
            d.tx_hash,
            CASE
                    WHEN ((d.chain_family = 'btc'::text) OR (d.chain_id = 0) OR (upper(d.token_symbol) = 'BTC'::text)) THEN 'btc'::text
                    WHEN (d.chain_id = 56) THEN 'bsc'::text
                    WHEN (d.chain_id = 97) THEN 'bsc_testnet'::text
                    WHEN (d.chain_id = 1) THEN 'ethereum'::text
                    ELSE COALESCE(d.chain_family, 'unknown'::text)
                END AS chain,
            d.chain_id,
            CASE
                    WHEN ((d.chain_family = 'btc'::text) OR (d.chain_id = 0) OR (upper(d.token_symbol) = 'BTC'::text)) THEN 'btc'::text
                    WHEN (d.chain_id = 56) THEN 'bsc'::text
                    WHEN (d.chain_id = 97) THEN 'bsc_testnet'::text
                    WHEN (d.chain_id = 1) THEN 'ethereum'::text
                    ELSE COALESCE(d.chain_family, 'unknown'::text)
                END AS network,
            upper(d.token_symbol) AS token_symbol,
            lower(NULLIF(d.token_address, ''::text)) AS token_address,
            _resolve_decimals(d.token_symbol, d.chain_id, d.token_address) AS decimals,
            'out'::text AS direction,
            'gift'::text AS tx_type,
            d.status,
            COALESCE(d.is_external, false) AS is_external,
            d.amount AS amount_raw,
            _safe_numeric(d.amount) AS amount_decimal,
            d.fee AS fee_raw,
            d.block_number,
            COALESCE(d.confirmed_at, d.created_at) AS occurred_at,
            d.confirmed_at,
            d.created_at,
            d.message AS memo,
            lower(NULLIF(d.sender_address, ''::text)) AS sender_address,
            lower(NULLIF(d.recipient_address, ''::text)) AS recipient_address,
            'exact'::text AS direction_confidence,
            jsonb_build_object('card_theme', d.card_theme, 'card_sound', d.card_sound, 'leaderboard_eligibility', d.leaderboard_eligibility, 'price_usd', d.price_usd_at_donation, 'amount_usd', d.amount_usd) AS metadata,
            COALESCE((d.filter_status = 'filtered_spam'::text), false) AS is_spam
           FROM donations d
          WHERE d.id = p_donation_id AND (d.sender_id IS NOT NULL)
      UNION ALL
      SELECT (('donations:'::text || (d.id)::text) || ':in'::text) AS id,
            'donations'::text AS source_table,
            (d.id)::text AS source_id,
            d.recipient_id AS user_id,
            d.sender_id AS counterparty_user_id,
            d.tx_hash,
            CASE
                    WHEN ((d.chain_family = 'btc'::text) OR (d.chain_id = 0) OR (upper(d.token_symbol) = 'BTC'::text)) THEN 'btc'::text
                    WHEN (d.chain_id = 56) THEN 'bsc'::text
                    WHEN (d.chain_id = 97) THEN 'bsc_testnet'::text
                    WHEN (d.chain_id = 1) THEN 'ethereum'::text
                    ELSE COALESCE(d.chain_family, 'unknown'::text)
                END AS chain,
            d.chain_id,
            CASE
                    WHEN ((d.chain_family = 'btc'::text) OR (d.chain_id = 0) OR (upper(d.token_symbol) = 'BTC'::text)) THEN 'btc'::text
                    WHEN (d.chain_id = 56) THEN 'bsc'::text
                    WHEN (d.chain_id = 97) THEN 'bsc_testnet'::text
                    WHEN (d.chain_id = 1) THEN 'ethereum'::text
                    ELSE COALESCE(d.chain_family, 'unknown'::text)
                END AS network,
            upper(d.token_symbol) AS token_symbol,
            lower(NULLIF(d.token_address, ''::text)) AS token_address,
            _resolve_decimals(d.token_symbol, d.chain_id, d.token_address) AS decimals,
            'in'::text AS direction,
            'gift'::text AS tx_type,
            d.status,
            COALESCE(d.is_external, false) AS is_external,
            d.amount AS amount_raw,
            _safe_numeric(d.amount) AS amount_decimal,
            d.fee AS fee_raw,
            d.block_number,
            COALESCE(d.confirmed_at, d.created_at) AS occurred_at,
            d.confirmed_at,
            d.created_at,
            d.message AS memo,
            lower(NULLIF(d.sender_address, ''::text)) AS sender_address,
            lower(NULLIF(d.recipient_address, ''::text)) AS recipient_address,
            'exact'::text AS direction_confidence,
            jsonb_build_object('card_theme', d.card_theme, 'card_sound', d.card_sound, 'leaderboard_eligibility', d.leaderboard_eligibility, 'price_usd', d.price_usd_at_donation, 'amount_usd', d.amount_usd) AS metadata,
            COALESCE((d.filter_status = 'filtered_spam'::text), false) AS is_spam
           FROM donations d
          WHERE d.id = p_donation_id AND (d.recipient_id IS NOT NULL)
  LOOP
    -- wrapper filter 1: spam rows are excluded from the primary view
    IF r.is_spam IS TRUE THEN
      CONTINUE;
    END IF;
    -- wrapper filter 2: token ingest filters (bsc/btc dust thresholds)
    IF EXISTS (
      SELECT 1 FROM token_ingest_filters f
       WHERE f.enabled IS TRUE
         AND lower(f.chain) = lower(COALESCE(r.chain, ''::text))
         AND upper(f.token_symbol) = upper(COALESCE(r.token_symbol, ''::text))
         AND r.chain = ANY (ARRAY['bsc'::text, 'btc'::text])
         AND abs(COALESCE(r.amount_decimal, 0::numeric)) < f.min_amount
    ) THEN
      CONTINUE;
    END IF;
    -- wrapper filter 3: blacklisted sender wallets
    IF EXISTS (
      SELECT 1 FROM blacklisted_wallets b
       WHERE lower(b.wallet_address) = lower(COALESCE(r.sender_address, ''::text))
    ) THEN
      CONTINUE;
    END IF;

    v_key := COALESCE(lower(r.tx_hash), (('no-hash:'::text || r.source_table) || ':'::text) || r.source_id);

    -- replay safety: identical row already in the snapshot
    IF EXISTS (SELECT 1 FROM unified_transactions_snapshot s WHERE s.id = r.id) THEN
      CONTINUE;
    END IF;

    -- dedup contest inside the partition (user, tx key, direction):
    -- an existing donations row with occurred_at >= the new row's wins (primary orders occurred_at DESC)
    IF EXISTS (
      SELECT 1 FROM unified_transactions_snapshot s
       WHERE s.user_id = r.user_id
         AND s.direction = r.direction
         AND s.source_table = 'donations'::text
         AND COALESCE(lower(s.tx_hash), (('no-hash:'::text || s.source_table) || ':'::text) || s.source_id) = v_key
         AND COALESCE(s.occurred_at, '-infinity'::timestamptz) >= COALESCE(r.occurred_at, '-infinity'::timestamptz)
    ) THEN
      CONTINUE;
    END IF;

    -- the new row wins its partition: remove competitors (older donations + on-chain echoes)
    DELETE FROM unified_transactions_snapshot s
     WHERE s.user_id = r.user_id
       AND s.direction = r.direction
       AND COALESCE(lower(s.tx_hash), (('no-hash:'::text || s.source_table) || ':'::text) || s.source_id) = v_key;

    INSERT INTO unified_transactions_snapshot (
      id, source_table, source_id, user_id, counterparty_user_id, tx_hash, chain, chain_id,
      network, token_symbol, token_address, decimals, direction, tx_type, status, is_external,
      amount_raw, amount_decimal, fee_raw, block_number, occurred_at, confirmed_at, created_at,
      memo, sender_address, recipient_address, direction_confidence, metadata, dedup_rank, is_spam)
    VALUES (
      r.id, r.source_table, r.source_id, r.user_id, r.counterparty_user_id, r.tx_hash, r.chain,
      r.chain_id, r.network, r.token_symbol, r.token_address, r.decimals, r.direction, r.tx_type,
      r.status, r.is_external, r.amount_raw, r.amount_decimal, r.fee_raw, r.block_number,
      r.occurred_at, r.confirmed_at, r.created_at, r.memo, r.sender_address, r.recipient_address,
      r.direction_confidence, r.metadata, 1, r.is_spam);
    v_inserted := v_inserted + 1;
  END LOOP;
  RETURN v_inserted;
END;
$function$;

-- Trigger wrapper: NEVER let snapshot bookkeeping break the gift itself.
CREATE OR REPLACE FUNCTION public.trg_donations_snapshot_append()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  BEGIN
    PERFORM public.append_donation_to_snapshot(NEW.id);
  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'append_donation_to_snapshot failed for donation %: %', NEW.id, SQLERRM;
  END;
  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS trg_donations_snapshot_append ON public.donations;
CREATE TRIGGER trg_donations_snapshot_append
  AFTER INSERT ON public.donations
  FOR EACH ROW
  EXECUTE FUNCTION public.trg_donations_snapshot_append();

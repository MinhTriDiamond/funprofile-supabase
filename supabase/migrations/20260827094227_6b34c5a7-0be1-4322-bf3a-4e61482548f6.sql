CREATE OR REPLACE VIEW public.v_unified_transactions AS
 WITH don_out AS (
         SELECT ('donations:'::text || d.id::text) || ':out'::text AS id,
            'donations'::text AS source_table,
            d.id::text AS source_id,
            d.sender_id AS user_id,
            d.recipient_id AS counterparty_user_id,
            d.tx_hash,
                CASE
                    WHEN d.chain_family = 'btc'::text OR d.chain_id = 0 OR upper(d.token_symbol) = 'BTC'::text THEN 'btc'::text
                    WHEN d.chain_id = 56 THEN 'bsc'::text
                    WHEN d.chain_id = 97 THEN 'bsc_testnet'::text
                    WHEN d.chain_id = 1 THEN 'ethereum'::text
                    ELSE COALESCE(d.chain_family, 'unknown'::text)
                END AS chain,
            d.chain_id,
                CASE
                    WHEN d.chain_family = 'btc'::text OR d.chain_id = 0 OR upper(d.token_symbol) = 'BTC'::text THEN 'btc'::text
                    WHEN d.chain_id = 56 THEN 'bsc'::text
                    WHEN d.chain_id = 97 THEN 'bsc_testnet'::text
                    WHEN d.chain_id = 1 THEN 'ethereum'::text
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
            COALESCE(d.filter_status = 'filtered_spam', false) AS is_spam
           FROM donations d
          WHERE d.sender_id IS NOT NULL
        ), don_in AS (
         SELECT ('donations:'::text || d.id::text) || ':in'::text AS id,
            'donations'::text AS source_table,
            d.id::text AS source_id,
            d.recipient_id AS user_id,
            d.sender_id AS counterparty_user_id,
            d.tx_hash,
                CASE
                    WHEN d.chain_family = 'btc'::text OR d.chain_id = 0 OR upper(d.token_symbol) = 'BTC'::text THEN 'btc'::text
                    WHEN d.chain_id = 56 THEN 'bsc'::text
                    WHEN d.chain_id = 97 THEN 'bsc_testnet'::text
                    WHEN d.chain_id = 1 THEN 'ethereum'::text
                    ELSE COALESCE(d.chain_family, 'unknown'::text)
                END AS chain,
            d.chain_id,
                CASE
                    WHEN d.chain_family = 'btc'::text OR d.chain_id = 0 OR upper(d.token_symbol) = 'BTC'::text THEN 'btc'::text
                    WHEN d.chain_id = 56 THEN 'bsc'::text
                    WHEN d.chain_id = 97 THEN 'bsc_testnet'::text
                    WHEN d.chain_id = 1 THEN 'ethereum'::text
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
            COALESCE(d.filter_status = 'filtered_spam', false) AS is_spam
           FROM donations d
          WHERE d.recipient_id IS NOT NULL
        ), wt AS (
         SELECT 'wallet_transfers:'::text || w.id::text AS id,
            'wallet_transfers'::text AS source_table,
            w.id::text AS source_id,
            w.user_id,
            NULL::uuid AS counterparty_user_id,
            w.tx_hash,
                CASE
                    WHEN upper(w.token_symbol) = 'BTC'::text OR w.chain_id = 0 THEN 'btc'::text
                    WHEN w.chain_id = 56 THEN 'bsc'::text
                    WHEN w.chain_id = 97 THEN 'bsc_testnet'::text
                    WHEN w.chain_id = 1 THEN 'ethereum'::text
                    ELSE COALESCE(w.chain_family, 'unknown'::text)
                END AS chain,
            w.chain_id,
                CASE
                    WHEN upper(w.token_symbol) = 'BTC'::text OR w.chain_id = 0 THEN 'btc'::text
                    WHEN w.chain_id = 56 THEN 'bsc'::text
                    WHEN w.chain_id = 97 THEN 'bsc_testnet'::text
                    WHEN w.chain_id = 1 THEN 'ethereum'::text
                    ELSE COALESCE(w.chain_family, 'unknown'::text)
                END AS network,
            upper(w.token_symbol) AS token_symbol,
            lower(NULLIF(w.token_address, ''::text)) AS token_address,
            _resolve_decimals(w.token_symbol, w.chain_id, w.token_address) AS decimals,
                CASE
                    WHEN w.direction = ANY (ARRAY['in'::text, 'out'::text, 'internal'::text]) THEN w.direction
                    ELSE 'unknown'::text
                END AS direction,
            'external'::text AS tx_type,
            w.status,
            true AS is_external,
            w.amount::text AS amount_raw,
            _safe_numeric(w.amount::text) AS amount_decimal,
            w.fee AS fee_raw,
            NULL::bigint AS block_number,
            w.created_at AS occurred_at,
            NULL::timestamp with time zone AS confirmed_at,
            w.created_at,
            NULL::text AS memo,
            NULL::text AS sender_address,
            lower(NULLIF(w.counterparty_address, ''::text)) AS recipient_address,
            'exact'::text AS direction_confidence,
            jsonb_build_object('confirmations', w.confirmations, 'counterparty_address', lower(w.counterparty_address)) AS metadata,
            false AS is_spam
           FROM wallet_transfers w
        ), tx AS (
         SELECT 'transactions:'::text || t.id::text AS id,
            'transactions'::text AS source_table,
            t.id::text AS source_id,
            t.user_id,
            NULL::uuid AS counterparty_user_id,
            t.tx_hash,
                CASE
                    WHEN upper(t.token_symbol) = 'BTC'::text OR t.chain_id = 0 THEN 'btc'::text
                    WHEN t.chain_id = 56 THEN 'bsc'::text
                    WHEN t.chain_id = 97 THEN 'bsc_testnet'::text
                    WHEN t.chain_id = 1 THEN 'ethereum'::text
                    ELSE 'unknown'::text
                END AS chain,
            t.chain_id,
                CASE
                    WHEN upper(t.token_symbol) = 'BTC'::text OR t.chain_id = 0 THEN 'btc'::text
                    WHEN t.chain_id = 56 THEN 'bsc'::text
                    WHEN t.chain_id = 97 THEN 'bsc_testnet'::text
                    WHEN t.chain_id = 1 THEN 'ethereum'::text
                    ELSE 'unknown'::text
                END AS network,
            upper(t.token_symbol) AS token_symbol,
            lower(NULLIF(t.token_address, ''::text)) AS token_address,
            _resolve_decimals(t.token_symbol, t.chain_id, t.token_address) AS decimals,
                CASE
                    WHEN lower(t.from_address) = lower(p.public_wallet_address) OR lower(t.from_address) = lower(p.btc_address) THEN 'out'::text
                    WHEN lower(t.to_address) = lower(p.public_wallet_address) OR lower(t.to_address) = lower(p.btc_address) THEN 'in'::text
                    ELSE 'unknown'::text
                END AS direction,
            'transfer'::text AS tx_type,
            t.status,
            false AS is_external,
            t.amount AS amount_raw,
            _safe_numeric(t.amount) AS amount_decimal,
            NULL::text AS fee_raw,
            NULL::bigint AS block_number,
            t.created_at AS occurred_at,
            NULL::timestamp with time zone AS confirmed_at,
            t.created_at,
            NULL::text AS memo,
            lower(NULLIF(t.from_address, ''::text)) AS sender_address,
            lower(NULLIF(t.to_address, ''::text)) AS recipient_address,
                CASE
                    WHEN lower(t.from_address) = lower(p.public_wallet_address) OR lower(t.from_address) = lower(p.btc_address) OR lower(t.to_address) = lower(p.public_wallet_address) OR lower(t.to_address) = lower(p.btc_address) THEN 'inferred'::text
                    ELSE 'unknown'::text
                END AS direction_confidence,
            '{}'::jsonb AS metadata,
            false AS is_spam
           FROM transactions t
             LEFT JOIN profiles p ON p.id = t.user_id
             LEFT JOIN donations d ON lower(d.tx_hash) = lower(t.tx_hash) AND d.chain_id = t.chain_id
             LEFT JOIN wallet_transfers w ON lower(w.tx_hash) = lower(t.tx_hash) AND w.chain_id = t.chain_id AND w.user_id = t.user_id
          WHERE (upper(t.token_symbol) = 'BTC'::text AND t.chain_id = 0 OR t.chain_id = 56 AND upper(t.token_symbol) = 'USDT'::text OR t.chain_id = 56 AND upper(t.token_symbol) = 'BNB'::text AND t.token_address IS NULL OR upper(t.token_symbol) = 'CAMLY'::text AND (t.chain_id = ANY (ARRAY[56, 137])) OR upper(t.token_symbol) = 'FUN'::text AND t.chain_id = 56) AND d.tx_hash IS NULL AND w.tx_hash IS NULL
        ), sw AS (
         SELECT ('swap_transactions:'::text || s.id::text) || ':out'::text AS id,
            'swap_transactions'::text AS source_table,
            s.id::text AS source_id,
            s.user_id,
            s.user_id AS counterparty_user_id,
            s.tx_hash,
                CASE
                    WHEN s.chain_id = 56 THEN 'bsc'::text
                    WHEN s.chain_id = 97 THEN 'bsc_testnet'::text
                    WHEN s.chain_id = 1 THEN 'ethereum'::text
                    ELSE 'unknown'::text
                END AS chain,
            s.chain_id,
                CASE
                    WHEN s.chain_id = 56 THEN 'bsc'::text
                    WHEN s.chain_id = 97 THEN 'bsc_testnet'::text
                    WHEN s.chain_id = 1 THEN 'ethereum'::text
                    ELSE 'unknown'::text
                END AS network,
            upper(s.from_symbol) AS token_symbol,
            NULL::text AS token_address,
            _resolve_decimals(s.from_symbol, s.chain_id, NULL::text) AS decimals,
            'out'::text AS direction,
            'swap'::text AS tx_type,
            s.status,
            false AS is_external,
            s.from_amount::text AS amount_raw,
            _safe_numeric(s.from_amount::text) AS amount_decimal,
            NULL::text AS fee_raw,
            NULL::bigint AS block_number,
            s.created_at AS occurred_at,
            NULL::timestamp with time zone AS confirmed_at,
            s.created_at,
            NULL::text AS memo,
            NULL::text AS sender_address,
            NULL::text AS recipient_address,
            'exact'::text AS direction_confidence,
            jsonb_build_object('swap_id', s.id::text, 'leg', 'out', 'pair_symbol', upper(s.to_symbol), 'pair_amount', s.to_amount) AS metadata,
            false AS is_spam
           FROM swap_transactions s
        UNION ALL
         SELECT ('swap_transactions:'::text || s.id::text) || ':in'::text,
            'swap_transactions'::text AS text,
            s.id::text AS id,
            s.user_id,
            s.user_id,
            s.tx_hash,
                CASE
                    WHEN s.chain_id = 56 THEN 'bsc'::text
                    WHEN s.chain_id = 97 THEN 'bsc_testnet'::text
                    WHEN s.chain_id = 1 THEN 'ethereum'::text
                    ELSE 'unknown'::text
                END AS "case",
            s.chain_id,
                CASE
                    WHEN s.chain_id = 56 THEN 'bsc'::text
                    WHEN s.chain_id = 97 THEN 'bsc_testnet'::text
                    WHEN s.chain_id = 1 THEN 'ethereum'::text
                    ELSE 'unknown'::text
                END AS "case",
            upper(s.to_symbol) AS upper,
            NULL::text AS text,
            _resolve_decimals(s.to_symbol, s.chain_id, NULL::text) AS _resolve_decimals,
            'in'::text AS text,
            'swap'::text AS text,
            s.status,
            false,
            s.to_amount::text AS to_amount,
            _safe_numeric(s.to_amount::text) AS _safe_numeric,
            NULL::text AS text,
            NULL::bigint AS int8,
            s.created_at,
            NULL::timestamp with time zone AS timestamptz,
            s.created_at,
            NULL::text AS text,
            NULL::text AS text,
            NULL::text AS text,
            'exact'::text AS text,
            jsonb_build_object('swap_id', s.id::text, 'leg', 'in', 'pair_symbol', upper(s.from_symbol), 'pair_amount', s.from_amount) AS jsonb_build_object,
            false
           FROM swap_transactions s
        )
 SELECT don_out.id,
    don_out.source_table,
    don_out.source_id,
    don_out.user_id,
    don_out.counterparty_user_id,
    don_out.tx_hash,
    don_out.chain,
    don_out.chain_id,
    don_out.network,
    don_out.token_symbol,
    don_out.token_address,
    don_out.decimals,
    don_out.direction,
    don_out.tx_type,
    don_out.status,
    don_out.is_external,
    don_out.amount_raw,
    don_out.amount_decimal,
    don_out.fee_raw,
    don_out.block_number,
    don_out.occurred_at,
    don_out.confirmed_at,
    don_out.created_at,
    don_out.memo,
    don_out.sender_address,
    don_out.recipient_address,
    don_out.direction_confidence,
    don_out.metadata,
    don_out.is_spam
   FROM don_out
UNION ALL
 SELECT don_in.id,
    don_in.source_table,
    don_in.source_id,
    don_in.user_id,
    don_in.counterparty_user_id,
    don_in.tx_hash,
    don_in.chain,
    don_in.chain_id,
    don_in.network,
    don_in.token_symbol,
    don_in.token_address,
    don_in.decimals,
    don_in.direction,
    don_in.tx_type,
    don_in.status,
    don_in.is_external,
    don_in.amount_raw,
    don_in.amount_decimal,
    don_in.fee_raw,
    don_in.block_number,
    don_in.occurred_at,
    don_in.confirmed_at,
    don_in.created_at,
    don_in.memo,
    don_in.sender_address,
    don_in.recipient_address,
    don_in.direction_confidence,
    don_in.metadata,
    don_in.is_spam
   FROM don_in
UNION ALL
 SELECT wt.id,
    wt.source_table,
    wt.source_id,
    wt.user_id,
    wt.counterparty_user_id,
    wt.tx_hash,
    wt.chain,
    wt.chain_id,
    wt.network,
    wt.token_symbol,
    wt.token_address,
    wt.decimals,
    wt.direction,
    wt.tx_type,
    wt.status,
    wt.is_external,
    wt.amount_raw,
    wt.amount_decimal,
    wt.fee_raw,
    wt.block_number,
    wt.occurred_at,
    wt.confirmed_at,
    wt.created_at,
    wt.memo,
    wt.sender_address,
    wt.recipient_address,
    wt.direction_confidence,
    wt.metadata,
    wt.is_spam
   FROM wt
UNION ALL
 SELECT tx.id,
    tx.source_table,
    tx.source_id,
    tx.user_id,
    tx.counterparty_user_id,
    tx.tx_hash,
    tx.chain,
    tx.chain_id,
    tx.network,
    tx.token_symbol,
    tx.token_address,
    tx.decimals,
    tx.direction,
    tx.tx_type,
    tx.status,
    tx.is_external,
    tx.amount_raw,
    tx.amount_decimal,
    tx.fee_raw,
    tx.block_number,
    tx.occurred_at,
    tx.confirmed_at,
    tx.created_at,
    tx.memo,
    tx.sender_address,
    tx.recipient_address,
    tx.direction_confidence,
    tx.metadata,
    tx.is_spam
   FROM tx
UNION ALL
 SELECT sw.id,
    sw.source_table,
    sw.source_id,
    sw.user_id,
    sw.counterparty_user_id,
    sw.tx_hash,
    sw.chain,
    sw.chain_id,
    sw.network,
    sw.token_symbol,
    sw.token_address,
    sw.decimals,
    sw.direction,
    sw.tx_type,
    sw.status,
    sw.is_external,
    sw.amount_raw,
    sw.amount_decimal,
    sw.fee_raw,
    sw.block_number,
    sw.occurred_at,
    sw.confirmed_at,
    sw.created_at,
    sw.memo,
    sw.sender_address,
    sw.recipient_address,
    sw.direction_confidence,
    sw.metadata,
    sw.is_spam
   FROM sw;

CREATE OR REPLACE VIEW public.v_unified_transactions_primary AS
 SELECT id,
    source_table,
    source_id,
    user_id,
    counterparty_user_id,
    tx_hash,
    chain,
    chain_id,
    network,
    token_symbol,
    token_address,
    decimals,
    direction,
    tx_type,
    status,
    is_external,
    amount_raw,
    amount_decimal,
    fee_raw,
    block_number,
    occurred_at,
    confirmed_at,
    created_at,
    memo,
    sender_address,
    recipient_address,
    direction_confidence,
    metadata,
    dedup_rank,
    is_spam
   FROM ( SELECT v.id,
            v.source_table,
            v.source_id,
            v.user_id,
            v.counterparty_user_id,
            v.tx_hash,
            v.chain,
            v.chain_id,
            v.network,
            v.token_symbol,
            v.token_address,
            v.decimals,
            v.direction,
            v.tx_type,
            v.status,
            v.is_external,
            v.amount_raw,
            v.amount_decimal,
            v.fee_raw,
            v.block_number,
            v.occurred_at,
            v.confirmed_at,
            v.created_at,
            v.memo,
            v.sender_address,
            v.recipient_address,
            v.direction_confidence,
            v.metadata,
            v.is_spam,
            row_number() OVER (PARTITION BY v.user_id, (COALESCE(lower(v.tx_hash), (('no-hash:'::text || v.source_table) || ':'::text) || v.source_id)), v.direction ORDER BY (
                CASE v.source_table
                    WHEN 'donations'::text THEN 1
                    WHEN 'wallet_transfers'::text THEN 2
                    WHEN 'swap_transactions'::text THEN 3
                    WHEN 'transactions'::text THEN 4
                    ELSE 9
                END), (
                CASE
                    WHEN v.direction = 'unknown'::text THEN 2
                    ELSE 1
                END), v.occurred_at DESC NULLS LAST) AS dedup_rank
           FROM v_unified_transactions v) ranked
  WHERE dedup_rank = 1 AND ranked.is_spam IS NOT TRUE AND NOT (EXISTS ( SELECT 1
           FROM token_ingest_filters f
          WHERE f.enabled IS TRUE AND lower(f.chain) = lower(COALESCE(ranked.chain, ''::text)) AND upper(f.token_symbol) = upper(COALESCE(ranked.token_symbol, ''::text)) AND (ranked.chain = ANY (ARRAY['bsc'::text, 'btc'::text])) AND abs(COALESCE(ranked.amount_decimal, 0::numeric)) < f.min_amount)) AND NOT (EXISTS ( SELECT 1
           FROM blacklisted_wallets b
          WHERE lower(b.wallet_address) = lower(COALESCE(ranked.sender_address, ''::text))));
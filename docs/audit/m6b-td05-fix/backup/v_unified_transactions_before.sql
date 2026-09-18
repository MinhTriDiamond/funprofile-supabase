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
                    ELSE COALESCE(d.chain_family, 'unknown'::text)
                END AS chain,
            d.chain_id,
            upper(d.token_symbol) AS token_symbol,
            lower(NULLIF(d.token_address, ''::text)) AS token_address,
            'out'::text AS direction,
            'gift'::text AS tx_type,
            d.status,
            COALESCE(d.is_external, false) AS is_external,
            d.amount AS amount_raw,
            d.fee AS fee_raw,
            d.block_number,
            COALESCE(d.confirmed_at, d.created_at) AS occurred_at,
            d.confirmed_at,
            d.created_at,
            d.message AS memo,
            lower(NULLIF(d.sender_address, ''::text)) AS sender_address,
            lower(NULLIF(d.recipient_address, ''::text)) AS recipient_address,
            'exact'::text AS direction_confidence,
            jsonb_build_object('card_theme', d.card_theme, 'card_sound', d.card_sound, 'leaderboard_eligibility', d.leaderboard_eligibility, 'price_usd', d.price_usd_at_donation, 'amount_usd', d.amount_usd) AS metadata
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
                    ELSE COALESCE(d.chain_family, 'unknown'::text)
                END AS chain,
            d.chain_id,
            upper(d.token_symbol) AS token_symbol,
            lower(NULLIF(d.token_address, ''::text)) AS token_address,
            'in'::text AS direction,
            'gift'::text AS tx_type,
            d.status,
            COALESCE(d.is_external, false) AS is_external,
            d.amount AS amount_raw,
            d.fee AS fee_raw,
            d.block_number,
            COALESCE(d.confirmed_at, d.created_at) AS occurred_at,
            d.confirmed_at,
            d.created_at,
            d.message AS memo,
            lower(NULLIF(d.sender_address, ''::text)) AS sender_address,
            lower(NULLIF(d.recipient_address, ''::text)) AS recipient_address,
            'exact'::text AS direction_confidence,
            jsonb_build_object('card_theme', d.card_theme, 'card_sound', d.card_sound, 'leaderboard_eligibility', d.leaderboard_eligibility, 'price_usd', d.price_usd_at_donation, 'amount_usd', d.amount_usd) AS metadata
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
                    WHEN w.chain_family = 'btc'::text OR w.chain_id = 0 THEN 'btc'::text
                    WHEN w.chain_id = 56 THEN 'bsc'::text
                    WHEN w.chain_id = 97 THEN 'bsc_testnet'::text
                    ELSE COALESCE(w.chain_family, 'unknown'::text)
                END AS chain,
            w.chain_id,
            upper(w.token_symbol) AS token_symbol,
            lower(NULLIF(w.token_address, ''::text)) AS token_address,
                CASE
                    WHEN w.direction = ANY (ARRAY['in'::text, 'out'::text, 'internal'::text]) THEN w.direction
                    ELSE 'unknown'::text
                END AS direction,
            'external'::text AS tx_type,
            w.status,
            true AS is_external,
            w.amount::text AS amount_raw,
            w.fee AS fee_raw,
            NULL::bigint AS block_number,
            w.created_at AS occurred_at,
            NULL::timestamp with time zone AS confirmed_at,
            w.created_at,
            NULL::text AS memo,
            NULL::text AS sender_address,
            lower(NULLIF(w.counterparty_address, ''::text)) AS recipient_address,
            'exact'::text AS direction_confidence,
            jsonb_build_object('confirmations', w.confirmations, 'counterparty_address', lower(w.counterparty_address)) AS metadata
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
                    ELSE 'unknown'::text
                END AS chain,
            t.chain_id,
            upper(t.token_symbol) AS token_symbol,
            lower(NULLIF(t.token_address, ''::text)) AS token_address,
                CASE
                    WHEN lower(t.from_address) = lower(p.public_wallet_address) OR lower(t.from_address) = lower(p.btc_address) THEN 'out'::text
                    WHEN lower(t.to_address) = lower(p.public_wallet_address) OR lower(t.to_address) = lower(p.btc_address) THEN 'in'::text
                    ELSE 'unknown'::text
                END AS direction,
            'transfer'::text AS tx_type,
            t.status,
            false AS is_external,
            t.amount AS amount_raw,
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
            '{}'::jsonb AS metadata
           FROM transactions t
             LEFT JOIN profiles p ON p.id = t.user_id
        ), all_rows AS (
         SELECT don_out.id,
            don_out.source_table,
            don_out.source_id,
            don_out.user_id,
            don_out.counterparty_user_id,
            don_out.tx_hash,
            don_out.chain,
            don_out.chain_id,
            don_out.token_symbol,
            don_out.token_address,
            don_out.direction,
            don_out.tx_type,
            don_out.status,
            don_out.is_external,
            don_out.amount_raw,
            don_out.fee_raw,
            don_out.block_number,
            don_out.occurred_at,
            don_out.confirmed_at,
            don_out.created_at,
            don_out.memo,
            don_out.sender_address,
            don_out.recipient_address,
            don_out.direction_confidence,
            don_out.metadata
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
            don_in.token_symbol,
            don_in.token_address,
            don_in.direction,
            don_in.tx_type,
            don_in.status,
            don_in.is_external,
            don_in.amount_raw,
            don_in.fee_raw,
            don_in.block_number,
            don_in.occurred_at,
            don_in.confirmed_at,
            don_in.created_at,
            don_in.memo,
            don_in.sender_address,
            don_in.recipient_address,
            don_in.direction_confidence,
            don_in.metadata
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
            wt.token_symbol,
            wt.token_address,
            wt.direction,
            wt.tx_type,
            wt.status,
            wt.is_external,
            wt.amount_raw,
            wt.fee_raw,
            wt.block_number,
            wt.occurred_at,
            wt.confirmed_at,
            wt.created_at,
            wt.memo,
            wt.sender_address,
            wt.recipient_address,
            wt.direction_confidence,
            wt.metadata
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
            tx.token_symbol,
            tx.token_address,
            tx.direction,
            tx.tx_type,
            tx.status,
            tx.is_external,
            tx.amount_raw,
            tx.fee_raw,
            tx.block_number,
            tx.occurred_at,
            tx.confirmed_at,
            tx.created_at,
            tx.memo,
            tx.sender_address,
            tx.recipient_address,
            tx.direction_confidence,
            tx.metadata
           FROM tx
        )
 SELECT r.id,
    r.source_table,
    r.source_id,
    r.user_id,
    r.counterparty_user_id,
    r.tx_hash,
    r.chain,
    r.chain_id,
        CASE
            WHEN r.chain = ANY (ARRAY['bsc'::text, 'bsc_testnet'::text, 'btc'::text]) THEN r.chain
            ELSE 'unknown'::text
        END AS network,
    r.token_symbol,
    r.token_address,
    COALESCE(reg_addr.decimals, reg_sym.decimals) AS decimals,
    r.direction,
    r.direction_confidence,
    r.tx_type,
    r.status,
    r.is_external,
    r.amount_raw,
        CASE
            WHEN r.amount_raw IS NULL OR r.amount_raw = ''::text THEN NULL::numeric
            WHEN r.amount_raw ~ '^-?\d+(\.\d+)?$'::text THEN r.amount_raw::numeric
            ELSE NULL::numeric
        END AS amount_decimal,
    r.fee_raw,
    r.block_number,
    r.occurred_at,
    r.confirmed_at,
    r.created_at,
    r.memo,
    r.sender_address,
    r.recipient_address,
    r.metadata
   FROM all_rows r
     LEFT JOIN tokens_registry reg_addr ON reg_addr.is_active = true AND reg_addr.chain_id = r.chain_id AND lower(reg_addr.token_address) = r.token_address
     LEFT JOIN tokens_registry reg_sym ON reg_sym.is_active = true AND reg_sym.chain_id = r.chain_id AND reg_sym.token_address IS NULL AND upper(reg_sym.symbol) = r.token_symbol;

WITH proj AS (
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
          WHERE d.id = ANY (ARRAY['7f145989-7e12-4dee-9b29-bbbba3c4f3b8','d1953839-d65f-478c-b8f7-5313cfca3077','b0b1012d-caee-43e5-a236-c38a6bd96e24','6cbfdb2f-a8a9-4e00-aafa-b5f9939f7e80','fb2a5e22-d7c6-443a-94b2-c4ca80f1b2ce']::uuid[]) AND (d.sender_id IS NOT NULL)
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
          WHERE d.id = ANY (ARRAY['7f145989-7e12-4dee-9b29-bbbba3c4f3b8','d1953839-d65f-478c-b8f7-5313cfca3077','b0b1012d-caee-43e5-a236-c38a6bd96e24','6cbfdb2f-a8a9-4e00-aafa-b5f9939f7e80','fb2a5e22-d7c6-443a-94b2-c4ca80f1b2ce']::uuid[]) AND (d.recipient_id IS NOT NULL)
), proj2 AS (SELECT *, 1 AS dedup_rank FROM proj),
real AS (
  SELECT * FROM v_unified_transactions_primary
   WHERE source_table = 'donations'
     AND source_id IN ('7f145989-7e12-4dee-9b29-bbbba3c4f3b8','d1953839-d65f-478c-b8f7-5313cfca3077','b0b1012d-caee-43e5-a236-c38a6bd96e24','6cbfdb2f-a8a9-4e00-aafa-b5f9939f7e80','fb2a5e22-d7c6-443a-94b2-c4ca80f1b2ce')
)
SELECT sid,
       (SELECT count(*) FROM proj2 p WHERE p.source_id = sid) AS proj_rows,
       (SELECT count(*) FROM real r WHERE r.source_id = sid) AS real_rows,
       (SELECT count(*) FROM proj2 p JOIN real r ON r.id = p.id WHERE to_jsonb(p) IS DISTINCT FROM to_jsonb(r)) AS mismatched_rows,
       (SELECT bool_or(p.is_spam) FROM proj2 p WHERE p.source_id = sid) AS proj_is_spam
  FROM unnest(ARRAY['7f145989-7e12-4dee-9b29-bbbba3c4f3b8','d1953839-d65f-478c-b8f7-5313cfca3077','b0b1012d-caee-43e5-a236-c38a6bd96e24','6cbfdb2f-a8a9-4e00-aafa-b5f9939f7e80','fb2a5e22-d7c6-443a-94b2-c4ca80f1b2ce']) AS sid;
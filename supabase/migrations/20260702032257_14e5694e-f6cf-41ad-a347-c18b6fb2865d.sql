-- Phase 7B — Fast anti-join for tx CTE in v_unified_transactions
-- 1) Btree indexes for hash-anti-join lookup keys
CREATE INDEX IF NOT EXISTS idx_donations_lower_tx_hash_chain
  ON public.donations (lower(tx_hash), chain_id)
  WHERE tx_hash IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_wallet_transfers_lower_tx_hash_chain
  ON public.wallet_transfers (lower(tx_hash), chain_id)
  WHERE tx_hash IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_transactions_lower_tx_hash_chain
  ON public.transactions (lower(tx_hash), chain_id)
  WHERE tx_hash IS NOT NULL;

ANALYZE public.donations;
ANALYZE public.wallet_transfers;
ANALYZE public.transactions;

-- 2) Rewrite v_unified_transactions using LEFT JOIN ... IS NULL for the tx CTE.
--    Columns + types unchanged → CREATE OR REPLACE keeps v_unified_transactions_primary intact.
CREATE OR REPLACE VIEW public.v_unified_transactions AS
WITH don_out AS (
  SELECT ('donations:' || d.id::text) || ':out' AS id,
         'donations'::text AS source_table,
         d.id::text AS source_id,
         d.sender_id AS user_id,
         d.recipient_id AS counterparty_user_id,
         d.tx_hash,
         CASE WHEN d.chain_family='btc' OR d.chain_id=0 OR upper(d.token_symbol)='BTC' THEN 'btc'
              WHEN d.chain_id=56 THEN 'bsc'
              WHEN d.chain_id=97 THEN 'bsc_testnet'
              WHEN d.chain_id=1 THEN 'ethereum'
              ELSE COALESCE(d.chain_family,'unknown') END AS chain,
         d.chain_id,
         CASE WHEN d.chain_family='btc' OR d.chain_id=0 OR upper(d.token_symbol)='BTC' THEN 'btc'
              WHEN d.chain_id=56 THEN 'bsc'
              WHEN d.chain_id=97 THEN 'bsc_testnet'
              WHEN d.chain_id=1 THEN 'ethereum'
              ELSE COALESCE(d.chain_family,'unknown') END AS network,
         upper(d.token_symbol) AS token_symbol,
         lower(NULLIF(d.token_address,'')) AS token_address,
         _resolve_decimals(d.token_symbol,d.chain_id,d.token_address) AS decimals,
         'out'::text AS direction,
         'gift'::text AS tx_type,
         d.status,
         COALESCE(d.is_external,false) AS is_external,
         d.amount AS amount_raw,
         _safe_numeric(d.amount) AS amount_decimal,
         d.fee AS fee_raw,
         d.block_number,
         COALESCE(d.confirmed_at,d.created_at) AS occurred_at,
         d.confirmed_at, d.created_at, d.message AS memo,
         lower(NULLIF(d.sender_address,'')) AS sender_address,
         lower(NULLIF(d.recipient_address,'')) AS recipient_address,
         'exact'::text AS direction_confidence,
         jsonb_build_object('card_theme',d.card_theme,'card_sound',d.card_sound,
           'leaderboard_eligibility',d.leaderboard_eligibility,
           'price_usd',d.price_usd_at_donation,'amount_usd',d.amount_usd) AS metadata
  FROM donations d WHERE d.sender_id IS NOT NULL
),
don_in AS (
  SELECT ('donations:' || d.id::text) || ':in' AS id,
         'donations'::text AS source_table,
         d.id::text AS source_id,
         d.recipient_id AS user_id,
         d.sender_id AS counterparty_user_id,
         d.tx_hash,
         CASE WHEN d.chain_family='btc' OR d.chain_id=0 OR upper(d.token_symbol)='BTC' THEN 'btc'
              WHEN d.chain_id=56 THEN 'bsc'
              WHEN d.chain_id=97 THEN 'bsc_testnet'
              WHEN d.chain_id=1 THEN 'ethereum'
              ELSE COALESCE(d.chain_family,'unknown') END AS chain,
         d.chain_id,
         CASE WHEN d.chain_family='btc' OR d.chain_id=0 OR upper(d.token_symbol)='BTC' THEN 'btc'
              WHEN d.chain_id=56 THEN 'bsc'
              WHEN d.chain_id=97 THEN 'bsc_testnet'
              WHEN d.chain_id=1 THEN 'ethereum'
              ELSE COALESCE(d.chain_family,'unknown') END AS network,
         upper(d.token_symbol) AS token_symbol,
         lower(NULLIF(d.token_address,'')) AS token_address,
         _resolve_decimals(d.token_symbol,d.chain_id,d.token_address) AS decimals,
         'in'::text AS direction,
         'gift'::text AS tx_type,
         d.status,
         COALESCE(d.is_external,false) AS is_external,
         d.amount AS amount_raw,
         _safe_numeric(d.amount) AS amount_decimal,
         d.fee AS fee_raw,
         d.block_number,
         COALESCE(d.confirmed_at,d.created_at) AS occurred_at,
         d.confirmed_at, d.created_at, d.message AS memo,
         lower(NULLIF(d.sender_address,'')) AS sender_address,
         lower(NULLIF(d.recipient_address,'')) AS recipient_address,
         'exact'::text AS direction_confidence,
         jsonb_build_object('card_theme',d.card_theme,'card_sound',d.card_sound,
           'leaderboard_eligibility',d.leaderboard_eligibility,
           'price_usd',d.price_usd_at_donation,'amount_usd',d.amount_usd) AS metadata
  FROM donations d WHERE d.recipient_id IS NOT NULL
),
wt AS (
  SELECT 'wallet_transfers:' || w.id::text AS id,
         'wallet_transfers'::text AS source_table,
         w.id::text AS source_id,
         w.user_id,
         NULL::uuid AS counterparty_user_id,
         w.tx_hash,
         CASE WHEN upper(w.token_symbol)='BTC' OR w.chain_id=0 THEN 'btc'
              WHEN w.chain_id=56 THEN 'bsc'
              WHEN w.chain_id=97 THEN 'bsc_testnet'
              WHEN w.chain_id=1 THEN 'ethereum'
              ELSE COALESCE(w.chain_family,'unknown') END AS chain,
         w.chain_id,
         CASE WHEN upper(w.token_symbol)='BTC' OR w.chain_id=0 THEN 'btc'
              WHEN w.chain_id=56 THEN 'bsc'
              WHEN w.chain_id=97 THEN 'bsc_testnet'
              WHEN w.chain_id=1 THEN 'ethereum'
              ELSE COALESCE(w.chain_family,'unknown') END AS network,
         upper(w.token_symbol) AS token_symbol,
         lower(NULLIF(w.token_address,'')) AS token_address,
         _resolve_decimals(w.token_symbol,w.chain_id,w.token_address) AS decimals,
         CASE WHEN w.direction = ANY (ARRAY['in','out','internal']) THEN w.direction ELSE 'unknown' END AS direction,
         'external'::text AS tx_type,
         w.status,
         true AS is_external,
         w.amount::text AS amount_raw,
         _safe_numeric(w.amount::text) AS amount_decimal,
         w.fee AS fee_raw,
         NULL::bigint AS block_number,
         w.created_at AS occurred_at,
         NULL::timestamptz AS confirmed_at,
         w.created_at,
         NULL::text AS memo,
         NULL::text AS sender_address,
         lower(NULLIF(w.counterparty_address,'')) AS recipient_address,
         'exact'::text AS direction_confidence,
         jsonb_build_object('confirmations',w.confirmations,'counterparty_address',lower(w.counterparty_address)) AS metadata
  FROM wallet_transfers w
),
-- PHASE 7B: LEFT JOIN … IS NULL (Hash Anti Join) thay cho NOT EXISTS lồng nhau.
tx AS (
  SELECT 'transactions:' || t.id::text AS id,
         'transactions'::text AS source_table,
         t.id::text AS source_id,
         t.user_id,
         NULL::uuid AS counterparty_user_id,
         t.tx_hash,
         CASE WHEN upper(t.token_symbol)='BTC' OR t.chain_id=0 THEN 'btc'
              WHEN t.chain_id=56 THEN 'bsc'
              WHEN t.chain_id=97 THEN 'bsc_testnet'
              WHEN t.chain_id=1 THEN 'ethereum' ELSE 'unknown' END AS chain,
         t.chain_id,
         CASE WHEN upper(t.token_symbol)='BTC' OR t.chain_id=0 THEN 'btc'
              WHEN t.chain_id=56 THEN 'bsc'
              WHEN t.chain_id=97 THEN 'bsc_testnet'
              WHEN t.chain_id=1 THEN 'ethereum' ELSE 'unknown' END AS network,
         upper(t.token_symbol) AS token_symbol,
         lower(NULLIF(t.token_address,'')) AS token_address,
         _resolve_decimals(t.token_symbol,t.chain_id,t.token_address) AS decimals,
         CASE WHEN lower(t.from_address)=lower(p.public_wallet_address) OR lower(t.from_address)=lower(p.btc_address) THEN 'out'
              WHEN lower(t.to_address)=lower(p.public_wallet_address)   OR lower(t.to_address)=lower(p.btc_address)   THEN 'in'
              ELSE 'unknown' END AS direction,
         'transfer'::text AS tx_type,
         t.status,
         false AS is_external,
         t.amount AS amount_raw,
         _safe_numeric(t.amount) AS amount_decimal,
         NULL::text AS fee_raw,
         NULL::bigint AS block_number,
         t.created_at AS occurred_at,
         NULL::timestamptz AS confirmed_at,
         t.created_at,
         NULL::text AS memo,
         lower(NULLIF(t.from_address,'')) AS sender_address,
         lower(NULLIF(t.to_address,'')) AS recipient_address,
         CASE WHEN lower(t.from_address)=lower(p.public_wallet_address) OR lower(t.from_address)=lower(p.btc_address)
                OR lower(t.to_address)=lower(p.public_wallet_address)   OR lower(t.to_address)=lower(p.btc_address)
              THEN 'inferred' ELSE 'unknown' END AS direction_confidence,
         '{}'::jsonb AS metadata
  FROM transactions t
  LEFT JOIN profiles p ON p.id = t.user_id
  LEFT JOIN donations d
    ON lower(d.tx_hash) = lower(t.tx_hash) AND d.chain_id = t.chain_id
  LEFT JOIN wallet_transfers w
    ON lower(w.tx_hash) = lower(t.tx_hash) AND w.chain_id = t.chain_id AND w.user_id = t.user_id
  WHERE (
      (upper(t.token_symbol)='BTC' AND t.chain_id=0)
      OR (t.chain_id=56 AND upper(t.token_symbol)='USDT')
      OR (t.chain_id=56 AND upper(t.token_symbol)='BNB' AND t.token_address IS NULL)
    )
    AND d.tx_hash IS NULL
    AND w.tx_hash IS NULL
),
sw AS (
  SELECT ('swap_transactions:' || s.id::text) || ':out' AS id,
         'swap_transactions'::text AS source_table,
         s.id::text AS source_id,
         s.user_id, s.user_id AS counterparty_user_id, s.tx_hash,
         CASE WHEN s.chain_id=56 THEN 'bsc' WHEN s.chain_id=97 THEN 'bsc_testnet' WHEN s.chain_id=1 THEN 'ethereum' ELSE 'unknown' END AS chain,
         s.chain_id,
         CASE WHEN s.chain_id=56 THEN 'bsc' WHEN s.chain_id=97 THEN 'bsc_testnet' WHEN s.chain_id=1 THEN 'ethereum' ELSE 'unknown' END AS network,
         upper(s.from_symbol) AS token_symbol,
         NULL::text AS token_address,
         _resolve_decimals(s.from_symbol,s.chain_id,NULL) AS decimals,
         'out'::text AS direction, 'swap'::text AS tx_type, s.status,
         false AS is_external,
         s.from_amount::text AS amount_raw,
         _safe_numeric(s.from_amount::text) AS amount_decimal,
         NULL::text AS fee_raw, NULL::bigint AS block_number,
         s.created_at AS occurred_at, NULL::timestamptz AS confirmed_at, s.created_at,
         NULL::text AS memo, NULL::text AS sender_address, NULL::text AS recipient_address,
         'exact'::text AS direction_confidence,
         jsonb_build_object('swap_id',s.id::text,'leg','out','pair_symbol',upper(s.to_symbol),'pair_amount',s.to_amount) AS metadata
  FROM swap_transactions s
  UNION ALL
  SELECT ('swap_transactions:' || s.id::text) || ':in',
         'swap_transactions', s.id::text, s.user_id, s.user_id, s.tx_hash,
         CASE WHEN s.chain_id=56 THEN 'bsc' WHEN s.chain_id=97 THEN 'bsc_testnet' WHEN s.chain_id=1 THEN 'ethereum' ELSE 'unknown' END,
         s.chain_id,
         CASE WHEN s.chain_id=56 THEN 'bsc' WHEN s.chain_id=97 THEN 'bsc_testnet' WHEN s.chain_id=1 THEN 'ethereum' ELSE 'unknown' END,
         upper(s.to_symbol), NULL::text,
         _resolve_decimals(s.to_symbol,s.chain_id,NULL),
         'in', 'swap', s.status, false,
         s.to_amount::text, _safe_numeric(s.to_amount::text),
         NULL::text, NULL::bigint, s.created_at, NULL::timestamptz, s.created_at,
         NULL::text, NULL::text, NULL::text, 'exact',
         jsonb_build_object('swap_id',s.id::text,'leg','in','pair_symbol',upper(s.from_symbol),'pair_amount',s.from_amount)
  FROM swap_transactions s
)
SELECT * FROM don_out
UNION ALL SELECT * FROM don_in
UNION ALL SELECT * FROM wt
UNION ALL SELECT * FROM tx
UNION ALL SELECT * FROM sw;
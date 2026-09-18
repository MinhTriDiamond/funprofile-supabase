
-- ============================================================
-- M3: Unified Transaction Read Layer
-- Source of Truth cho lịch sử giao dịch trên toàn FUN Profile
-- ============================================================

-- 1) Feature flag (default OFF). Hook mới chỉ bật khi flag = true.
INSERT INTO public.app_settings(key, value)
VALUES ('unified_tx_read_enabled', 'false'::jsonb)
ON CONFLICT (key) DO NOTHING;

-- 2) Drop nếu tồn tại để idempotent
DROP VIEW IF EXISTS public.v_unified_transactions_primary CASCADE;
DROP VIEW IF EXISTS public.v_unified_transactions CASCADE;

-- 3) View chính: UNION 3 nguồn + chuẩn hoá field
CREATE VIEW public.v_unified_transactions
WITH (security_invoker = true) AS
WITH

-- ---------- A) DONATIONS — sender side (out) ----------
don_out AS (
  SELECT
    'donations:'||d.id::text||':out'             AS id,
    'donations'::text                            AS source_table,
    d.id::text                                   AS source_id,
    d.sender_id                                  AS user_id,
    d.recipient_id                               AS counterparty_user_id,
    d.tx_hash                                    AS tx_hash,
    CASE
      WHEN d.chain_family = 'btc' OR d.chain_id = 0 OR upper(d.token_symbol) = 'BTC' THEN 'btc'
      WHEN d.chain_id = 56  THEN 'bsc'
      WHEN d.chain_id = 97  THEN 'bsc_testnet'
      ELSE COALESCE(d.chain_family, 'unknown')
    END                                          AS chain,
    d.chain_id                                   AS chain_id,
    upper(d.token_symbol)                        AS token_symbol,
    lower(NULLIF(d.token_address, ''))           AS token_address,
    'out'::text                                  AS direction,
    'gift'::text                                 AS tx_type,
    d.status                                     AS status,
    COALESCE(d.is_external, false)               AS is_external,
    d.amount                                     AS amount_raw,
    d.fee                                        AS fee_raw,
    d.block_number                               AS block_number,
    COALESCE(d.confirmed_at, d.created_at)       AS occurred_at,
    d.confirmed_at                               AS confirmed_at,
    d.created_at                                 AS created_at,
    d.message                                    AS memo,
    lower(NULLIF(d.sender_address, ''))          AS sender_address,
    lower(NULLIF(d.recipient_address, ''))       AS recipient_address,
    'exact'::text                                AS direction_confidence,
    jsonb_build_object(
      'card_theme', d.card_theme,
      'card_sound', d.card_sound,
      'leaderboard_eligibility', d.leaderboard_eligibility,
      'price_usd', d.price_usd_at_donation,
      'amount_usd', d.amount_usd
    )                                            AS metadata
  FROM public.donations d
  WHERE d.sender_id IS NOT NULL
),

-- ---------- B) DONATIONS — recipient side (in) ----------
don_in AS (
  SELECT
    'donations:'||d.id::text||':in'              AS id,
    'donations'::text                            AS source_table,
    d.id::text                                   AS source_id,
    d.recipient_id                               AS user_id,
    d.sender_id                                  AS counterparty_user_id,
    d.tx_hash                                    AS tx_hash,
    CASE
      WHEN d.chain_family = 'btc' OR d.chain_id = 0 OR upper(d.token_symbol) = 'BTC' THEN 'btc'
      WHEN d.chain_id = 56  THEN 'bsc'
      WHEN d.chain_id = 97  THEN 'bsc_testnet'
      ELSE COALESCE(d.chain_family, 'unknown')
    END                                          AS chain,
    d.chain_id,
    upper(d.token_symbol)                        AS token_symbol,
    lower(NULLIF(d.token_address, ''))           AS token_address,
    'in'::text                                   AS direction,
    'gift'::text                                 AS tx_type,
    d.status,
    COALESCE(d.is_external, false)               AS is_external,
    d.amount                                     AS amount_raw,
    d.fee                                        AS fee_raw,
    d.block_number,
    COALESCE(d.confirmed_at, d.created_at)       AS occurred_at,
    d.confirmed_at,
    d.created_at,
    d.message                                    AS memo,
    lower(NULLIF(d.sender_address, ''))          AS sender_address,
    lower(NULLIF(d.recipient_address, ''))       AS recipient_address,
    'exact'::text                                AS direction_confidence,
    jsonb_build_object(
      'card_theme', d.card_theme,
      'card_sound', d.card_sound,
      'leaderboard_eligibility', d.leaderboard_eligibility,
      'price_usd', d.price_usd_at_donation,
      'amount_usd', d.amount_usd
    )                                            AS metadata
  FROM public.donations d
  WHERE d.recipient_id IS NOT NULL
),

-- ---------- C) WALLET_TRANSFERS (external scanner) ----------
wt AS (
  SELECT
    'wallet_transfers:'||w.id::text              AS id,
    'wallet_transfers'::text                     AS source_table,
    w.id::text                                   AS source_id,
    w.user_id,
    NULL::uuid                                   AS counterparty_user_id,
    w.tx_hash,
    CASE
      WHEN w.chain_family = 'btc' OR w.chain_id = 0 THEN 'btc'
      WHEN w.chain_id = 56  THEN 'bsc'
      WHEN w.chain_id = 97  THEN 'bsc_testnet'
      ELSE COALESCE(w.chain_family, 'unknown')
    END                                          AS chain,
    w.chain_id,
    upper(w.token_symbol)                        AS token_symbol,
    lower(NULLIF(w.token_address, ''))           AS token_address,
    CASE
      WHEN w.direction IN ('in','out','internal') THEN w.direction
      ELSE 'unknown'
    END                                          AS direction,
    'external'::text                             AS tx_type,
    w.status,
    true                                         AS is_external,
    w.amount::text                               AS amount_raw,
    w.fee                                        AS fee_raw,
    NULL::bigint                                 AS block_number,
    w.created_at                                 AS occurred_at,
    NULL::timestamptz                            AS confirmed_at,
    w.created_at,
    NULL::text                                   AS memo,
    NULL::text                                   AS sender_address,
    lower(NULLIF(w.counterparty_address, ''))    AS recipient_address,
    'exact'::text                                AS direction_confidence,
    jsonb_build_object(
      'confirmations', w.confirmations,
      'counterparty_address', lower(w.counterparty_address)
    )                                            AS metadata
  FROM public.wallet_transfers w
),

-- ---------- D) TRANSACTIONS (legacy fallback) ----------
-- direction được infer từ profile wallet → confidence='inferred'
tx AS (
  SELECT
    'transactions:'||t.id::text                  AS id,
    'transactions'::text                         AS source_table,
    t.id::text                                   AS source_id,
    t.user_id,
    NULL::uuid                                   AS counterparty_user_id,
    t.tx_hash,
    CASE
      WHEN upper(t.token_symbol) = 'BTC' OR t.chain_id = 0 THEN 'btc'
      WHEN t.chain_id = 56  THEN 'bsc'
      WHEN t.chain_id = 97  THEN 'bsc_testnet'
      ELSE 'unknown'
    END                                          AS chain,
    t.chain_id,
    upper(t.token_symbol)                        AS token_symbol,
    lower(NULLIF(t.token_address, ''))           AS token_address,
    CASE
      WHEN lower(t.from_address) = lower(p.public_wallet_address)
        OR lower(t.from_address) = lower(p.btc_address) THEN 'out'
      WHEN lower(t.to_address)   = lower(p.public_wallet_address)
        OR lower(t.to_address)   = lower(p.btc_address) THEN 'in'
      ELSE 'unknown'
    END                                          AS direction,
    'transfer'::text                             AS tx_type,
    t.status,
    false                                        AS is_external,
    t.amount                                     AS amount_raw,
    NULL::text                                   AS fee_raw,
    NULL::bigint                                 AS block_number,
    t.created_at                                 AS occurred_at,
    NULL::timestamptz                            AS confirmed_at,
    t.created_at,
    NULL::text                                   AS memo,
    lower(NULLIF(t.from_address, ''))            AS sender_address,
    lower(NULLIF(t.to_address, ''))              AS recipient_address,
    CASE
      WHEN lower(t.from_address) = lower(p.public_wallet_address)
        OR lower(t.from_address) = lower(p.btc_address)
        OR lower(t.to_address)   = lower(p.public_wallet_address)
        OR lower(t.to_address)   = lower(p.btc_address) THEN 'inferred'
      ELSE 'unknown'
    END                                          AS direction_confidence,
    '{}'::jsonb                                  AS metadata
  FROM public.transactions t
  LEFT JOIN public.profiles p ON p.id = t.user_id
),

all_rows AS (
  SELECT * FROM don_out
  UNION ALL SELECT * FROM don_in
  UNION ALL SELECT * FROM wt
  UNION ALL SELECT * FROM tx
)

SELECT
  r.id,
  r.source_table,
  r.source_id,
  r.user_id,
  r.counterparty_user_id,
  r.tx_hash,
  r.chain,
  r.chain_id,
  CASE WHEN r.chain IN ('bsc','bsc_testnet','btc') THEN r.chain ELSE 'unknown' END AS network,
  r.token_symbol,
  r.token_address,
  -- decimals từ tokens_registry; null nếu không khớp
  COALESCE(
    reg_addr.decimals,
    reg_sym.decimals
  )                                              AS decimals,
  r.direction,
  r.direction_confidence,
  r.tx_type,
  r.status,
  r.is_external,
  r.amount_raw,
  -- amount_decimal: an toàn numeric; nếu cast fail trả NULL
  CASE
    WHEN r.amount_raw IS NULL OR r.amount_raw = '' THEN NULL
    WHEN r.amount_raw ~ '^-?\d+(\.\d+)?$' THEN r.amount_raw::numeric
    ELSE NULL
  END                                            AS amount_decimal,
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
LEFT JOIN public.tokens_registry reg_addr
  ON reg_addr.is_active = true
 AND reg_addr.chain_id  = r.chain_id
 AND lower(reg_addr.token_address) = r.token_address
LEFT JOIN public.tokens_registry reg_sym
  ON reg_sym.is_active = true
 AND reg_sym.chain_id  = r.chain_id
 AND reg_sym.token_address IS NULL
 AND upper(reg_sym.symbol) = r.token_symbol;

COMMENT ON VIEW public.v_unified_transactions IS
  'M3: Source of Truth cho lịch sử giao dịch toàn FUN Profile. UNION ALL từ donations (2 dòng/giao dịch), wallet_transfers, transactions. SECURITY INVOKER — kế thừa RLS bảng gốc. Direction từ donations/wallet_transfers = exact; từ transactions = inferred.';

-- 4) View dedup (primary) — ưu tiên nguồn giàu metadata nhất khi cùng (user_id, tx_hash)
CREATE VIEW public.v_unified_transactions_primary
WITH (security_invoker = true) AS
SELECT *
FROM (
  SELECT
    v.*,
    ROW_NUMBER() OVER (
      PARTITION BY v.user_id,
                   v.direction,
                   COALESCE(lower(v.tx_hash), 'no-hash:'||v.source_table||':'||v.source_id)
      ORDER BY CASE v.source_table
                 WHEN 'donations'        THEN 1
                 WHEN 'wallet_transfers' THEN 2
                 WHEN 'transactions'     THEN 3
                 ELSE 9
               END,
               v.occurred_at DESC
    ) AS dedup_rank
  FROM public.v_unified_transactions v
) ranked
WHERE dedup_rank = 1;

COMMENT ON VIEW public.v_unified_transactions_primary IS
  'M3: Dedup theo (user_id, direction, tx_hash) — ưu tiên donations > wallet_transfers > transactions.';

-- 5) GRANT — view kế thừa RLS bảng gốc nên grant cho authenticated + anon (để guest đọc public profile)
GRANT SELECT ON public.v_unified_transactions          TO authenticated, anon;
GRANT SELECT ON public.v_unified_transactions_primary  TO authenticated, anon;

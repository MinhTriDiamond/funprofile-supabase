-- ============================================================================
-- DRAFT — M6B-1 · Dedup nhánh `transactions` + thêm nhánh `swap_transactions`
--   ⚠️  KHÔNG apply cho tới khi Cha duyệt.
--   Base: definition hiện tại của v_unified_transactions
--         (migration 20260630173340 + 20260630174431).
-- ============================================================================

BEGIN;

-- 0. (Tùy chọn) Khóa raw view khỏi anon để tránh consumer bên thứ ba
--    đọc và bị double count:
-- REVOKE SELECT ON public.v_unified_transactions FROM anon;

-- 1. Recreate view chính với 5 CTE (don_out, don_in, wt, tx, sw)
CREATE OR REPLACE VIEW public.v_unified_transactions AS
WITH don_out AS (
  -- Y NGUYÊN nhánh cũ — không đổi
  SELECT ('donations:' || d.id::text) || ':out' AS id,
         'donations'::text            AS source_table,
         d.id::text                   AS source_id,
         d.sender_id                  AS user_id,
         d.recipient_id               AS counterparty_user_id,
         d.tx_hash,
         CASE
           WHEN d.chain_family = 'btc' OR d.chain_id = 0 OR upper(d.token_symbol) = 'BTC' THEN 'btc'
           WHEN d.chain_id = 56  THEN 'bsc'
           WHEN d.chain_id = 97  THEN 'bsc_testnet'
           ELSE COALESCE(d.chain_family, 'unknown')
         END AS chain,
         d.chain_id,
         upper(d.token_symbol)                                    AS token_symbol,
         lower(NULLIF(d.token_address, ''))                       AS token_address,
         'out'::text                                              AS direction,
         'gift'::text                                             AS tx_type,
         d.status,
         COALESCE(d.is_external, false)                           AS is_external,
         d.amount                                                 AS amount_raw,
         d.fee                                                    AS fee_raw,
         d.block_number,
         COALESCE(d.confirmed_at, d.created_at)                   AS occurred_at,
         d.confirmed_at,
         d.created_at,
         d.message                                                AS memo,
         lower(NULLIF(d.sender_address, ''))                      AS sender_address,
         lower(NULLIF(d.recipient_address, ''))                   AS recipient_address,
         'exact'::text                                            AS direction_confidence,
         jsonb_build_object(
           'card_theme', d.card_theme,
           'card_sound', d.card_sound,
           'leaderboard_eligibility', d.leaderboard_eligibility,
           'price_usd',  d.price_usd_at_donation,
           'amount_usd', d.amount_usd
         )                                                        AS metadata
  FROM public.donations d
  WHERE d.sender_id IS NOT NULL
),
don_in AS (
  -- Y NGUYÊN nhánh cũ
  SELECT ('donations:' || d.id::text) || ':in' AS id,
         'donations'::text,
         d.id::text,
         d.recipient_id,
         d.sender_id,
         d.tx_hash,
         CASE
           WHEN d.chain_family = 'btc' OR d.chain_id = 0 OR upper(d.token_symbol) = 'BTC' THEN 'btc'
           WHEN d.chain_id = 56  THEN 'bsc'
           WHEN d.chain_id = 97  THEN 'bsc_testnet'
           ELSE COALESCE(d.chain_family, 'unknown')
         END,
         d.chain_id,
         upper(d.token_symbol),
         lower(NULLIF(d.token_address, '')),
         'in'::text,
         'gift'::text,
         d.status,
         COALESCE(d.is_external, false),
         d.amount, d.fee, d.block_number,
         COALESCE(d.confirmed_at, d.created_at),
         d.confirmed_at, d.created_at, d.message,
         lower(NULLIF(d.sender_address, '')),
         lower(NULLIF(d.recipient_address, '')),
         'exact'::text,
         jsonb_build_object(
           'card_theme', d.card_theme,
           'card_sound', d.card_sound,
           'leaderboard_eligibility', d.leaderboard_eligibility,
           'price_usd',  d.price_usd_at_donation,
           'amount_usd', d.amount_usd
         )
  FROM public.donations d
  WHERE d.recipient_id IS NOT NULL
),
wt AS (
  -- Y NGUYÊN nhánh cũ (external wallet)
  SELECT 'wallet_transfers:' || w.id::text,
         'wallet_transfers'::text,
         w.id::text,
         w.user_id,
         NULL::uuid,
         w.tx_hash,
         CASE
           WHEN upper(w.token_symbol) = 'BTC' OR w.chain_id = 0 THEN 'btc'
           WHEN w.chain_id = 56 THEN 'bsc'
           WHEN w.chain_id = 97 THEN 'bsc_testnet'
           ELSE COALESCE(w.chain_family, 'unknown')
         END,
         w.chain_id,
         upper(w.token_symbol),
         lower(NULLIF(w.token_address, '')),
         CASE WHEN w.direction = ANY (ARRAY['in','out','internal']) THEN w.direction ELSE 'unknown' END,
         'external'::text,
         w.status,
         true,
         w.amount::text, w.fee, NULL::bigint,
         w.created_at, NULL::timestamptz, w.created_at,
         NULL::text, NULL::text,
         lower(NULLIF(w.counterparty_address, '')),
         'exact'::text,
         jsonb_build_object(
           'confirmations',        w.confirmations,
           'counterparty_address', lower(w.counterparty_address)
         )
  FROM public.wallet_transfers w
),
tx AS (
  -- ★ THAY ĐỔI: whitelist reconciliation + dedup vs donations/wallet_transfers
  SELECT 'transactions:' || t.id::text,
         'transactions'::text,
         t.id::text,
         t.user_id,
         NULL::uuid,
         t.tx_hash,
         CASE
           WHEN upper(t.token_symbol) = 'BTC' OR t.chain_id = 0 THEN 'btc'
           WHEN t.chain_id = 56 THEN 'bsc'
           WHEN t.chain_id = 97 THEN 'bsc_testnet'
           ELSE 'unknown'
         END,
         t.chain_id,
         upper(t.token_symbol),
         lower(NULLIF(t.token_address, '')),
         CASE
           WHEN lower(t.from_address) = lower(p.public_wallet_address)
             OR lower(t.from_address) = lower(p.btc_address)          THEN 'out'
           WHEN lower(t.to_address)   = lower(p.public_wallet_address)
             OR lower(t.to_address)   = lower(p.btc_address)          THEN 'in'
           ELSE 'unknown'
         END,
         'transfer'::text,
         t.status,
         false,
         t.amount, NULL::text, NULL::bigint,
         t.created_at, NULL::timestamptz, t.created_at,
         NULL::text,
         lower(NULLIF(t.from_address, '')),
         lower(NULLIF(t.to_address,   '')),
         CASE
           WHEN lower(t.from_address) = lower(p.public_wallet_address)
             OR lower(t.from_address) = lower(p.btc_address)
             OR lower(t.to_address)   = lower(p.public_wallet_address)
             OR lower(t.to_address)   = lower(p.btc_address)          THEN 'inferred'
           ELSE 'unknown'
         END,
         '{}'::jsonb
  FROM public.transactions t
  LEFT JOIN public.profiles p ON p.id = t.user_id
  WHERE (
      -- Whitelist 3 loại reconciliation on-chain thật sự độc lập
      (upper(t.token_symbol) = 'BTC'   AND t.chain_id = 0)
      OR (t.chain_id = 56 AND upper(t.token_symbol) = 'USDT')
      OR (t.chain_id = 56 AND upper(t.token_symbol) = 'BNB' AND t.token_address IS NULL)
    )
    AND NOT EXISTS (
      SELECT 1 FROM public.donations d
      WHERE lower(d.tx_hash) = lower(t.tx_hash)
        AND d.chain_id      = t.chain_id
    )
    AND NOT EXISTS (
      SELECT 1 FROM public.wallet_transfers w
      WHERE lower(w.tx_hash) = lower(t.tx_hash)
        AND w.chain_id      = t.chain_id
        AND w.user_id       = t.user_id
    )
),
sw AS (
  -- ★ MỚI: swap = 2 row (out leg + in leg), cùng tx_hash, cùng source_id
  -- swap chi ra
  SELECT ('swap_transactions:' || s.id::text) || ':out',
         'swap_transactions'::text,
         s.id::text,
         s.user_id,
         s.user_id,                 -- counterparty = chính user (self-swap)
         s.tx_hash,
         CASE WHEN s.chain_id = 56 THEN 'bsc' WHEN s.chain_id = 97 THEN 'bsc_testnet' ELSE 'unknown' END,
         s.chain_id,
         upper(s.from_symbol),
         NULL::text,
         'out'::text,
         'swap'::text,
         s.status,
         false,
         s.from_amount::text, NULL::text, NULL::bigint,
         s.created_at, NULL::timestamptz, s.created_at,
         NULL::text, NULL::text, NULL::text,
         'exact'::text,
         jsonb_build_object('swap_id', s.id::text, 'leg', 'out',
                            'pair_symbol', upper(s.to_symbol),
                            'pair_amount', s.to_amount)
  FROM public.swap_transactions s
  UNION ALL
  -- swap nhận về
  SELECT ('swap_transactions:' || s.id::text) || ':in',
         'swap_transactions'::text,
         s.id::text,
         s.user_id,
         s.user_id,
         s.tx_hash,
         CASE WHEN s.chain_id = 56 THEN 'bsc' WHEN s.chain_id = 97 THEN 'bsc_testnet' ELSE 'unknown' END,
         s.chain_id,
         upper(s.to_symbol),
         NULL::text,
         'in'::text,
         'swap'::text,
         s.status,
         false,
         s.to_amount::text, NULL::text, NULL::bigint,
         s.created_at, NULL::timestamptz, s.created_at,
         NULL::text, NULL::text, NULL::text,
         'exact'::text,
         jsonb_build_object('swap_id', s.id::text, 'leg', 'in',
                            'pair_symbol', upper(s.from_symbol),
                            'pair_amount', s.from_amount)
  FROM public.swap_transactions s
)
SELECT * FROM don_out
UNION ALL SELECT * FROM don_in
UNION ALL SELECT * FROM wt
UNION ALL SELECT * FROM tx
UNION ALL SELECT * FROM sw;

-- 2. Cấp lại quyền
GRANT SELECT ON public.v_unified_transactions TO authenticated, service_role;
-- REVOKE SELECT ON public.v_unified_transactions FROM anon;  -- xét sau

-- 3. v_unified_transactions_primary tự động cập nhật (view dựa view).
--    Row_number PARTITION BY (user_id, lower(tx_hash)) sẽ dedup swap out/in
--    NHẦM thành 1 → cần điều chỉnh partition:
--    Không đổi trong migration này; tách sang M6B-1b nếu Cha muốn dedup theo
--    (user_id, tx_hash, direction) để giữ 2 leg của swap.

-- Tùy chọn 1 (khuyến nghị):
CREATE OR REPLACE VIEW public.v_unified_transactions_primary AS
SELECT * FROM (
  SELECT v.*,
         row_number() OVER (
           PARTITION BY v.user_id,
                        COALESCE(lower(v.tx_hash), 'no-hash:' || v.source_table || ':' || v.source_id),
                        v.direction               -- ★ thêm direction vào partition để giữ 2 leg swap
           ORDER BY
             CASE v.source_table
               WHEN 'donations'         THEN 1
               WHEN 'wallet_transfers'  THEN 2
               WHEN 'swap_transactions' THEN 3
               WHEN 'transactions'      THEN 4
               ELSE 9
             END,
             CASE WHEN v.direction = 'unknown' THEN 2 ELSE 1 END,
             v.occurred_at DESC NULLS LAST
         ) AS dedup_rank
  FROM public.v_unified_transactions v
) ranked
WHERE dedup_rank = 1;

GRANT SELECT ON public.v_unified_transactions_primary TO authenticated, anon, service_role;

COMMIT;

-- ============================================================================
-- ROLLBACK:
--   Apply lại migration 20260630173340_...sql + 20260630174431_...sql
-- ============================================================================

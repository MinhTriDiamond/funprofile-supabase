
-- =====================================================================
-- Sub-phase E.2 — Broad flag donations bởi tx_hash dính Class A aux
-- =====================================================================
-- E.2A. Backup tx_hash seed + snapshot donations sẽ bị flag.
-- E.2B. Flag broad: UPDATE donations.integrity_status='suspect_aux_exchange_txhash'.
-- Chỉ áp dụng cho 77 aux Class A. Class B/C/D chờ review.
-- KHÔNG đổi amount/sender_id/recipient_id. KHÔNG xoá row. KHÔNG hard delete.

-- ---------- E.2A: Backup tx_hash seed ----------
CREATE TABLE IF NOT EXISTS audit_btc_aux_20260703.txhash_broad_seed_a (
  tx_hash text PRIMARY KEY,
  source text NOT NULL,               -- 'first_seen_tx' | 'wallet_transfers' | 'transactions' | 'donations'
  captured_at timestamptz NOT NULL DEFAULT now()
);

INSERT INTO audit_btc_aux_20260703.txhash_broad_seed_a (tx_hash, source)
WITH cls_a AS (
  SELECT lower(address) AS addr, lower(first_seen_tx) AS fst
  FROM public.profile_btc_aux_addresses
  WHERE classification='A_exchange_certain'
),
seeds AS (
  SELECT DISTINCT fst AS tx_hash, 'first_seen_tx'::text AS source
    FROM cls_a WHERE fst IS NOT NULL
  UNION
  SELECT DISTINCT lower(wt.tx_hash), 'wallet_transfers'
    FROM public.wallet_transfers wt
    JOIN cls_a ON lower(wt.counterparty_address)=cls_a.addr
   WHERE wt.chain_id=0 AND wt.tx_hash IS NOT NULL
  UNION
  SELECT DISTINCT lower(t.tx_hash), 'transactions'
    FROM public.transactions t
    JOIN cls_a ON lower(t.from_address)=cls_a.addr OR lower(t.to_address)=cls_a.addr
   WHERE t.chain_id=0 AND t.tx_hash IS NOT NULL
  UNION
  SELECT DISTINCT lower(d.tx_hash), 'donations'
    FROM public.donations d
    JOIN cls_a ON lower(d.sender_address)=cls_a.addr OR lower(d.recipient_address)=cls_a.addr
   WHERE d.token_symbol='BTC' AND d.tx_hash IS NOT NULL
)
SELECT tx_hash, MIN(source) FROM seeds GROUP BY tx_hash
ON CONFLICT (tx_hash) DO NOTHING;

-- Snapshot donations sẽ bị flag (trước khi UPDATE).
CREATE TABLE IF NOT EXISTS audit_btc_aux_20260703.donations_broad_flag_backup AS
SELECT d.*
FROM public.donations d
WHERE d.token_symbol='BTC'
  AND lower(d.tx_hash) IN (SELECT tx_hash FROM audit_btc_aux_20260703.txhash_broad_seed_a)
  AND FALSE;  -- placeholder tránh chèn 2 lần khi migration re-run

-- Chèn thực (idempotent: chỉ chèn dòng chưa có trong backup).
INSERT INTO audit_btc_aux_20260703.donations_broad_flag_backup
SELECT d.*
FROM public.donations d
WHERE d.token_symbol='BTC'
  AND lower(d.tx_hash) IN (SELECT tx_hash FROM audit_btc_aux_20260703.txhash_broad_seed_a)
  AND NOT EXISTS (
    SELECT 1 FROM audit_btc_aux_20260703.donations_broad_flag_backup b WHERE b.id = d.id
  );

-- ---------- E.2B: Flag broad ----------
-- Chỉ flag các row hiện đang 'ok' (giữ 7 row đã 'suspect_aux_exchange' nguyên trạng).
UPDATE public.donations d
SET integrity_status='suspect_aux_exchange_txhash',
    integrity_reason='tx_hash dính Class A aux (E.2 broad flag 03/07/2026)',
    integrity_flagged_at=now()
WHERE d.token_symbol='BTC'
  AND d.integrity_status='ok'
  AND lower(d.tx_hash) IN (SELECT tx_hash FROM audit_btc_aux_20260703.txhash_broad_seed_a);

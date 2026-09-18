CREATE OR REPLACE VIEW public.v_unified_transactions_primary AS
SELECT
  id,
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
  dedup_rank
FROM (
  SELECT
    v.id,
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
    row_number() OVER (
      PARTITION BY
        v.user_id,
        COALESCE(lower(v.tx_hash), 'no-hash:'::text || v.source_table || ':'::text || v.source_id),
        v.direction
      ORDER BY
        CASE v.source_table
          WHEN 'donations' THEN 1
          WHEN 'wallet_transfers' THEN 2
          WHEN 'swap_transactions' THEN 3
          WHEN 'transactions' THEN 4
          ELSE 9
        END,
        CASE WHEN v.direction = 'unknown' THEN 2 ELSE 1 END,
        v.occurred_at DESC NULLS LAST
    ) AS dedup_rank
  FROM public.v_unified_transactions v
) ranked
WHERE dedup_rank = 1
  AND NOT EXISTS (
    SELECT 1
    FROM public.token_ingest_filters f
    WHERE f.enabled IS TRUE
      AND lower(f.chain) = lower(COALESCE(ranked.chain, ''))
      AND upper(f.token_symbol) = upper(COALESCE(ranked.token_symbol, ''))
      AND ranked.chain IN ('bsc', 'btc')
      AND abs(COALESCE(ranked.amount_decimal, 0)) < f.min_amount
  )
  AND NOT EXISTS (
    SELECT 1
    FROM public.blacklisted_wallets b
    WHERE lower(b.wallet_address) = lower(COALESCE(ranked.sender_address, ''))
  );

GRANT SELECT ON public.v_unified_transactions_primary TO anon, authenticated;
GRANT ALL ON public.v_unified_transactions_primary TO service_role;
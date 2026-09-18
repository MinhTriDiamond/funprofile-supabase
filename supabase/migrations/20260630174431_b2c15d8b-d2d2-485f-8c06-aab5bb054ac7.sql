
CREATE OR REPLACE VIEW public.v_unified_transactions_primary
WITH (security_invoker = true) AS
SELECT id, source_table, source_id, user_id, counterparty_user_id, tx_hash,
       chain, chain_id, network, token_symbol, token_address, decimals,
       direction, direction_confidence, tx_type, status, is_external,
       amount_raw, amount_decimal, fee_raw, block_number,
       occurred_at, confirmed_at, created_at,
       memo, sender_address, recipient_address, metadata, dedup_rank
FROM (
  SELECT v.*,
    row_number() OVER (
      PARTITION BY v.user_id,
        COALESCE(lower(v.tx_hash), 'no-hash:' || v.source_table || ':' || v.source_id)
      ORDER BY
        CASE v.source_table
          WHEN 'donations' THEN 1
          WHEN 'wallet_transfers' THEN 2
          WHEN 'transactions' THEN 3
          ELSE 9
        END,
        CASE WHEN v.direction = 'unknown' THEN 2 ELSE 1 END,
        v.occurred_at DESC NULLS LAST
    ) AS dedup_rank
  FROM public.v_unified_transactions v
) ranked
WHERE dedup_rank = 1;

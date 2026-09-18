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
    direction_confidence,
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
    metadata,
    dedup_rank
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
            v.direction_confidence,
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
            v.metadata,
            row_number() OVER (PARTITION BY v.user_id, (COALESCE(lower(v.tx_hash), (('no-hash:'::text || v.source_table) || ':'::text) || v.source_id)) ORDER BY (
                CASE v.source_table
                    WHEN 'donations'::text THEN 1
                    WHEN 'wallet_transfers'::text THEN 2
                    WHEN 'transactions'::text THEN 3
                    ELSE 9
                END), (
                CASE
                    WHEN v.direction = 'unknown'::text THEN 2
                    ELSE 1
                END), v.occurred_at DESC NULLS LAST) AS dedup_rank
           FROM v_unified_transactions v) ranked
  WHERE dedup_rank = 1;

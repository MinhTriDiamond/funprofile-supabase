
BEGIN;

-- Safe numeric caster: trả NULL nếu text không convert được
CREATE OR REPLACE FUNCTION public._safe_numeric(_t text)
RETURNS numeric
LANGUAGE plpgsql
IMMUTABLE
SET search_path = public
AS $$
BEGIN
  IF _t IS NULL OR btrim(_t) = '' THEN RETURN NULL; END IF;
  RETURN _t::numeric;
EXCEPTION WHEN OTHERS THEN
  RETURN NULL;
END;
$$;

-- Resolver decimals: registry-first, fallback theo symbol
CREATE OR REPLACE FUNCTION public._resolve_decimals(_symbol text, _chain_id integer, _token_address text)
RETURNS integer
LANGUAGE sql
STABLE
SET search_path = public
AS $$
  SELECT COALESCE(
    (
      SELECT tr.decimals FROM public.tokens_registry tr
      WHERE upper(tr.symbol) = upper(_symbol)
        AND (tr.chain_id = _chain_id OR _chain_id IS NULL)
        AND (
          (tr.token_address IS NULL AND _token_address IS NULL)
          OR lower(tr.token_address) = lower(NULLIF(_token_address, ''))
          OR tr.token_address IS NULL
        )
      ORDER BY (CASE WHEN lower(tr.token_address) = lower(NULLIF(_token_address,'')) THEN 0
                     WHEN tr.token_address IS NULL AND _token_address IS NULL THEN 1
                     ELSE 2 END),
               tr.is_verified DESC,
               tr.updated_at DESC
      LIMIT 1
    ),
    CASE upper(COALESCE(_symbol,''))
      WHEN 'BTC'   THEN 8
      WHEN 'BTCB'  THEN 8
      WHEN 'BNB'   THEN 18
      WHEN 'TBNB'  THEN 18
      WHEN 'USDT'  THEN 6
      WHEN 'USDC'  THEN 6
      WHEN 'CAMLY' THEN 3
      WHEN 'FUN'   THEN 18
      ELSE 18
    END
  );
$$;

DROP VIEW IF EXISTS public.v_unified_transactions_primary;
DROP VIEW IF EXISTS public.v_unified_transactions;

CREATE VIEW public.v_unified_transactions AS
WITH don_out AS (
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
           WHEN d.chain_id = 1   THEN 'ethereum'
           ELSE COALESCE(d.chain_family, 'unknown')
         END AS chain,
         d.chain_id,
         CASE
           WHEN d.chain_family = 'btc' OR d.chain_id = 0 OR upper(d.token_symbol) = 'BTC' THEN 'btc'
           WHEN d.chain_id = 56  THEN 'bsc'
           WHEN d.chain_id = 97  THEN 'bsc_testnet'
           WHEN d.chain_id = 1   THEN 'ethereum'
           ELSE COALESCE(d.chain_family, 'unknown')
         END AS network,
         upper(d.token_symbol)                                    AS token_symbol,
         lower(NULLIF(d.token_address, ''))                       AS token_address,
         public._resolve_decimals(d.token_symbol, d.chain_id, d.token_address) AS decimals,
         'out'::text                                              AS direction,
         'gift'::text                                             AS tx_type,
         d.status,
         COALESCE(d.is_external, false)                           AS is_external,
         d.amount::text                                           AS amount_raw,
         public._safe_numeric(d.amount::text)                     AS amount_decimal,
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
  SELECT ('donations:' || d.id::text) || ':in',
         'donations'::text,
         d.id::text,
         d.recipient_id,
         d.sender_id,
         d.tx_hash,
         CASE
           WHEN d.chain_family = 'btc' OR d.chain_id = 0 OR upper(d.token_symbol) = 'BTC' THEN 'btc'
           WHEN d.chain_id = 56  THEN 'bsc'
           WHEN d.chain_id = 97  THEN 'bsc_testnet'
           WHEN d.chain_id = 1   THEN 'ethereum'
           ELSE COALESCE(d.chain_family, 'unknown')
         END,
         d.chain_id,
         CASE
           WHEN d.chain_family = 'btc' OR d.chain_id = 0 OR upper(d.token_symbol) = 'BTC' THEN 'btc'
           WHEN d.chain_id = 56  THEN 'bsc'
           WHEN d.chain_id = 97  THEN 'bsc_testnet'
           WHEN d.chain_id = 1   THEN 'ethereum'
           ELSE COALESCE(d.chain_family, 'unknown')
         END,
         upper(d.token_symbol),
         lower(NULLIF(d.token_address, '')),
         public._resolve_decimals(d.token_symbol, d.chain_id, d.token_address),
         'in'::text,
         'gift'::text,
         d.status,
         COALESCE(d.is_external, false),
         d.amount::text,
         public._safe_numeric(d.amount::text),
         d.fee, d.block_number,
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
           WHEN w.chain_id = 1  THEN 'ethereum'
           ELSE COALESCE(w.chain_family, 'unknown')
         END,
         w.chain_id,
         CASE
           WHEN upper(w.token_symbol) = 'BTC' OR w.chain_id = 0 THEN 'btc'
           WHEN w.chain_id = 56 THEN 'bsc'
           WHEN w.chain_id = 97 THEN 'bsc_testnet'
           WHEN w.chain_id = 1  THEN 'ethereum'
           ELSE COALESCE(w.chain_family, 'unknown')
         END,
         upper(w.token_symbol),
         lower(NULLIF(w.token_address, '')),
         public._resolve_decimals(w.token_symbol, w.chain_id, w.token_address),
         CASE WHEN w.direction = ANY (ARRAY['in','out','internal']) THEN w.direction ELSE 'unknown' END,
         'external'::text,
         w.status,
         true,
         w.amount::text,
         public._safe_numeric(w.amount::text),
         w.fee, NULL::bigint,
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
           WHEN t.chain_id = 1  THEN 'ethereum'
           ELSE 'unknown'
         END,
         t.chain_id,
         CASE
           WHEN upper(t.token_symbol) = 'BTC' OR t.chain_id = 0 THEN 'btc'
           WHEN t.chain_id = 56 THEN 'bsc'
           WHEN t.chain_id = 97 THEN 'bsc_testnet'
           WHEN t.chain_id = 1  THEN 'ethereum'
           ELSE 'unknown'
         END,
         upper(t.token_symbol),
         lower(NULLIF(t.token_address, '')),
         public._resolve_decimals(t.token_symbol, t.chain_id, t.token_address),
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
         t.amount::text,
         public._safe_numeric(t.amount::text),
         NULL::text, NULL::bigint,
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
  SELECT ('swap_transactions:' || s.id::text) || ':out',
         'swap_transactions'::text,
         s.id::text,
         s.user_id,
         s.user_id,
         s.tx_hash,
         CASE WHEN s.chain_id = 56 THEN 'bsc' WHEN s.chain_id = 97 THEN 'bsc_testnet' WHEN s.chain_id = 1 THEN 'ethereum' ELSE 'unknown' END,
         s.chain_id,
         CASE WHEN s.chain_id = 56 THEN 'bsc' WHEN s.chain_id = 97 THEN 'bsc_testnet' WHEN s.chain_id = 1 THEN 'ethereum' ELSE 'unknown' END,
         upper(s.from_symbol),
         NULL::text,
         public._resolve_decimals(s.from_symbol, s.chain_id, NULL),
         'out'::text,
         'swap'::text,
         s.status,
         false,
         s.from_amount::text,
         public._safe_numeric(s.from_amount::text),
         NULL::text, NULL::bigint,
         s.created_at, NULL::timestamptz, s.created_at,
         NULL::text, NULL::text, NULL::text,
         'exact'::text,
         jsonb_build_object('swap_id', s.id::text, 'leg', 'out',
                            'pair_symbol', upper(s.to_symbol),
                            'pair_amount', s.to_amount)
  FROM public.swap_transactions s
  UNION ALL
  SELECT ('swap_transactions:' || s.id::text) || ':in',
         'swap_transactions'::text,
         s.id::text,
         s.user_id,
         s.user_id,
         s.tx_hash,
         CASE WHEN s.chain_id = 56 THEN 'bsc' WHEN s.chain_id = 97 THEN 'bsc_testnet' WHEN s.chain_id = 1 THEN 'ethereum' ELSE 'unknown' END,
         s.chain_id,
         CASE WHEN s.chain_id = 56 THEN 'bsc' WHEN s.chain_id = 97 THEN 'bsc_testnet' WHEN s.chain_id = 1 THEN 'ethereum' ELSE 'unknown' END,
         upper(s.to_symbol),
         NULL::text,
         public._resolve_decimals(s.to_symbol, s.chain_id, NULL),
         'in'::text,
         'swap'::text,
         s.status,
         false,
         s.to_amount::text,
         public._safe_numeric(s.to_amount::text),
         NULL::text, NULL::bigint,
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

REVOKE SELECT ON public.v_unified_transactions FROM anon;
GRANT  SELECT ON public.v_unified_transactions TO authenticated, service_role;

CREATE VIEW public.v_unified_transactions_primary AS
SELECT * FROM (
  SELECT v.*,
         row_number() OVER (
           PARTITION BY v.user_id,
                        COALESCE(lower(v.tx_hash), 'no-hash:' || v.source_table || ':' || v.source_id),
                        v.direction
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

ALTER TABLE public.transactions
  ADD COLUMN IF NOT EXISTS is_junk_token boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS junk_reason text;

CREATE INDEX IF NOT EXISTS idx_transactions_is_junk_token
  ON public.transactions (is_junk_token) WHERE is_junk_token IS TRUE;

CREATE TABLE IF NOT EXISTS public.junk_token_contracts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  chain_id integer NOT NULL,
  contract_address text NOT NULL,
  token_symbol text,
  reason text,
  enabled boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (chain_id, contract_address)
);

GRANT SELECT ON public.junk_token_contracts TO authenticated, anon;
GRANT ALL ON public.junk_token_contracts TO service_role;
ALTER TABLE public.junk_token_contracts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "junk_token_contracts_public_read" ON public.junk_token_contracts
  FOR SELECT USING (true);
CREATE POLICY "junk_token_contracts_admin_write" ON public.junk_token_contracts
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE TRIGGER trg_junk_token_contracts_updated_at
  BEFORE UPDATE ON public.junk_token_contracts
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

INSERT INTO public.junk_token_contracts (chain_id, contract_address, token_symbol, reason) VALUES
  (56, '0x2b1a5fc374bb1f59f8502724a10ebd86826cff62', 'BNB ETF', 'airdrop spam, 301 log Transfer giong nhau trong 1 tx'),
  (56, '0x314284e7c2ba48f13fd215c3fcb0e3ce69b15c27', 'MRVL', 'airdrop spam, 900 log Transfer giong nhau trong 1 tx'),
  (56, '0x4589a902014b8ede7d5f303f746d31d30a0aea34', 'GME', 'airdrop spam, 301 log Transfer giong nhau trong 1 tx'),
  (56, '0xd758640d6166b3e18e7848fea5aadf1b822db4c9', 'MAVRO', 'airdrop spam, 1001 log Transfer giong nhau trong 1 tx')
ON CONFLICT (chain_id, contract_address) DO NOTHING;

CREATE OR REPLACE VIEW public.v_unified_transactions_primary AS
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
    dedup_rank,
    is_spam
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
            v.is_spam,
            row_number() OVER (PARTITION BY v.user_id, (COALESCE(lower(v.tx_hash), (('no-hash:'::text || v.source_table) || ':'::text) || v.source_id)), v.direction ORDER BY (
                CASE v.source_table
                    WHEN 'donations'::text THEN 1
                    WHEN 'wallet_transfers'::text THEN 2
                    WHEN 'swap_transactions'::text THEN 3
                    WHEN 'transactions'::text THEN 4
                    ELSE 9
                END), (
                CASE
                    WHEN v.direction = 'unknown'::text THEN 2
                    ELSE 1
                END), v.occurred_at DESC NULLS LAST) AS dedup_rank
           FROM v_unified_transactions v) ranked
  WHERE dedup_rank = 1 AND is_spam IS NOT TRUE
    AND NOT (EXISTS ( SELECT 1
           FROM public.transactions jt
          WHERE ranked.source_table = 'transactions'::text AND jt.id::text = ranked.source_id AND jt.is_junk_token IS TRUE))
    AND NOT (EXISTS ( SELECT 1
           FROM token_ingest_filters f
          WHERE f.enabled IS TRUE AND lower(f.chain) = lower(COALESCE(ranked.chain, ''::text)) AND upper(f.token_symbol) = upper(COALESCE(ranked.token_symbol, ''::text)) AND (ranked.chain = ANY (ARRAY['bsc'::text, 'btc'::text])) AND abs(COALESCE(ranked.amount_decimal, 0::numeric)) < f.min_amount))
    AND NOT (EXISTS ( SELECT 1
           FROM blacklisted_wallets b
          WHERE lower(b.wallet_address) = lower(COALESCE(ranked.sender_address, ''::text))));
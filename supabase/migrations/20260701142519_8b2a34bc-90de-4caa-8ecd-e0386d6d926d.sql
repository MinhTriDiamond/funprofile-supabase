
ALTER TABLE public.swap_transactions
  ADD COLUMN IF NOT EXISTS dex_provider    text,
  ADD COLUMN IF NOT EXISTS from_amount_usd numeric,
  ADD COLUMN IF NOT EXISTS to_amount_usd   numeric,
  ADD COLUMN IF NOT EXISTS quote_id        text,
  ADD COLUMN IF NOT EXISTS verified_by     text NOT NULL DEFAULT 'client-legacy';

CREATE UNIQUE INDEX IF NOT EXISTS uniq_swap_tx_chain
  ON public.swap_transactions (lower(tx_hash), chain_id)
  WHERE tx_hash IS NOT NULL;

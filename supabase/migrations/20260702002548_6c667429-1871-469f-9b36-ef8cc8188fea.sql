
-- Search Round 4 — Phase 4: pg_trgm GIN indexes on direct search fields.
-- pg_trgm đã bật (1.6). Không tạo lại. Không đổi RPC contract, không đổi view.
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- donations
CREATE INDEX IF NOT EXISTS idx_donations_tx_hash_trgm
  ON public.donations USING gin (lower(tx_hash) gin_trgm_ops)
  WHERE tx_hash IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_donations_sender_address_trgm
  ON public.donations USING gin (lower(sender_address) gin_trgm_ops)
  WHERE sender_address IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_donations_recipient_address_trgm
  ON public.donations USING gin (lower(recipient_address) gin_trgm_ops)
  WHERE recipient_address IS NOT NULL;

-- wallet_transfers
CREATE INDEX IF NOT EXISTS idx_wallet_transfers_tx_hash_trgm
  ON public.wallet_transfers USING gin (lower(tx_hash) gin_trgm_ops)
  WHERE tx_hash IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_wallet_transfers_counterparty_address_trgm
  ON public.wallet_transfers USING gin (lower(counterparty_address) gin_trgm_ops)
  WHERE counterparty_address IS NOT NULL;

-- transactions
CREATE INDEX IF NOT EXISTS idx_transactions_tx_hash_trgm
  ON public.transactions USING gin (lower(tx_hash) gin_trgm_ops)
  WHERE tx_hash IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_transactions_from_address_trgm
  ON public.transactions USING gin (lower(from_address) gin_trgm_ops)
  WHERE from_address IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_transactions_to_address_trgm
  ON public.transactions USING gin (lower(to_address) gin_trgm_ops)
  WHERE to_address IS NOT NULL;

-- swap_transactions (chỉ tx_hash, không có địa chỉ from/to riêng)
CREATE INDEX IF NOT EXISTS idx_swap_transactions_tx_hash_trgm
  ON public.swap_transactions USING gin (lower(tx_hash) gin_trgm_ops)
  WHERE tx_hash IS NOT NULL;

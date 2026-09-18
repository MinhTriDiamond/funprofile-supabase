-- Cho phép nhiều donation share cùng tx_hash (cần thiết cho FunDisperse: 1 tx → nhiều recipient).
-- Dedup mới: (tx_hash, recipient_id) — mỗi cặp duy nhất.

ALTER TABLE public.donations DROP CONSTRAINT IF EXISTS donations_tx_hash_key;

CREATE UNIQUE INDEX IF NOT EXISTS donations_tx_hash_recipient_key
  ON public.donations (tx_hash, recipient_id);

-- Index cũ cho query theo tx_hash vẫn cần (scanner, lookup)
CREATE INDEX IF NOT EXISTS donations_tx_hash_idx
  ON public.donations (tx_hash);

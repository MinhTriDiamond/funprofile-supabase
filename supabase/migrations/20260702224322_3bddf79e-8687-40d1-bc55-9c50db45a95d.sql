
-- B1. Thêm 3 cột
ALTER TABLE public.tokens_registry
  ADD COLUMN IF NOT EXISTS max_single_usd numeric,
  ADD COLUMN IF NOT EXISTS default_price_usd numeric,
  ADD COLUMN IF NOT EXISTS is_leaderboard_eligible boolean NOT NULL DEFAULT true;

COMMENT ON COLUMN public.tokens_registry.max_single_usd IS
  'Sanity cap: 1 tx vượt giá trị này bị loại khỏi BXH USD (chống outlier). NULL = không cap.';
COMMENT ON COLUMN public.tokens_registry.default_price_usd IS
  'Giá tham chiếu fallback dùng khi thiếu historical price. NULL = bắt buộc phải có historical.';
COMMENT ON COLUMN public.tokens_registry.is_leaderboard_eligible IS
  'Token có được tính vào Benefactors/Recipients leaderboard USD không.';

-- B2. Seed cấu hình theo SSOT_SPEC_FINAL §1

-- BSC mainnet (chain_id=56)
UPDATE public.tokens_registry SET
  max_single_usd = 10000,
  default_price_usd = 0.000014,
  is_leaderboard_eligible = true
WHERE chain_id = 56 AND symbol = 'CAMLY';

UPDATE public.tokens_registry SET
  max_single_usd = 1000000,
  default_price_usd = 1,
  is_leaderboard_eligible = true
WHERE chain_id = 56 AND symbol IN ('USDT', 'USDC');

UPDATE public.tokens_registry SET
  max_single_usd = 5000000,
  is_leaderboard_eligible = true
WHERE chain_id = 56 AND symbol = 'BTCB';

UPDATE public.tokens_registry SET
  max_single_usd = 500000,
  is_leaderboard_eligible = true
WHERE chain_id = 56 AND symbol = 'BNB';

UPDATE public.tokens_registry SET
  is_leaderboard_eligible = false
WHERE chain_id = 56 AND symbol = 'TONCOIN';

-- Bitcoin (chain_id=0)
UPDATE public.tokens_registry SET
  max_single_usd = 5000000,
  is_leaderboard_eligible = true
WHERE chain_id = 0 AND symbol = 'BTC';

-- BSC testnet (chain_id=97) — loại toàn bộ khỏi BXH
UPDATE public.tokens_registry SET
  is_leaderboard_eligible = false
WHERE chain_id = 97;

-- B3. Index tra cứu nhanh cho RPC
CREATE INDEX IF NOT EXISTS tokens_registry_leaderboard_lookup_idx
  ON public.tokens_registry (chain_id, symbol, is_leaderboard_eligible);

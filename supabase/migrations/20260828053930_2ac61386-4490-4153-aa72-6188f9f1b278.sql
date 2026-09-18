ALTER TABLE public.treasury_flows
  ADD COLUMN IF NOT EXISTS token_symbol TEXT NOT NULL DEFAULT 'FUN';

ALTER TABLE public.treasury_vaults
  ADD COLUMN IF NOT EXISTS token_symbol TEXT NOT NULL DEFAULT 'FUN';

ALTER TABLE public.treasury_vaults
  DROP CONSTRAINT IF EXISTS treasury_vaults_vault_key_key;

CREATE UNIQUE INDEX IF NOT EXISTS uq_treasury_vaults_key_token
  ON public.treasury_vaults (vault_key, token_symbol);

-- Idempotency cho dòng tiền MỚI (loại trừ epoch_allocation lịch sử ghi tăng dần)
CREATE UNIQUE INDEX IF NOT EXISTS uq_treasury_flows_reference
  ON public.treasury_flows (reference_table, reference_id, flow_type, token_symbol, destination_vault)
  WHERE reference_table IS NOT NULL
    AND reference_id IS NOT NULL
    AND flow_type <> 'epoch_allocation';

-- Idempotency outflow: 1 tx_hash on-chain chỉ ghi 1 lần cho mỗi token
CREATE UNIQUE INDEX IF NOT EXISTS uq_treasury_flows_tx_hash
  ON public.treasury_flows (lower(metadata->>'tx_hash'), token_symbol)
  WHERE metadata->>'tx_hash' IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_treasury_flows_token
  ON public.treasury_flows (token_symbol, created_at DESC);

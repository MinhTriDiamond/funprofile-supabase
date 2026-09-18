
-- Drop old unique constraint on wallet_transfers
ALTER TABLE public.wallet_transfers DROP CONSTRAINT IF EXISTS wallet_transfers_tx_hash_direction_token_symbol_key;

-- Add new unique constraint that includes user_id
ALTER TABLE public.wallet_transfers ADD CONSTRAINT wallet_transfers_tx_hash_direction_token_symbol_user_id_key UNIQUE (tx_hash, direction, token_symbol, user_id);

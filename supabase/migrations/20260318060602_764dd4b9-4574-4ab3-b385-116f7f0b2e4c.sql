
-- 1. Tạo bảng wallet_transfers
CREATE TABLE public.wallet_transfers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  tx_hash text NOT NULL,
  direction text NOT NULL CHECK (direction IN ('in', 'out')),
  token_symbol text NOT NULL,
  token_address text,
  amount numeric NOT NULL,
  counterparty_address text,
  chain_id integer NOT NULL DEFAULT 56,
  status text NOT NULL DEFAULT 'confirmed',
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(tx_hash, direction, token_symbol)
);

CREATE INDEX idx_wallet_transfers_user_id ON public.wallet_transfers(user_id);
CREATE INDEX idx_wallet_transfers_tx_hash ON public.wallet_transfers(tx_hash);
CREATE INDEX idx_wallet_transfers_created_at ON public.wallet_transfers(created_at DESC);

ALTER TABLE public.wallet_transfers ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can view wallet transfers"
  ON public.wallet_transfers FOR SELECT
  USING (true);

CREATE POLICY "Users can insert own wallet transfers"
  ON public.wallet_transfers FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

-- 2. Cập nhật RPC get_user_donation_summary gộp wallet_transfers
CREATE OR REPLACE FUNCTION public.get_user_donation_summary(p_user_id uuid)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH donation_received AS (
    SELECT token_symbol, SUM(amount::numeric) as total_amount, COUNT(*) as total_count
    FROM donations
    WHERE recipient_id = p_user_id AND status = 'confirmed'
    GROUP BY token_symbol
  ),
  donation_sent AS (
    SELECT token_symbol, SUM(amount::numeric) as total_amount, COUNT(*) as total_count
    FROM donations
    WHERE sender_id = p_user_id AND status = 'confirmed'
    GROUP BY token_symbol
  ),
  swap_in AS (
    SELECT to_symbol as token_symbol, SUM(to_amount) as total_amount, COUNT(*) as total_count
    FROM swap_transactions
    WHERE user_id = p_user_id AND status = 'confirmed'
    GROUP BY to_symbol
  ),
  swap_out AS (
    SELECT from_symbol as token_symbol, SUM(from_amount) as total_amount, COUNT(*) as total_count
    FROM swap_transactions
    WHERE user_id = p_user_id AND status = 'confirmed'
    GROUP BY from_symbol
  ),
  transfer_in AS (
    SELECT token_symbol, SUM(amount) as total_amount, COUNT(*) as total_count
    FROM wallet_transfers
    WHERE user_id = p_user_id AND direction = 'in' AND status = 'confirmed'
    GROUP BY token_symbol
  ),
  transfer_out AS (
    SELECT token_symbol, SUM(amount) as total_amount, COUNT(*) as total_count
    FROM wallet_transfers
    WHERE user_id = p_user_id AND direction = 'out' AND status = 'confirmed'
    GROUP BY token_symbol
  ),
  all_received AS (
    SELECT token_symbol, SUM(total_amount) as total_amount, SUM(total_count) as total_count
    FROM (
      SELECT * FROM donation_received
      UNION ALL
      SELECT * FROM swap_in
      UNION ALL
      SELECT * FROM transfer_in
    ) combined
    GROUP BY token_symbol
  ),
  all_sent AS (
    SELECT token_symbol, SUM(total_amount) as total_amount, SUM(total_count) as total_count
    FROM (
      SELECT * FROM donation_sent
      UNION ALL
      SELECT * FROM swap_out
      UNION ALL
      SELECT * FROM transfer_out
    ) combined
    GROUP BY token_symbol
  )
  SELECT jsonb_build_object(
    'received', COALESCE((
      SELECT jsonb_object_agg(token_symbol, jsonb_build_object('amount', total_amount, 'count', total_count))
      FROM all_received
    ), '{}'::jsonb),
    'sent', COALESCE((
      SELECT jsonb_object_agg(token_symbol, jsonb_build_object('amount', total_amount, 'count', total_count))
      FROM all_sent
    ), '{}'::jsonb)
  );
$$;

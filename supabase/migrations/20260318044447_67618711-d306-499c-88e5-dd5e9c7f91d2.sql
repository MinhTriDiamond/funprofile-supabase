
-- 1. Tạo bảng swap_transactions
CREATE TABLE public.swap_transactions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  tx_hash text NOT NULL,
  from_symbol text NOT NULL,
  to_symbol text NOT NULL,
  from_amount numeric NOT NULL,
  to_amount numeric NOT NULL,
  chain_id integer NOT NULL DEFAULT 56,
  status text NOT NULL DEFAULT 'confirmed',
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Index
CREATE INDEX idx_swap_transactions_user_id ON public.swap_transactions(user_id);
CREATE INDEX idx_swap_transactions_created_at ON public.swap_transactions(created_at DESC);

-- RLS
ALTER TABLE public.swap_transactions ENABLE ROW LEVEL SECURITY;

-- Ai cũng có thể xem (public profile history)
CREATE POLICY "Anyone can view swap transactions"
  ON public.swap_transactions FOR SELECT
  USING (true);

-- Chỉ user đó mới insert được
CREATE POLICY "Users can insert own swap transactions"
  ON public.swap_transactions FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

-- 2. Cập nhật RPC get_user_donation_summary để gộp swap
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
  all_received AS (
    SELECT token_symbol, SUM(total_amount) as total_amount, SUM(total_count) as total_count
    FROM (
      SELECT * FROM donation_received
      UNION ALL
      SELECT * FROM swap_in
    ) combined
    GROUP BY token_symbol
  ),
  all_sent AS (
    SELECT token_symbol, SUM(total_amount) as total_amount, SUM(total_count) as total_count
    FROM (
      SELECT * FROM donation_sent
      UNION ALL
      SELECT * FROM swap_out
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

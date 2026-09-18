
-- Tạo bảng mint_allocations cho epoch-based minting
CREATE TABLE public.mint_allocations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  epoch_id UUID REFERENCES mint_epochs(id) NOT NULL,
  user_id UUID NOT NULL,
  light_score_total NUMERIC NOT NULL DEFAULT 0,
  share_percent NUMERIC NOT NULL DEFAULT 0,
  allocation_amount NUMERIC NOT NULL DEFAULT 0,
  allocation_amount_capped NUMERIC NOT NULL DEFAULT 0,
  is_eligible BOOLEAN NOT NULL DEFAULT true,
  reason_codes TEXT[] DEFAULT '{}',
  status TEXT NOT NULL DEFAULT 'pending',
  mint_request_id UUID REFERENCES pplp_mint_requests(id),
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(epoch_id, user_id)
);

-- Cập nhật mint_epochs: thêm cột cho monthly epoch
ALTER TABLE mint_epochs ADD COLUMN IF NOT EXISTS epoch_month TEXT;
ALTER TABLE mint_epochs ADD COLUMN IF NOT EXISTS mint_pool NUMERIC DEFAULT 100000;
ALTER TABLE mint_epochs ADD COLUMN IF NOT EXISTS total_light_score NUMERIC DEFAULT 0;
ALTER TABLE mint_epochs ADD COLUMN IF NOT EXISTS eligible_users INTEGER DEFAULT 0;
ALTER TABLE mint_epochs ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'open';
ALTER TABLE mint_epochs ADD COLUMN IF NOT EXISTS rules_version TEXT DEFAULT 'LS-Math-v1.0';
ALTER TABLE mint_epochs ADD COLUMN IF NOT EXISTS snapshot_at TIMESTAMPTZ;

-- RLS cho mint_allocations
ALTER TABLE public.mint_allocations ENABLE ROW LEVEL SECURITY;

-- User chỉ đọc allocation của mình
CREATE POLICY "Users can read own allocations"
  ON public.mint_allocations
  FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

-- Admin đọc tất cả (qua has_role)
CREATE POLICY "Admins can read all allocations"
  ON public.mint_allocations
  FOR SELECT
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

-- Admin có thể insert/update
CREATE POLICY "Admins can manage allocations"
  ON public.mint_allocations
  FOR ALL
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- User có thể update status từ pending sang claimed (claim flow)
CREATE POLICY "Users can claim own allocations"
  ON public.mint_allocations
  FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id AND status = 'pending')
  WITH CHECK (auth.uid() = user_id AND status = 'claimed');

-- Enable realtime cho mint_allocations
ALTER PUBLICATION supabase_realtime ADD TABLE public.mint_allocations;

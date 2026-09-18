-- Bước 1a: Thêm cột mới vào profiles cho wallet-first signup
ALTER TABLE public.profiles 
  ADD COLUMN IF NOT EXISTS signup_method text NOT NULL DEFAULT 'email',
  ADD COLUMN IF NOT EXISTS reward_locked boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS account_status text NOT NULL DEFAULT 'active',
  ADD COLUMN IF NOT EXISTS email_verified_at timestamptz;

-- Bước 1b: Tạo bảng wallet_challenges (nonce-based auth)
CREATE TABLE public.wallet_challenges (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  wallet_address text NOT NULL,
  nonce text NOT NULL UNIQUE,
  message text NOT NULL,
  expires_at timestamptz NOT NULL,
  used_at timestamptz,
  ip_address text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_wallet_challenges_nonce ON public.wallet_challenges(nonce);
CREATE INDEX idx_wallet_challenges_expires ON public.wallet_challenges(expires_at);

-- RLS: chỉ service role truy cập
ALTER TABLE public.wallet_challenges ENABLE ROW LEVEL SECURITY;
CREATE POLICY "No public access to wallet_challenges" ON public.wallet_challenges FOR ALL USING (false);

-- Bước 1c: Tạo RPC unlock_wallet_reward (Security Definer)
CREATE OR REPLACE FUNCTION public.unlock_wallet_reward(p_user_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_confirmed timestamptz;
  v_method text;
  v_status text;
  v_locked boolean;
BEGIN
  -- Lấy thông tin profile
  SELECT signup_method, account_status, reward_locked
  INTO v_method, v_status, v_locked
  FROM profiles WHERE id = p_user_id;

  -- Chỉ unlock cho wallet-first accounts đang limited + locked
  IF v_method != 'wallet' OR v_status != 'limited' OR v_locked != true THEN
    RETURN false;
  END IF;

  -- Kiểm tra email đã xác thực chưa (từ auth.users)
  SELECT email_confirmed_at INTO v_confirmed FROM auth.users WHERE id = p_user_id;
  IF v_confirmed IS NULL THEN RETURN false; END IF;

  -- Trusted transition: unlock rewards + activate account
  UPDATE profiles SET
    reward_locked = false,
    account_status = 'active',
    email_verified_at = v_confirmed
  WHERE id = p_user_id;
  
  RETURN true;
END;
$$;
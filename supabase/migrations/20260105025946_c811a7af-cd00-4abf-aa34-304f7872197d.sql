-- =====================================================
-- PHASE 1: VẠN VẬT QUY NHẤT - FUN-ID DATABASE SCHEMA
-- "FUN-ID là Passport của linh hồn để bước vào New Earth"
-- =====================================================

-- 1. BẢNG OAUTH_CLIENTS: Đăng ký định danh cho các platform
CREATE TABLE public.oauth_clients (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  client_id TEXT NOT NULL UNIQUE,
  client_secret TEXT NOT NULL,
  client_name TEXT NOT NULL,
  redirect_uris TEXT[] NOT NULL DEFAULT '{}',
  allowed_scopes TEXT[] NOT NULL DEFAULT ARRAY['profile', 'email', 'wallet'],
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Thêm comment mô tả
COMMENT ON TABLE public.oauth_clients IS 'Đăng ký định danh OAuth cho Fun Farm, Fun Play, Fun Planet';

-- RLS cho oauth_clients (chỉ admin được xem/quản lý)
ALTER TABLE public.oauth_clients ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Only admins can view oauth_clients"
ON public.oauth_clients FOR SELECT
USING (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Only admins can manage oauth_clients"
ON public.oauth_clients FOR ALL
USING (has_role(auth.uid(), 'admin'::app_role));

-- 2. BẢNG OTP_CODES: Luồng đăng ký Web2 siêu nhanh
CREATE TABLE public.otp_codes (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  identifier TEXT NOT NULL, -- email hoặc phone
  code TEXT NOT NULL,
  type TEXT NOT NULL DEFAULT 'email', -- 'email' hoặc 'phone'
  attempts INTEGER NOT NULL DEFAULT 0,
  max_attempts INTEGER NOT NULL DEFAULT 5,
  is_used BOOLEAN NOT NULL DEFAULT false,
  expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.otp_codes IS 'Mã OTP cho luồng đăng ký/đăng nhập Web2 siêu nhanh';

-- Index cho lookup nhanh
CREATE INDEX idx_otp_codes_identifier ON public.otp_codes(identifier, type);
CREATE INDEX idx_otp_codes_expires ON public.otp_codes(expires_at);

-- RLS cho otp_codes (chỉ system có thể tạo/xác thực)
ALTER TABLE public.otp_codes ENABLE ROW LEVEL SECURITY;

-- Không ai có thể đọc trực tiếp, chỉ qua Edge Functions
CREATE POLICY "OTP codes are system managed only"
ON public.otp_codes FOR SELECT
USING (false);

-- 3. BẢNG SOUL_NFTS: Định danh linh hồn gắn liền profile
CREATE TABLE public.soul_nfts (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  token_id TEXT UNIQUE, -- NFT token ID on blockchain
  contract_address TEXT, -- Smart contract address
  chain_id INTEGER NOT NULL DEFAULT 56, -- BSC Mainnet
  metadata_uri TEXT, -- IPFS/Arweave URI
  soul_name TEXT, -- Tên linh hồn
  soul_element TEXT, -- Ngũ hành: Kim, Mộc, Thủy, Hỏa, Thổ
  soul_level INTEGER NOT NULL DEFAULT 1,
  experience_points BIGINT NOT NULL DEFAULT 0,
  minted_at TIMESTAMP WITH TIME ZONE,
  is_minted BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(user_id) -- Mỗi user chỉ có 1 Soul NFT
);

COMMENT ON TABLE public.soul_nfts IS 'Soul NFT - Định danh linh hồn không thể chuyển nhượng, gắn liền với FUN-ID';

-- RLS cho soul_nfts
ALTER TABLE public.soul_nfts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own soul NFT"
ON public.soul_nfts FOR SELECT
USING (auth.uid() = user_id);

CREATE POLICY "Anyone can view minted soul NFTs"
ON public.soul_nfts FOR SELECT
USING (is_minted = true);

CREATE POLICY "System creates soul NFTs"
ON public.soul_nfts FOR INSERT
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own soul NFT"
ON public.soul_nfts FOR UPDATE
USING (auth.uid() = user_id);

-- 4. BẢNG CUSTODIAL_WALLETS: Ví ẩn cho người dùng Web2
CREATE TABLE public.custodial_wallets (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE UNIQUE,
  wallet_address TEXT NOT NULL UNIQUE,
  encrypted_private_key TEXT NOT NULL, -- Mã hóa với master key
  encryption_version INTEGER NOT NULL DEFAULT 1,
  chain_id INTEGER NOT NULL DEFAULT 56, -- BSC Mainnet
  is_active BOOLEAN NOT NULL DEFAULT true,
  last_activity_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.custodial_wallets IS 'Ví được quản lý cho người dùng Web2, tự động tạo khi đăng ký';

-- Index cho lookup
CREATE INDEX idx_custodial_wallets_address ON public.custodial_wallets(wallet_address);

-- RLS cho custodial_wallets (bảo mật cao nhất)
ALTER TABLE public.custodial_wallets ENABLE ROW LEVEL SECURITY;

-- Chỉ user xem được địa chỉ ví của mình (không thấy private key)
CREATE POLICY "Users can view their own custodial wallet address"
ON public.custodial_wallets FOR SELECT
USING (auth.uid() = user_id);

-- Chỉ system tạo custodial wallet
CREATE POLICY "System creates custodial wallets"
ON public.custodial_wallets FOR INSERT
WITH CHECK (false); -- Chỉ qua service_role

-- 5. CẬP NHẬT BẢNG PROFILES: Thêm các trường mới
ALTER TABLE public.profiles
ADD COLUMN IF NOT EXISTS registered_from TEXT DEFAULT 'fun_profile', -- Đăng ký từ platform nào
ADD COLUMN IF NOT EXISTS total_rewards BIGINT NOT NULL DEFAULT 0, -- Tổng thưởng tích lũy từ mọi platform
ADD COLUMN IF NOT EXISTS soul_level INTEGER NOT NULL DEFAULT 1, -- Cấp độ linh hồn
ADD COLUMN IF NOT EXISTS fun_id TEXT UNIQUE, -- FUN-ID định danh duy nhất (e.g., FUN-ABC123)
ADD COLUMN IF NOT EXISTS oauth_provider TEXT, -- OAuth provider nếu đăng nhập qua SSO
ADD COLUMN IF NOT EXISTS last_login_platform TEXT, -- Platform đăng nhập gần nhất
ADD COLUMN IF NOT EXISTS cross_platform_data JSONB DEFAULT '{}'; -- Dữ liệu tổng hợp từ các platform

COMMENT ON COLUMN public.profiles.registered_from IS 'Platform đăng ký ban đầu: fun_profile, fun_farm, fun_play, fun_planet';
COMMENT ON COLUMN public.profiles.total_rewards IS 'Tổng thưởng CAMLY tích lũy từ tất cả platform';
COMMENT ON COLUMN public.profiles.soul_level IS 'Cấp độ linh hồn, tăng theo hoạt động và đóng góp';
COMMENT ON COLUMN public.profiles.fun_id IS 'FUN-ID định danh duy nhất dạng FUN-XXXXXX';

-- Index cho FUN-ID lookup
CREATE INDEX IF NOT EXISTS idx_profiles_fun_id ON public.profiles(fun_id);
CREATE INDEX IF NOT EXISTS idx_profiles_registered_from ON public.profiles(registered_from);

-- 6. FUNCTION TẠO FUN-ID TỰ ĐỘNG
CREATE OR REPLACE FUNCTION public.generate_fun_id()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  new_fun_id TEXT;
  chars TEXT := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; -- Không có I, O, 0, 1 để tránh nhầm
  i INTEGER;
BEGIN
  -- Chỉ tạo nếu chưa có FUN-ID
  IF NEW.fun_id IS NULL THEN
    LOOP
      new_fun_id := 'FUN-';
      FOR i IN 1..6 LOOP
        new_fun_id := new_fun_id || substr(chars, floor(random() * length(chars) + 1)::int, 1);
      END LOOP;
      
      -- Kiểm tra unique
      EXIT WHEN NOT EXISTS (SELECT 1 FROM profiles WHERE fun_id = new_fun_id);
    END LOOP;
    
    NEW.fun_id := new_fun_id;
  END IF;
  
  RETURN NEW;
END;
$$;

-- Trigger tự động tạo FUN-ID khi insert profile mới
DROP TRIGGER IF EXISTS trigger_generate_fun_id ON public.profiles;
CREATE TRIGGER trigger_generate_fun_id
  BEFORE INSERT ON public.profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.generate_fun_id();

-- 7. FUNCTION TẠO SOUL NFT TỰ ĐỘNG KHI CÓ PROFILE MỚI
CREATE OR REPLACE FUNCTION public.create_soul_nft_for_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  elements TEXT[] := ARRAY['Kim', 'Mộc', 'Thủy', 'Hỏa', 'Thổ'];
  random_element TEXT;
BEGIN
  -- Chọn ngũ hành ngẫu nhiên
  random_element := elements[floor(random() * 5 + 1)::int];
  
  -- Tạo Soul NFT placeholder (chưa mint on-chain)
  INSERT INTO public.soul_nfts (user_id, soul_element, soul_level)
  VALUES (NEW.id, random_element, 1)
  ON CONFLICT (user_id) DO NOTHING;
  
  RETURN NEW;
END;
$$;

-- Trigger tạo Soul NFT khi có user mới
DROP TRIGGER IF EXISTS trigger_create_soul_nft ON public.profiles;
CREATE TRIGGER trigger_create_soul_nft
  AFTER INSERT ON public.profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.create_soul_nft_for_new_user();

-- 8. SEED DATA: Đăng ký các OAuth clients cho ecosystem
INSERT INTO public.oauth_clients (client_id, client_secret, client_name, redirect_uris, allowed_scopes)
VALUES 
  ('fun_farm_client', 'farm_secret_' || gen_random_uuid()::text, 'Fun Farm', 
   ARRAY['https://funfarm.fun/callback', 'http://localhost:3000/callback'], 
   ARRAY['profile', 'email', 'wallet', 'rewards']),
  ('fun_play_client', 'play_secret_' || gen_random_uuid()::text, 'Fun Play',
   ARRAY['https://funplay.fun/callback', 'http://localhost:3001/callback'],
   ARRAY['profile', 'email', 'wallet', 'gaming']),
  ('fun_planet_client', 'planet_secret_' || gen_random_uuid()::text, 'Fun Planet',
   ARRAY['https://funplanet.fun/callback', 'http://localhost:3002/callback'],
   ARRAY['profile', 'email', 'wallet', 'social'])
ON CONFLICT (client_id) DO NOTHING;

-- 9. TRIGGER CẬP NHẬT updated_at
CREATE TRIGGER update_oauth_clients_updated_at
  BEFORE UPDATE ON public.oauth_clients
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_soul_nfts_updated_at
  BEFORE UPDATE ON public.soul_nfts
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_custodial_wallets_updated_at
  BEFORE UPDATE ON public.custodial_wallets
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();
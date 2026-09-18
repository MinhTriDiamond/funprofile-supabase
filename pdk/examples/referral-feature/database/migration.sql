-- =============================================
-- REFERRAL FEATURE - DATABASE MIGRATION
-- =============================================
-- Hệ thống mã giới thiệu cho Fun Profile
-- 
-- HƯỚNG DẪN SỬ DỤNG:
-- 1. Copy toàn bộ nội dung file này
-- 2. Gửi cho Angel Fun Profile để chạy migration
-- 3. Đợi confirmation trước khi test
-- =============================================

-- Table: referral_codes
-- Lưu mã giới thiệu của mỗi user
CREATE TABLE IF NOT EXISTS public.referral_codes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  code TEXT NOT NULL UNIQUE,
  total_uses INTEGER NOT NULL DEFAULT 0,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  
  -- Mỗi user chỉ có 1 mã
  CONSTRAINT unique_user_referral_code UNIQUE (user_id)
);

-- Table: referral_uses
-- Lưu lịch sử sử dụng mã giới thiệu
CREATE TABLE IF NOT EXISTS public.referral_uses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code_id UUID NOT NULL REFERENCES public.referral_codes(id) ON DELETE CASCADE,
  referrer_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  referred_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  reward_amount DECIMAL(10, 2) NOT NULL DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  
  -- Mỗi user chỉ được refer 1 lần
  CONSTRAINT unique_referred_user UNIQUE (referred_id)
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_referral_codes_user_id 
  ON public.referral_codes(user_id);

CREATE INDEX IF NOT EXISTS idx_referral_codes_code 
  ON public.referral_codes(code);

CREATE INDEX IF NOT EXISTS idx_referral_uses_referrer_id 
  ON public.referral_uses(referrer_id);

CREATE INDEX IF NOT EXISTS idx_referral_uses_referred_id 
  ON public.referral_uses(referred_id);

CREATE INDEX IF NOT EXISTS idx_referral_uses_code_id 
  ON public.referral_uses(code_id);

-- Enable RLS
ALTER TABLE public.referral_codes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.referral_uses ENABLE ROW LEVEL SECURITY;

-- =============================================
-- RLS POLICIES - referral_codes
-- =============================================

-- Users có thể xem mã của mình
CREATE POLICY "Users can view own referral code"
  ON public.referral_codes
  FOR SELECT
  USING (auth.uid() = user_id);

-- Public có thể validate mã (chỉ đọc code, is_active)
CREATE POLICY "Anyone can validate referral codes"
  ON public.referral_codes
  FOR SELECT
  USING (is_active = true);

-- Users có thể tạo mã cho mình
CREATE POLICY "Users can create own referral code"
  ON public.referral_codes
  FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- Users có thể update mã của mình (toggle is_active)
CREATE POLICY "Users can update own referral code"
  ON public.referral_codes
  FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- =============================================
-- RLS POLICIES - referral_uses
-- =============================================

-- Referrer có thể xem ai đã dùng mã của họ
CREATE POLICY "Referrers can view their referral uses"
  ON public.referral_uses
  FOR SELECT
  USING (auth.uid() = referrer_id);

-- Referred user có thể xem record của mình
CREATE POLICY "Referred users can view their own record"
  ON public.referral_uses
  FOR SELECT
  USING (auth.uid() = referred_id);

-- Users có thể tạo referral use (khi apply code)
CREATE POLICY "Users can create referral use"
  ON public.referral_uses
  FOR INSERT
  WITH CHECK (auth.uid() = referred_id);

-- =============================================
-- FUNCTIONS
-- =============================================

-- Function to increment referral count
CREATE OR REPLACE FUNCTION public.increment_referral_count()
RETURNS INTEGER
LANGUAGE SQL
AS $$
  SELECT total_uses + 1
$$;

-- Trigger to update updated_at
CREATE OR REPLACE FUNCTION public.update_referral_codes_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

CREATE TRIGGER trigger_update_referral_codes_updated_at
  BEFORE UPDATE ON public.referral_codes
  FOR EACH ROW
  EXECUTE FUNCTION public.update_referral_codes_updated_at();

-- =============================================
-- DONE!
-- =============================================

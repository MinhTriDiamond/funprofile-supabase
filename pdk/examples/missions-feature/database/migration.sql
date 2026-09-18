-- =============================================
-- MISSIONS FEATURE - DATABASE MIGRATION
-- =============================================
-- Hệ thống nhiệm vụ hàng ngày cho Fun Profile
-- 
-- HƯỚNG DẪN SỬ DỤNG:
-- 1. Copy toàn bộ nội dung file này
-- 2. Gửi cho Angel Fun Profile để chạy migration
-- 3. Đợi confirmation trước khi test
-- =============================================

-- Table: mission_definitions
-- Định nghĩa các nhiệm vụ có sẵn
CREATE TABLE IF NOT EXISTS public.mission_definitions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  description TEXT NOT NULL,
  reward_amount DECIMAL(10, 2) NOT NULL DEFAULT 0,
  reward_type TEXT NOT NULL DEFAULT 'FUN',
  target_value INTEGER NOT NULL DEFAULT 1,
  mission_type TEXT NOT NULL DEFAULT 'daily',
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  
  -- Validate mission_type
  CONSTRAINT valid_mission_type CHECK (
    mission_type IN ('daily', 'weekly', 'one_time')
  )
);

-- Table: mission_progress
-- Tiến độ nhiệm vụ của từng user
CREATE TABLE IF NOT EXISTS public.mission_progress (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  mission_id UUID NOT NULL REFERENCES public.mission_definitions(id) ON DELETE CASCADE,
  current_value INTEGER NOT NULL DEFAULT 0,
  is_completed BOOLEAN NOT NULL DEFAULT false,
  completed_at TIMESTAMP WITH TIME ZONE,
  is_claimed BOOLEAN NOT NULL DEFAULT false,
  claimed_at TIMESTAMP WITH TIME ZONE,
  reset_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  
  -- Mỗi user chỉ có 1 progress per mission (per period)
  CONSTRAINT unique_user_mission_progress UNIQUE (user_id, mission_id, reset_at)
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_mission_definitions_is_active 
  ON public.mission_definitions(is_active);

CREATE INDEX IF NOT EXISTS idx_mission_definitions_type 
  ON public.mission_definitions(mission_type);

CREATE INDEX IF NOT EXISTS idx_mission_progress_user_id 
  ON public.mission_progress(user_id);

CREATE INDEX IF NOT EXISTS idx_mission_progress_mission_id 
  ON public.mission_progress(mission_id);

CREATE INDEX IF NOT EXISTS idx_mission_progress_is_completed 
  ON public.mission_progress(is_completed);

-- Enable RLS
ALTER TABLE public.mission_definitions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.mission_progress ENABLE ROW LEVEL SECURITY;

-- =============================================
-- RLS POLICIES - mission_definitions
-- =============================================

-- Tất cả users có thể xem nhiệm vụ active
CREATE POLICY "Anyone can view active missions"
  ON public.mission_definitions
  FOR SELECT
  USING (is_active = true);

-- =============================================
-- RLS POLICIES - mission_progress
-- =============================================

-- Users có thể xem progress của mình
CREATE POLICY "Users can view own mission progress"
  ON public.mission_progress
  FOR SELECT
  USING (auth.uid() = user_id);

-- Users có thể tạo progress cho mình
CREATE POLICY "Users can create own mission progress"
  ON public.mission_progress
  FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- Users có thể update progress của mình
CREATE POLICY "Users can update own mission progress"
  ON public.mission_progress
  FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- =============================================
-- FUNCTIONS & TRIGGERS
-- =============================================

-- Trigger to update updated_at
CREATE OR REPLACE FUNCTION public.update_mission_tables_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

CREATE TRIGGER trigger_update_mission_definitions_updated_at
  BEFORE UPDATE ON public.mission_definitions
  FOR EACH ROW
  EXECUTE FUNCTION public.update_mission_tables_updated_at();

CREATE TRIGGER trigger_update_mission_progress_updated_at
  BEFORE UPDATE ON public.mission_progress
  FOR EACH ROW
  EXECUTE FUNCTION public.update_mission_tables_updated_at();

-- =============================================
-- SEED DATA - Các nhiệm vụ mẫu
-- =============================================

INSERT INTO public.mission_definitions (name, description, reward_amount, reward_type, target_value, mission_type)
VALUES
  ('Đăng nhập hàng ngày', 'Đăng nhập vào Fun Profile mỗi ngày', 5, 'FUN', 1, 'daily'),
  ('Đăng 3 bài viết', 'Tạo 3 bài viết mới trong ngày', 20, 'FUN', 3, 'daily'),
  ('Nhận 10 reactions', 'Nhận 10 reactions từ cộng đồng', 15, 'FUN', 10, 'daily'),
  ('Bình luận 5 lần', 'Để lại 5 bình luận trong ngày', 10, 'FUN', 5, 'daily'),
  ('Hoàn thành profile', 'Điền đầy đủ thông tin profile', 100, 'FUN', 1, 'one_time'),
  ('Mời 5 bạn bè', 'Mời 5 bạn bè tham gia Fun Profile', 200, 'FUN', 5, 'one_time'),
  ('Đạt 100 followers', 'Có 100 người theo dõi', 500, 'FUN', 100, 'one_time'),
  ('Đăng 20 bài trong tuần', 'Tạo 20 bài viết trong tuần', 100, 'FUN', 20, 'weekly'),
  ('Nhận 100 reactions trong tuần', 'Nhận 100 reactions trong tuần', 80, 'FUN', 100, 'weekly')
ON CONFLICT DO NOTHING;

-- =============================================
-- DONE!
-- =============================================

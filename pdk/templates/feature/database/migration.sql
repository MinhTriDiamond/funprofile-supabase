-- ================================================
-- Feature: Example Feature
-- Author: [Tên bé]
-- Date: [Ngày tạo]
-- Description: [Mô tả ngắn về feature]
-- ================================================

-- HƯỚNG DẪN:
-- 1. Thay {feature} bằng tên feature của bạn (snake_case)
-- 2. Thêm columns cần thiết
-- 3. Cập nhật RLS policies phù hợp
-- 4. Thêm indexes cho columns query thường xuyên

-- ================================================
-- TẠO TABLE
-- ================================================

CREATE TABLE public.example_items (
  -- Primary key
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  
  -- User reference (BẮT BUỘC cho RLS)
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  
  -- Feature columns (thêm columns của bạn ở đây)
  title TEXT NOT NULL,
  description TEXT,
  status TEXT DEFAULT 'active' CHECK (status IN ('active', 'inactive', 'pending')),
  metadata JSONB DEFAULT '{}',
  
  -- Timestamps
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- ================================================
-- ENABLE RLS (BẮT BUỘC!)
-- ================================================

ALTER TABLE public.example_items ENABLE ROW LEVEL SECURITY;

-- ================================================
-- RLS POLICIES
-- ================================================

-- SELECT: Users can view their own items
CREATE POLICY "Users can view own example items"
  ON public.example_items
  FOR SELECT
  USING (auth.uid() = user_id);

-- INSERT: Users can create their own items
CREATE POLICY "Users can create own example items"
  ON public.example_items
  FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- UPDATE: Users can update their own items
CREATE POLICY "Users can update own example items"
  ON public.example_items
  FOR UPDATE
  USING (auth.uid() = user_id);

-- DELETE: Users can delete their own items
CREATE POLICY "Users can delete own example items"
  ON public.example_items
  FOR DELETE
  USING (auth.uid() = user_id);

-- ================================================
-- INDEXES (Tối ưu performance)
-- ================================================

-- Index for user lookups (BẮT BUỘC)
CREATE INDEX idx_example_items_user_id 
  ON public.example_items(user_id);

-- Index for status filtering (nếu cần)
CREATE INDEX idx_example_items_status 
  ON public.example_items(status);

-- Index for sorting by date (nếu cần)
CREATE INDEX idx_example_items_created_at 
  ON public.example_items(created_at DESC);

-- ================================================
-- TRIGGER: Auto-update updated_at
-- ================================================

-- Tạo function nếu chưa có (Fun Profile đã có sẵn)
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Tạo trigger
CREATE TRIGGER update_example_items_updated_at
  BEFORE UPDATE ON public.example_items
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- ================================================
-- COMMENTS (Optional nhưng khuyến khích)
-- ================================================

COMMENT ON TABLE public.example_items IS 'Bảng lưu trữ items của Example Feature';
COMMENT ON COLUMN public.example_items.user_id IS 'ID của user sở hữu item';
COMMENT ON COLUMN public.example_items.status IS 'Trạng thái: active, inactive, pending';

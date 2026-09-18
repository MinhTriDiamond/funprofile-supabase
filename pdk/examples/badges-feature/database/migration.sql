-- ================================================
-- Feature: Badges System
-- Author: Angel Fun Profile
-- Date: 2025-01-29
-- Description: Hệ thống huy hiệu thành tích
-- ================================================

-- ================================================
-- TABLE 1: Định nghĩa các loại huy hiệu
-- ================================================

CREATE TABLE public.badge_definitions (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT NOT NULL,
  icon TEXT NOT NULL,
  category TEXT NOT NULL,
  requirement TEXT,
  requirement_value INTEGER DEFAULT 0,
  is_active BOOLEAN DEFAULT true,
  sort_order INTEGER DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- RLS cho badge_definitions (public read)
ALTER TABLE public.badge_definitions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can view badge definitions"
  ON public.badge_definitions
  FOR SELECT
  USING (is_active = true);

-- Insert default badges
INSERT INTO public.badge_definitions (id, name, description, icon, category, requirement, requirement_value, sort_order) VALUES
  ('first-post', 'Người tiên phong', 'Đăng bài viết đầu tiên', '🎉', 'posts', 'posts', 1, 1),
  ('storyteller', 'Người kể chuyện', 'Đăng 10 bài viết', '📖', 'posts', 'posts', 10, 2),
  ('author', 'Tác giả', 'Đăng 50 bài viết', '✍️', 'posts', 'posts', 50, 3),
  ('social-butterfly', 'Bướm xã hội', 'Kết bạn với 10 người', '🦋', 'social', 'friends', 10, 4),
  ('networker', 'Nhà kết nối', 'Kết bạn với 50 người', '🔗', 'social', 'friends', 50, 5),
  ('popular', 'Nổi tiếng', 'Nhận 100 reactions', '⭐', 'engagement', 'reactions', 100, 6),
  ('superstar', 'Siêu sao', 'Nhận 1000 reactions', '🌟', 'engagement', 'reactions', 1000, 7),
  ('philanthropist', 'Nhà từ thiện', 'Tặng 1000 CAMLY', '💝', 'rewards', 'camly_given', 1000, 8),
  ('whale', 'Cá voi', 'Sở hữu 10000 CAMLY', '🐋', 'rewards', 'camly_balance', 10000, 9),
  ('early-bird', 'Chim sớm', 'Đăng nhập lúc 5h sáng', '🐦', 'special', 'special', 0, 10),
  ('night-owl', 'Cú đêm', 'Đăng nhập lúc 2h sáng', '🦉', 'special', 'special', 0, 11);

-- ================================================
-- TABLE 2: Huy hiệu đã được trao
-- ================================================

CREATE TABLE public.badge_awards (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  badge_id TEXT NOT NULL REFERENCES public.badge_definitions(id),
  awarded_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  
  -- Prevent duplicate awards
  UNIQUE(user_id, badge_id)
);

-- RLS cho badge_awards
ALTER TABLE public.badge_awards ENABLE ROW LEVEL SECURITY;

-- Users can view their own badges
CREATE POLICY "Users can view own badges"
  ON public.badge_awards
  FOR SELECT
  USING (auth.uid() = user_id);

-- Users can view other users' badges (public achievement display)
CREATE POLICY "Anyone can view user badges"
  ON public.badge_awards
  FOR SELECT
  USING (true);

-- Only system can award badges (via edge function or trigger)
-- No INSERT policy for regular users

-- ================================================
-- INDEXES
-- ================================================

CREATE INDEX idx_badge_awards_user_id ON public.badge_awards(user_id);
CREATE INDEX idx_badge_awards_badge_id ON public.badge_awards(badge_id);
CREATE INDEX idx_badge_definitions_category ON public.badge_definitions(category);

-- ================================================
-- FUNCTION: Award a badge to user
-- ================================================

CREATE OR REPLACE FUNCTION public.award_badge(
  p_user_id UUID,
  p_badge_id TEXT
)
RETURNS BOOLEAN AS $$
DECLARE
  v_already_exists BOOLEAN;
BEGIN
  -- Check if already awarded
  SELECT EXISTS (
    SELECT 1 FROM public.badge_awards
    WHERE user_id = p_user_id AND badge_id = p_badge_id
  ) INTO v_already_exists;
  
  IF v_already_exists THEN
    RETURN FALSE;
  END IF;
  
  -- Award the badge
  INSERT INTO public.badge_awards (user_id, badge_id)
  VALUES (p_user_id, p_badge_id);
  
  -- TODO: Create notification for user
  
  RETURN TRUE;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ================================================
-- TRIGGER: Auto-award badges based on activity
-- ================================================

-- Example: Award "first-post" badge when user creates first post
CREATE OR REPLACE FUNCTION public.check_post_badges()
RETURNS TRIGGER AS $$
DECLARE
  v_post_count INTEGER;
BEGIN
  -- Count user's posts
  SELECT COUNT(*) INTO v_post_count
  FROM public.posts
  WHERE user_id = NEW.user_id;
  
  -- Award badges based on count
  IF v_post_count >= 1 THEN
    PERFORM public.award_badge(NEW.user_id, 'first-post');
  END IF;
  
  IF v_post_count >= 10 THEN
    PERFORM public.award_badge(NEW.user_id, 'storyteller');
  END IF;
  
  IF v_post_count >= 50 THEN
    PERFORM public.award_badge(NEW.user_id, 'author');
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Attach trigger to posts table
CREATE TRIGGER trigger_check_post_badges
  AFTER INSERT ON public.posts
  FOR EACH ROW
  EXECUTE FUNCTION public.check_post_badges();

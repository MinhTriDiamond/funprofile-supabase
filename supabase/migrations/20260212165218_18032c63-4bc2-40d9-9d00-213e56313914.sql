
-- =============================================
-- REELS FEATURE: Complete Schema
-- =============================================

-- 1. Main reels table
CREATE TABLE public.reels (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  video_url TEXT NOT NULL,
  thumbnail_url TEXT,
  caption TEXT,
  audio_name TEXT,
  audio_artist TEXT,
  duration_seconds NUMERIC,
  visibility TEXT NOT NULL DEFAULT 'public' CHECK (visibility IN ('public', 'friends', 'private')),
  view_count INTEGER NOT NULL DEFAULT 0,
  like_count INTEGER NOT NULL DEFAULT 0,
  comment_count INTEGER NOT NULL DEFAULT 0,
  share_count INTEGER NOT NULL DEFAULT 0,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 2. Reel likes
CREATE TABLE public.reel_likes (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  reel_id UUID NOT NULL REFERENCES public.reels(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(reel_id, user_id)
);

-- 3. Reel comments
CREATE TABLE public.reel_comments (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  reel_id UUID NOT NULL REFERENCES public.reels(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  parent_comment_id UUID REFERENCES public.reel_comments(id) ON DELETE CASCADE,
  content TEXT NOT NULL,
  like_count INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 4. Reel comment likes
CREATE TABLE public.reel_comment_likes (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  comment_id UUID NOT NULL REFERENCES public.reel_comments(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(comment_id, user_id)
);

-- 5. Reel shares
CREATE TABLE public.reel_shares (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  reel_id UUID NOT NULL REFERENCES public.reels(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  shared_to TEXT NOT NULL DEFAULT 'feed',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 6. Reel views
CREATE TABLE public.reel_views (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  reel_id UUID NOT NULL REFERENCES public.reels(id) ON DELETE CASCADE,
  user_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  watch_duration_seconds NUMERIC DEFAULT 0,
  completed BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 7. User reel preferences (for AI recommendations)
CREATE TABLE public.user_reel_preferences (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE UNIQUE,
  liked_categories TEXT[] DEFAULT '{}',
  watched_creators UUID[] DEFAULT '{}',
  engagement_score NUMERIC DEFAULT 0,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 8. Reel bookmarks
CREATE TABLE public.reel_bookmarks (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  reel_id UUID NOT NULL REFERENCES public.reels(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(reel_id, user_id)
);

-- =============================================
-- INDEXES
-- =============================================
CREATE INDEX idx_reels_user_id ON public.reels(user_id);
CREATE INDEX idx_reels_created_at ON public.reels(created_at DESC);
CREATE INDEX idx_reels_visibility ON public.reels(visibility);
CREATE INDEX idx_reel_likes_reel_id ON public.reel_likes(reel_id);
CREATE INDEX idx_reel_likes_user_id ON public.reel_likes(user_id);
CREATE INDEX idx_reel_comments_reel_id ON public.reel_comments(reel_id);
CREATE INDEX idx_reel_views_reel_id ON public.reel_views(reel_id);
CREATE INDEX idx_reel_shares_reel_id ON public.reel_shares(reel_id);
CREATE INDEX idx_reel_bookmarks_user_id ON public.reel_bookmarks(user_id);
CREATE INDEX idx_reel_bookmarks_reel_id ON public.reel_bookmarks(reel_id);

-- =============================================
-- UPDATE TRIGGER
-- =============================================
CREATE TRIGGER update_reels_updated_at
  BEFORE UPDATE ON public.reels
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- =============================================
-- RLS POLICIES
-- =============================================

-- Reels
ALTER TABLE public.reels ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Public reels are viewable by everyone"
  ON public.reels FOR SELECT
  USING (visibility = 'public' AND is_active = true);

CREATE POLICY "Users can view their own reels"
  ON public.reels FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can create their own reels"
  ON public.reels FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own reels"
  ON public.reels FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own reels"
  ON public.reels FOR DELETE
  USING (auth.uid() = user_id);

-- Reel Likes
ALTER TABLE public.reel_likes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Reel likes are viewable by everyone"
  ON public.reel_likes FOR SELECT USING (true);

CREATE POLICY "Users can like reels"
  ON public.reel_likes FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can unlike reels"
  ON public.reel_likes FOR DELETE
  USING (auth.uid() = user_id);

-- Reel Comments
ALTER TABLE public.reel_comments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Reel comments are viewable by everyone"
  ON public.reel_comments FOR SELECT USING (true);

CREATE POLICY "Users can comment on reels"
  ON public.reel_comments FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete own comments"
  ON public.reel_comments FOR DELETE
  USING (auth.uid() = user_id);

-- Reel Comment Likes
ALTER TABLE public.reel_comment_likes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Comment likes are viewable by everyone"
  ON public.reel_comment_likes FOR SELECT USING (true);

CREATE POLICY "Users can like comments"
  ON public.reel_comment_likes FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can unlike comments"
  ON public.reel_comment_likes FOR DELETE
  USING (auth.uid() = user_id);

-- Reel Shares
ALTER TABLE public.reel_shares ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Shares are viewable by everyone"
  ON public.reel_shares FOR SELECT USING (true);

CREATE POLICY "Users can share reels"
  ON public.reel_shares FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- Reel Views
ALTER TABLE public.reel_views ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Views are viewable by everyone"
  ON public.reel_views FOR SELECT USING (true);

CREATE POLICY "Anyone can record views"
  ON public.reel_views FOR INSERT
  WITH CHECK (true);

-- User Reel Preferences
ALTER TABLE public.user_reel_preferences ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own preferences"
  ON public.user_reel_preferences FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can manage own preferences"
  ON public.user_reel_preferences FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own preferences"
  ON public.user_reel_preferences FOR UPDATE
  USING (auth.uid() = user_id);

-- Reel Bookmarks
ALTER TABLE public.reel_bookmarks ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own bookmarks"
  ON public.reel_bookmarks FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can bookmark reels"
  ON public.reel_bookmarks FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can remove bookmarks"
  ON public.reel_bookmarks FOR DELETE
  USING (auth.uid() = user_id);

-- =============================================
-- REALTIME
-- =============================================
ALTER PUBLICATION supabase_realtime ADD TABLE public.reels;
ALTER PUBLICATION supabase_realtime ADD TABLE public.reel_likes;
ALTER PUBLICATION supabase_realtime ADD TABLE public.reel_comments;
ALTER PUBLICATION supabase_realtime ADD TABLE public.reel_bookmarks;

-- Phase 2: Daily Reward Limits + Livestream Rewards
-- Cutoff date: 2025-01-15 (data trước đó không giới hạn)

-- 1. Tạo bảng livestreams
CREATE TABLE public.livestreams (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES profiles(id) ON DELETE CASCADE NOT NULL,
  stream_id TEXT,
  title TEXT,
  started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  ended_at TIMESTAMPTZ,
  duration_minutes INTEGER DEFAULT 0,
  is_eligible BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Indexes (dùng started_at thay vì DATE function)
CREATE INDEX idx_livestreams_user_started ON livestreams(user_id, started_at);
CREATE INDEX idx_livestreams_user_id ON livestreams(user_id);

-- RLS
ALTER TABLE public.livestreams ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own livestreams" ON livestreams
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can create own livestreams" ON livestreams
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own livestreams" ON livestreams
  FOR UPDATE USING (auth.uid() = user_id);

-- 2. Function để end livestream và tính eligibility
CREATE OR REPLACE FUNCTION public.end_livestream(p_livestream_id UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_duration INTEGER;
BEGIN
  UPDATE livestreams
  SET 
    ended_at = now(),
    duration_minutes = EXTRACT(EPOCH FROM (now() - started_at)) / 60,
    is_eligible = (EXTRACT(EPOCH FROM (now() - started_at)) / 60) BETWEEN 10 AND 120
  WHERE id = p_livestream_id AND user_id = auth.uid()
  RETURNING duration_minutes INTO v_duration;
  
  RETURN v_duration BETWEEN 10 AND 120;
END;
$$;

-- 3. Function get_user_rewards_v2 với daily limits
CREATE OR REPLACE FUNCTION public.get_user_rewards_v2(limit_count integer DEFAULT 10)
RETURNS TABLE(
  id uuid, 
  username text, 
  avatar_url text, 
  posts_count bigint, 
  comments_count bigint, 
  reactions_count bigint, 
  friends_count bigint, 
  shares_count bigint, 
  reactions_on_posts bigint,
  livestreams_count bigint,
  today_reward bigint,
  total_reward bigint
)
LANGUAGE plpgsql
STABLE
SET search_path TO 'public'
AS $function$
DECLARE
  cutoff_date CONSTANT TIMESTAMPTZ := '2025-01-15 00:00:00+00';
BEGIN
  RETURN QUERY
  WITH 
  -- Stats từ data CŨ (trước cutoff) - KHÔNG giới hạn
  old_stats AS (
    SELECT 
      p.id AS user_id,
      COALESCE((SELECT COUNT(*) FROM posts WHERE user_id = p.id AND created_at < cutoff_date), 0) AS old_posts,
      COALESCE((
        SELECT COUNT(*) FROM comments c
        INNER JOIN posts po ON c.post_id = po.id
        WHERE po.user_id = p.id AND c.created_at < cutoff_date
      ), 0) AS old_comments,
      COALESCE((
        SELECT COUNT(*) FROM reactions r
        INNER JOIN posts po ON r.post_id = po.id
        WHERE po.user_id = p.id AND r.created_at < cutoff_date
      ), 0) AS old_reactions,
      COALESCE((
        SELECT COUNT(*) FROM shared_posts sp
        INNER JOIN posts po ON sp.original_post_id = po.id
        WHERE po.user_id = p.id AND sp.created_at < cutoff_date
      ), 0) AS old_shares,
      COALESCE((
        SELECT COUNT(*) FROM friendships 
        WHERE (user_id = p.id OR friend_id = p.id) 
          AND status = 'accepted' 
          AND created_at < cutoff_date
      ), 0) AS old_friends
    FROM profiles p
  ),
  
  -- Stats từ data MỚI (từ cutoff) - tính theo NGÀY với giới hạn
  new_daily_posts AS (
    SELECT 
      po.user_id,
      (created_at AT TIME ZONE 'UTC')::DATE AS reward_date,
      LEAST(COUNT(*), 10) AS capped_count
    FROM posts po
    WHERE created_at >= cutoff_date
    GROUP BY po.user_id, (created_at AT TIME ZONE 'UTC')::DATE
  ),
  new_daily_reactions AS (
    SELECT 
      po.user_id,
      (r.created_at AT TIME ZONE 'UTC')::DATE AS reward_date,
      LEAST(COUNT(*), 50) AS capped_count
    FROM reactions r
    INNER JOIN posts po ON r.post_id = po.id
    WHERE r.created_at >= cutoff_date
    GROUP BY po.user_id, (r.created_at AT TIME ZONE 'UTC')::DATE
  ),
  new_daily_comments AS (
    SELECT 
      po.user_id,
      (c.created_at AT TIME ZONE 'UTC')::DATE AS reward_date,
      LEAST(COUNT(*), 50) AS capped_count
    FROM comments c
    INNER JOIN posts po ON c.post_id = po.id
    WHERE c.created_at >= cutoff_date 
      AND length(c.content) > 20
    GROUP BY po.user_id, (c.created_at AT TIME ZONE 'UTC')::DATE
  ),
  new_daily_shares AS (
    SELECT 
      po.user_id,
      (sp.created_at AT TIME ZONE 'UTC')::DATE AS reward_date,
      LEAST(COUNT(*), 5) AS capped_count
    FROM shared_posts sp
    INNER JOIN posts po ON sp.original_post_id = po.id
    WHERE sp.created_at >= cutoff_date
    GROUP BY po.user_id, (sp.created_at AT TIME ZONE 'UTC')::DATE
  ),
  new_daily_friends AS (
    SELECT 
      user_id,
      reward_date,
      LEAST(COUNT(*), 10) AS capped_count
    FROM (
      SELECT user_id, (created_at AT TIME ZONE 'UTC')::DATE AS reward_date FROM friendships 
      WHERE status = 'accepted' AND created_at >= cutoff_date
      UNION ALL
      SELECT friend_id AS user_id, (created_at AT TIME ZONE 'UTC')::DATE AS reward_date FROM friendships 
      WHERE status = 'accepted' AND created_at >= cutoff_date
    ) f
    GROUP BY user_id, reward_date
  ),
  new_daily_livestreams AS (
    SELECT 
      user_id,
      (started_at AT TIME ZONE 'UTC')::DATE AS reward_date,
      LEAST(COUNT(*), 5) AS capped_count
    FROM livestreams
    WHERE started_at >= cutoff_date AND is_eligible = true
    GROUP BY user_id, (started_at AT TIME ZONE 'UTC')::DATE
  ),
  
  -- Tổng hợp data mới theo user
  new_stats AS (
    SELECT 
      p.id AS user_id,
      COALESCE((SELECT SUM(capped_count) FROM new_daily_posts WHERE user_id = p.id), 0) AS new_posts,
      COALESCE((SELECT SUM(capped_count) FROM new_daily_reactions WHERE user_id = p.id), 0) AS new_reactions,
      COALESCE((SELECT SUM(capped_count) FROM new_daily_comments WHERE user_id = p.id), 0) AS new_comments,
      COALESCE((SELECT SUM(capped_count) FROM new_daily_shares WHERE user_id = p.id), 0) AS new_shares,
      COALESCE((SELECT SUM(capped_count) FROM new_daily_friends WHERE user_id = p.id), 0) AS new_friends,
      COALESCE((SELECT SUM(capped_count) FROM new_daily_livestreams WHERE user_id = p.id), 0) AS new_livestreams
    FROM profiles p
  ),
  
  -- Thưởng hôm nay
  today_stats AS (
    SELECT 
      p.id AS user_id,
      COALESCE((SELECT capped_count FROM new_daily_posts WHERE user_id = p.id AND reward_date = CURRENT_DATE), 0) AS today_posts,
      COALESCE((SELECT capped_count FROM new_daily_reactions WHERE user_id = p.id AND reward_date = CURRENT_DATE), 0) AS today_reactions,
      COALESCE((SELECT capped_count FROM new_daily_comments WHERE user_id = p.id AND reward_date = CURRENT_DATE), 0) AS today_comments,
      COALESCE((SELECT capped_count FROM new_daily_shares WHERE user_id = p.id AND reward_date = CURRENT_DATE), 0) AS today_shares,
      COALESCE((SELECT capped_count FROM new_daily_friends WHERE user_id = p.id AND reward_date = CURRENT_DATE), 0) AS today_friends,
      COALESCE((SELECT capped_count FROM new_daily_livestreams WHERE user_id = p.id AND reward_date = CURRENT_DATE), 0) AS today_livestreams
    FROM profiles p
  ),
  
  -- Tổng counts (raw, không cap - để hiển thị)
  total_counts AS (
    SELECT 
      p.id AS user_id,
      COALESCE((SELECT COUNT(*) FROM posts WHERE user_id = p.id), 0) AS total_posts,
      COALESCE((
        SELECT COUNT(*) FROM comments c
        INNER JOIN posts po ON c.post_id = po.id
        WHERE po.user_id = p.id
      ), 0) AS total_comments,
      COALESCE((SELECT COUNT(*) FROM reactions WHERE user_id = p.id), 0) AS total_reactions_made,
      COALESCE((
        SELECT COUNT(*) FROM friendships 
        WHERE (user_id = p.id OR friend_id = p.id) AND status = 'accepted'
      ), 0) AS total_friends,
      COALESCE((
        SELECT COUNT(*) FROM shared_posts sp
        INNER JOIN posts po ON sp.original_post_id = po.id
        WHERE po.user_id = p.id
      ), 0) AS total_shares,
      COALESCE((
        SELECT COUNT(*) FROM reactions r
        INNER JOIN posts po ON r.post_id = po.id
        WHERE po.user_id = p.id
      ), 0) AS total_reactions_on_posts,
      COALESCE((SELECT COUNT(*) FROM livestreams WHERE user_id = p.id AND is_eligible = true), 0) AS total_livestreams
    FROM profiles p
  )
  
  SELECT 
    p.id,
    p.username,
    p.avatar_url,
    tc.total_posts AS posts_count,
    tc.total_comments AS comments_count,
    tc.total_reactions_made AS reactions_count,
    tc.total_friends AS friends_count,
    tc.total_shares AS shares_count,
    tc.total_reactions_on_posts AS reactions_on_posts,
    tc.total_livestreams AS livestreams_count,
    -- Today's reward
    (
      (ts.today_posts * 10000) +
      (ts.today_reactions * 1000) +
      (ts.today_comments * 2000) +
      (ts.today_shares * 10000) +
      (ts.today_friends * 10000) +
      (ts.today_livestreams * 20000)
    )::BIGINT AS today_reward,
    -- Total reward = bonus + old (unlimited) + new (capped daily)
    (
      50000 +
      -- Old data (không giới hạn)
      (os.old_posts * 10000) +
      (os.old_reactions * 1000) +
      (os.old_comments * 2000) +
      (os.old_shares * 10000) +
      (os.old_friends * 10000) +
      -- New data (đã cap theo ngày)
      (ns.new_posts * 10000) +
      (ns.new_reactions * 1000) +
      (ns.new_comments * 2000) +
      (ns.new_shares * 10000) +
      (ns.new_friends * 10000) +
      (ns.new_livestreams * 20000)
    )::BIGINT AS total_reward
  FROM profiles p
  LEFT JOIN old_stats os ON os.user_id = p.id
  LEFT JOIN new_stats ns ON ns.user_id = p.id
  LEFT JOIN today_stats ts ON ts.user_id = p.id
  LEFT JOIN total_counts tc ON tc.user_id = p.id
  ORDER BY total_reward DESC
  LIMIT limit_count;
END;
$function$;
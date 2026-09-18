
-- =====================================================
-- BƯỚC 1: Tính lại pending_reward cho tài khoản bị ban
-- Sử dụng công thức tương tự get_user_rewards_v2
-- =====================================================

WITH cutoff AS (
  SELECT '2026-01-15 00:00:00+00'::TIMESTAMPTZ AS cutoff_date
),

banned_users AS (
  SELECT id FROM profiles WHERE is_banned = true
),

-- Old stats (trước cutoff) - không giới hạn
old_stats AS (
  SELECT 
    bu.id AS user_id,
    COALESCE((SELECT COUNT(*) FROM posts WHERE user_id = bu.id AND created_at < (SELECT cutoff_date FROM cutoff) AND COALESCE(is_reward_eligible, true) = true), 0) AS old_posts,
    COALESCE((
      SELECT COUNT(*) FROM comments c
      INNER JOIN posts po ON c.post_id = po.id
      WHERE po.user_id = bu.id AND c.created_at < (SELECT cutoff_date FROM cutoff)
    ), 0) AS old_comments,
    COALESCE((
      SELECT COUNT(*) FROM reactions r
      INNER JOIN posts po ON r.post_id = po.id
      WHERE po.user_id = bu.id AND r.created_at < (SELECT cutoff_date FROM cutoff)
    ), 0) AS old_reactions,
    COALESCE((
      SELECT COUNT(*) FROM shared_posts sp
      INNER JOIN posts po ON sp.original_post_id = po.id
      WHERE po.user_id = bu.id AND sp.created_at < (SELECT cutoff_date FROM cutoff)
    ), 0) AS old_shares,
    COALESCE((
      SELECT COUNT(*) FROM friendships 
      WHERE (user_id = bu.id OR friend_id = bu.id) 
        AND status = 'accepted' 
        AND created_at < (SELECT cutoff_date FROM cutoff)
    ), 0) AS old_friends
  FROM banned_users bu
),

-- New daily stats (sau cutoff) - có giới hạn per day
new_daily_posts AS (
  SELECT po.user_id, (created_at AT TIME ZONE 'UTC')::DATE AS reward_date, LEAST(COUNT(*), 10) AS capped_count
  FROM posts po
  INNER JOIN banned_users bu ON po.user_id = bu.id
  WHERE created_at >= (SELECT cutoff_date FROM cutoff) AND COALESCE(is_reward_eligible, true) = true
  GROUP BY po.user_id, (created_at AT TIME ZONE 'UTC')::DATE
),
new_daily_reactions AS (
  SELECT po.user_id, (r.created_at AT TIME ZONE 'UTC')::DATE AS reward_date, LEAST(COUNT(*), 50) AS capped_count
  FROM reactions r
  INNER JOIN posts po ON r.post_id = po.id
  INNER JOIN banned_users bu ON po.user_id = bu.id
  WHERE r.created_at >= (SELECT cutoff_date FROM cutoff)
  GROUP BY po.user_id, (r.created_at AT TIME ZONE 'UTC')::DATE
),
new_daily_comments AS (
  SELECT po.user_id, (c.created_at AT TIME ZONE 'UTC')::DATE AS reward_date, LEAST(COUNT(*), 50) AS capped_count
  FROM comments c
  INNER JOIN posts po ON c.post_id = po.id
  INNER JOIN banned_users bu ON po.user_id = bu.id
  WHERE c.created_at >= (SELECT cutoff_date FROM cutoff) AND length(c.content) > 20
  GROUP BY po.user_id, (c.created_at AT TIME ZONE 'UTC')::DATE
),
new_daily_shares AS (
  SELECT po.user_id, (sp.created_at AT TIME ZONE 'UTC')::DATE AS reward_date, LEAST(COUNT(*), 10) AS capped_count
  FROM shared_posts sp
  INNER JOIN posts po ON sp.original_post_id = po.id
  INNER JOIN banned_users bu ON po.user_id = bu.id
  WHERE sp.created_at >= (SELECT cutoff_date FROM cutoff)
  GROUP BY po.user_id, (sp.created_at AT TIME ZONE 'UTC')::DATE
),
new_daily_friends AS (
  SELECT user_id, reward_date, LEAST(COUNT(*), 10) AS capped_count
  FROM (
    SELECT f.user_id, (f.created_at AT TIME ZONE 'UTC')::DATE AS reward_date 
    FROM friendships f INNER JOIN banned_users bu ON f.user_id = bu.id
    WHERE f.status = 'accepted' AND f.created_at >= (SELECT cutoff_date FROM cutoff)
    UNION ALL
    SELECT f.friend_id AS user_id, (f.created_at AT TIME ZONE 'UTC')::DATE AS reward_date 
    FROM friendships f INNER JOIN banned_users bu ON f.friend_id = bu.id
    WHERE f.status = 'accepted' AND f.created_at >= (SELECT cutoff_date FROM cutoff)
  ) sub
  GROUP BY user_id, reward_date
),
new_daily_livestreams AS (
  SELECT l.user_id, (l.started_at AT TIME ZONE 'UTC')::DATE AS reward_date, LEAST(COUNT(*), 5) AS capped_count
  FROM livestreams l
  INNER JOIN banned_users bu ON l.user_id = bu.id
  WHERE l.started_at >= (SELECT cutoff_date FROM cutoff) AND l.is_eligible = true
  GROUP BY l.user_id, (l.started_at AT TIME ZONE 'UTC')::DATE
),

new_stats AS (
  SELECT 
    bu.id AS user_id,
    COALESCE((SELECT SUM(capped_count) FROM new_daily_posts WHERE user_id = bu.id), 0) AS new_posts,
    COALESCE((SELECT SUM(capped_count) FROM new_daily_reactions WHERE user_id = bu.id), 0) AS new_reactions,
    COALESCE((SELECT SUM(capped_count) FROM new_daily_comments WHERE user_id = bu.id), 0) AS new_comments,
    COALESCE((SELECT SUM(capped_count) FROM new_daily_shares WHERE user_id = bu.id), 0) AS new_shares,
    COALESCE((SELECT SUM(capped_count) FROM new_daily_friends WHERE user_id = bu.id), 0) AS new_friends,
    COALESCE((SELECT SUM(capped_count) FROM new_daily_livestreams WHERE user_id = bu.id), 0) AS new_livestreams
  FROM banned_users bu
),

-- Tính tổng đã rút
claimed AS (
  SELECT rc.user_id, COALESCE(SUM(rc.amount), 0) AS total_claimed
  FROM reward_claims rc
  INNER JOIN banned_users bu ON rc.user_id = bu.id
  GROUP BY rc.user_id
),

-- Tính tổng reward và pending
calculated AS (
  SELECT 
    bu.id AS user_id,
    (
      50000 +
      COALESCE(os.old_posts, 0) * 10000 +
      COALESCE(os.old_reactions, 0) * 1000 +
      COALESCE(os.old_comments, 0) * 2000 +
      COALESCE(os.old_shares, 0) * 10000 +
      COALESCE(os.old_friends, 0) * 10000 +
      COALESCE(ns.new_posts, 0) * 5000 +
      COALESCE(ns.new_reactions, 0) * 1000 +
      COALESCE(ns.new_comments, 0) * 1000 +
      COALESCE(ns.new_shares, 0) * 1000 +
      COALESCE(ns.new_friends, 0) * 10000 +
      COALESCE(ns.new_livestreams, 0) * 20000
    ) AS total_reward,
    COALESCE(cl.total_claimed, 0) AS total_claimed
  FROM banned_users bu
  LEFT JOIN old_stats os ON os.user_id = bu.id
  LEFT JOIN new_stats ns ON ns.user_id = bu.id
  LEFT JOIN claimed cl ON cl.user_id = bu.id
)

UPDATE profiles p
SET pending_reward = GREATEST(0, c.total_reward - c.total_claimed)
FROM calculated c
WHERE p.id = c.user_id;

-- =====================================================
-- BƯỚC 2: Sửa hàm batch_ban_ghost_users - bỏ reset reward
-- =====================================================

CREATE OR REPLACE FUNCTION public.batch_ban_ghost_users(user_ids uuid[], admin_id uuid)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  banned_count integer := 0;
  uid uuid;
BEGIN
  IF NOT has_role(admin_id, 'admin') THEN
    RAISE EXCEPTION 'Unauthorized: admin role required';
  END IF;

  FOREACH uid IN ARRAY user_ids LOOP
    UPDATE profiles SET
      is_banned = true,
      reward_status = 'banned',
      admin_notes = 'Tài khoản ảo - bị cấm tự động bởi admin'
    WHERE id = uid AND is_banned = false;

    IF FOUND THEN
      banned_count := banned_count + 1;
      INSERT INTO audit_logs (admin_id, target_user_id, action, reason)
      VALUES (admin_id, uid, 'batch_ban_ghost', 'Ghost account cleanup');
    END IF;
  END LOOP;

  RETURN banned_count;
END;
$function$;

-- =====================================================
-- BƯỚC 4: Ghi audit log cho việc khôi phục số liệu
-- =====================================================

INSERT INTO audit_logs (admin_id, target_user_id, action, reason, details)
SELECT 
  (SELECT user_id FROM user_roles WHERE role = 'admin' LIMIT 1),
  NULL,
  'RESTORE_BANNED_REWARDS',
  'Khôi phục số liệu CAMLY cho tài khoản bị ban phục vụ kiểm toán',
  jsonb_build_object(
    'affected_accounts', (SELECT COUNT(*) FROM profiles WHERE is_banned = true),
    'description', 'Tính lại pending_reward dựa trên lịch sử hoạt động thực tế. Tài khoản vẫn giữ trạng thái ban.',
    'timestamp', now()
  );

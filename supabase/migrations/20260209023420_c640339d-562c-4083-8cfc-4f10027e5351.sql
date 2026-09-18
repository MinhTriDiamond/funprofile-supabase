-- =====================================================
-- FRIENDSHIP NOTIFICATION TRIGGERS
-- Tự động tạo thông báo khi có thay đổi trong friendships
-- =====================================================

-- 1. Trigger khi INSERT (gửi lời mời kết bạn)
CREATE OR REPLACE FUNCTION create_friend_request_notification()
RETURNS TRIGGER AS $$
BEGIN
  -- Khi có lời mời kết bạn mới (status = pending)
  IF NEW.status = 'pending' THEN
    INSERT INTO notifications (user_id, actor_id, type)
    VALUES (NEW.friend_id, NEW.user_id, 'friend_request');
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Drop existing trigger if exists
DROP TRIGGER IF EXISTS on_friend_request ON friendships;

CREATE TRIGGER on_friend_request
  AFTER INSERT ON friendships
  FOR EACH ROW
  EXECUTE FUNCTION create_friend_request_notification();

-- 2. Trigger khi UPDATE (đồng ý kết bạn)
CREATE OR REPLACE FUNCTION create_friend_accepted_notification()
RETURNS TRIGGER AS $$
BEGIN
  -- Khi status chuyển từ pending sang accepted
  IF OLD.status = 'pending' AND NEW.status = 'accepted' THEN
    INSERT INTO notifications (user_id, actor_id, type)
    VALUES (NEW.user_id, NEW.friend_id, 'friend_accepted');
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Drop existing trigger if exists
DROP TRIGGER IF EXISTS on_friend_accepted ON friendships;

CREATE TRIGGER on_friend_accepted
  AFTER UPDATE ON friendships
  FOR EACH ROW
  EXECUTE FUNCTION create_friend_accepted_notification();

-- 3. Trigger khi DELETE (hủy kết bạn)
CREATE OR REPLACE FUNCTION create_friend_removed_notification()
RETURNS TRIGGER AS $$
BEGIN
  -- Chỉ thông báo khi hủy kết bạn đã được chấp nhận
  IF OLD.status = 'accepted' THEN
    -- Thông báo cho người bị hủy kết bạn
    INSERT INTO notifications (user_id, actor_id, type)
    VALUES (OLD.friend_id, OLD.user_id, 'friend_removed');
  END IF;
  RETURN OLD;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Drop existing trigger if exists
DROP TRIGGER IF EXISTS on_friend_removed ON friendships;

CREATE TRIGGER on_friend_removed
  AFTER DELETE ON friendships
  FOR EACH ROW
  EXECUTE FUNCTION create_friend_removed_notification();
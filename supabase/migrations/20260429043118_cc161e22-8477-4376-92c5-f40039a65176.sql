-- Wrapper function: chỉ trả về reward của chính user đang đăng nhập.
-- Trước đây frontend gọi get_user_rewards_v2(10000) → tính cho 1244 users → 
-- payload nặng + timeout → user thấy 0. Hàm này gọn nhẹ, ổn định.
CREATE OR REPLACE FUNCTION public.get_my_rewards()
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
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_user_id uuid := auth.uid();
BEGIN
  IF v_user_id IS NULL THEN
    RETURN;
  END IF;

  RETURN QUERY
  SELECT * FROM public.get_user_rewards_v2(10000) r
  WHERE r.id = v_user_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_my_rewards() TO authenticated;
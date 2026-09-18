CREATE OR REPLACE FUNCTION public.get_user_friends(target_user_id uuid)
RETURNS TABLE (
  friend_id uuid,
  friendship_id uuid
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT 
    CASE WHEN f.user_id = target_user_id THEN f.friend_id ELSE f.user_id END AS friend_id,
    f.id AS friendship_id
  FROM friendships f
  WHERE f.status = 'accepted'
    AND (f.user_id = target_user_id OR f.friend_id = target_user_id);
$$;
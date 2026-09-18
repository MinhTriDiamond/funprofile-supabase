-- Drop the existing policy that's causing the issue
DROP POLICY IF EXISTS "Users can respond to friend requests" ON public.friendships;

-- Create a new policy with proper WITH CHECK clause
-- This allows users to accept friend requests sent to them
CREATE POLICY "Users can respond to friend requests"
ON public.friendships
FOR UPDATE
USING (
  (auth.uid() = friend_id) AND (status = 'pending'::text)
)
WITH CHECK (
  (auth.uid() = friend_id) AND (status IN ('pending'::text, 'accepted'::text))
);
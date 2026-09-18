-- Drop old constraint and add new one with all valid notification types
ALTER TABLE public.notifications DROP CONSTRAINT IF EXISTS notifications_type_check;

ALTER TABLE public.notifications ADD CONSTRAINT notifications_type_check 
CHECK (type IN (
  -- Reaction types
  'like', 'love', 'care', 'wow', 'haha', 'pray', 'sad', 'angry',
  -- Comment/post types
  'comment', 'comment_like', 'share',
  -- Friend types
  'friend_request', 'friend_accept',
  -- Admin/reward types
  'reward_approved', 'reward_rejected', 'account_banned'
));
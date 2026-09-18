
-- Add 'donation' and 'claim_reward' and 'friend_accepted' to notifications type check constraint
ALTER TABLE public.notifications DROP CONSTRAINT IF EXISTS notifications_type_check;

ALTER TABLE public.notifications ADD CONSTRAINT notifications_type_check 
CHECK (type = ANY (ARRAY[
  'like', 'love', 'care', 'wow', 'haha', 'pray', 'sad', 'angry',
  'comment', 'comment_like', 'share',
  'friend_request', 'friend_accept', 'friend_accepted', 'friend_removed',
  'reward_approved', 'reward_rejected',
  'account_banned',
  'donation',
  'claim_reward'
]));

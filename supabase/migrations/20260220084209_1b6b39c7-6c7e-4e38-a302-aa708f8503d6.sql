-- Add admin fraud notification types to constraint
ALTER TABLE public.notifications DROP CONSTRAINT IF EXISTS notifications_type_check;

ALTER TABLE public.notifications ADD CONSTRAINT notifications_type_check 
CHECK (type = ANY (ARRAY[
  'like', 'love', 'care', 'wow', 'haha', 'pray', 'sad', 'angry',
  'comment', 'comment_like', 'share',
  'friend_request', 'friend_accept', 'friend_accepted', 'friend_removed',
  'reward_approved', 'reward_rejected',
  'account_banned',
  'donation',
  'claim_reward',
  'admin_shared_device',
  'admin_email_farm',
  'admin_blacklisted_ip',
  'admin_fraud_daily'
]));
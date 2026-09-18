
-- Disable the friend_removed trigger temporarily
ALTER TABLE friendships DISABLE TRIGGER on_friend_removed;

-- Delete friendships for wallet_ users
DELETE FROM friendships WHERE user_id IN (SELECT id FROM profiles WHERE username LIKE 'wallet_%') OR friend_id IN (SELECT id FROM profiles WHERE username LIKE 'wallet_%');

-- Delete cross_platform_tokens for wallet_ users
DELETE FROM cross_platform_tokens WHERE user_id IN (SELECT id FROM profiles WHERE username LIKE 'wallet_%');

-- Delete blacklisted_wallets for wallet_ users
DELETE FROM blacklisted_wallets WHERE user_id IN (SELECT id FROM profiles WHERE username LIKE 'wallet_%');

-- Delete pplp_fraud_signals for wallet_ users
DELETE FROM pplp_fraud_signals WHERE actor_id IN (SELECT id FROM profiles WHERE username LIKE 'wallet_%');

-- Delete conversation_participants for wallet_ users
DELETE FROM conversation_participants WHERE user_id IN (SELECT id FROM profiles WHERE username LIKE 'wallet_%');

-- Delete messages for wallet_ users
DELETE FROM messages WHERE sender_id IN (SELECT id FROM profiles WHERE username LIKE 'wallet_%');

-- Delete chat_settings for wallet_ users
DELETE FROM chat_settings WHERE user_id IN (SELECT id FROM profiles WHERE username LIKE 'wallet_%');

-- Delete platform_user_data for wallet_ users
DELETE FROM platform_user_data WHERE user_id IN (SELECT id FROM profiles WHERE username LIKE 'wallet_%');

-- Delete platform_financial_data for wallet_ users
DELETE FROM platform_financial_data WHERE user_id IN (SELECT id FROM profiles WHERE username LIKE 'wallet_%');

-- Delete financial_transactions for wallet_ users
DELETE FROM financial_transactions WHERE user_id IN (SELECT id FROM profiles WHERE username LIKE 'wallet_%');

-- Delete reel-related data
DELETE FROM reel_bookmarks WHERE user_id IN (SELECT id FROM profiles WHERE username LIKE 'wallet_%');
DELETE FROM reel_views WHERE user_id IN (SELECT id FROM profiles WHERE username LIKE 'wallet_%');

-- Delete profiles
DELETE FROM profiles WHERE username LIKE 'wallet_%';

-- Re-enable the trigger
ALTER TABLE friendships ENABLE TRIGGER on_friend_removed;

-- Create function to batch delete orphan auth users
CREATE OR REPLACE FUNCTION public.batch_delete_orphan_auth_users(p_admin_id uuid)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  deleted_count integer := 0;
  uid uuid;
BEGIN
  IF NOT has_role(p_admin_id, 'admin') THEN
    RAISE EXCEPTION 'Unauthorized: admin role required';
  END IF;

  FOR uid IN 
    SELECT au.id FROM auth.users au
    LEFT JOIN profiles p ON p.id = au.id
    WHERE p.id IS NULL
  LOOP
    DELETE FROM auth.users WHERE id = uid;
    deleted_count := deleted_count + 1;
  END LOOP;

  RETURN deleted_count;
END;
$$;

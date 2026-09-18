
-- Clean audit_logs referencing orphan users
DELETE FROM audit_logs WHERE target_user_id NOT IN (SELECT id FROM profiles) AND target_user_id IS NOT NULL;

-- Clean any remaining references
DELETE FROM pplp_user_nonces WHERE user_id NOT IN (SELECT id FROM profiles);

-- Now delete orphan auth users
DELETE FROM auth.users WHERE id NOT IN (SELECT id FROM profiles);

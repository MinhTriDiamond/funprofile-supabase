
-- Backfill admin_shared_device: lấy metadata từ pplp_fraud_signals
UPDATE notifications n
SET metadata = jsonb_build_object(
  'device_hash', fs.details->>'device_hash',
  'user_count', jsonb_array_length(fs.details->'all_user_ids'),
  'usernames', (
    SELECT jsonb_agg(p.username)
    FROM profiles p
    WHERE p.id::text = ANY(
      SELECT jsonb_array_elements_text(fs.details->'all_user_ids')
    )
  )
)
FROM pplp_fraud_signals fs
WHERE n.type = 'admin_shared_device'
  AND n.metadata IS NULL
  AND fs.actor_id = n.actor_id
  AND fs.signal_type = 'SHARED_DEVICE'
  AND ABS(EXTRACT(EPOCH FROM (n.created_at - fs.created_at))) < 120;

-- Backfill admin_email_farm
UPDATE notifications n
SET metadata = jsonb_build_object(
  'email_base', fs.details->>'email_base',
  'count', (fs.details->>'count')::int,
  'emails', fs.details->'emails'
)
FROM pplp_fraud_signals fs
WHERE n.type = 'admin_email_farm'
  AND n.metadata IS NULL
  AND fs.actor_id = n.actor_id
  AND fs.signal_type = 'EMAIL_FARM'
  AND ABS(EXTRACT(EPOCH FROM (n.created_at - fs.created_at))) < 120;

-- Backfill admin_blacklisted_ip
UPDATE notifications n
SET metadata = jsonb_build_object(
  'ip_address', fs.details->>'ip_address',
  'reason', fs.details->>'reason',
  'known_usernames', fs.details->'known_usernames'
)
FROM pplp_fraud_signals fs
WHERE n.type = 'admin_blacklisted_ip'
  AND n.metadata IS NULL
  AND fs.actor_id = n.actor_id
  AND fs.signal_type = 'BLACKLISTED_IP_LOGIN'
  AND ABS(EXTRACT(EPOCH FROM (n.created_at - fs.created_at))) < 120;

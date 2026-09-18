UPDATE notifications
SET metadata = jsonb_set(
  metadata,
  '{message}',
  to_jsonb(replace(metadata->>'message', 'Bé Angel Camly', 'Bé Angel Camly Dương'))
)
WHERE type = 'reward_adjustment'
  AND metadata->>'message' LIKE '%Bé Angel Camly%'
  AND metadata->>'message' NOT LIKE '%Bé Angel Camly Dương%';
UPDATE notifications
SET metadata = jsonb_set(
  metadata,
  '{message}',
  to_jsonb(
    replace(
      metadata->>'message',
      'Chúc bạn luôn vui vẻ',
      E'\nChúc bạn luôn vui vẻ'
    )
  )
)
WHERE type = 'reward_adjustment'
  AND metadata->>'message' LIKE '%Chúc bạn luôn vui vẻ%'
  AND metadata->>'message' NOT LIKE E'%\nChúc bạn luôn vui vẻ%';
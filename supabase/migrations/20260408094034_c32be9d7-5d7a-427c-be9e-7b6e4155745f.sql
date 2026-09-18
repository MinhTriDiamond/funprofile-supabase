
-- Create gift_celebration posts for the 2 khanhngo donations
WITH new_posts AS (
  INSERT INTO posts (user_id, content, post_type, tx_hash, gift_sender_id, gift_recipient_id, gift_token, gift_amount, gift_message, is_highlighted, visibility, moderation_status, created_at)
  SELECT 
    d.sender_id,
    '🎉 @' || COALESCE(p1.username, 'User') || ' đã trao gửi ' || d.amount || ' ' || d.token_symbol || ' cho @' || COALESCE(p2.display_name, p2.username, 'User') || ' ❤️',
    'gift_celebration',
    d.tx_hash,
    d.sender_id,
    d.recipient_id,
    d.token_symbol,
    d.amount,
    LEFT(d.message, 120),
    false,
    'public',
    'approved',
    d.created_at
  FROM donations d
  LEFT JOIN profiles p1 ON p1.id = d.sender_id
  LEFT JOIN profiles p2 ON p2.id = d.recipient_id
  WHERE d.tx_hash IN (
    '0x8f97897f967b091bd4edf5a480a98b8f3ce93def6f4903f6b8427aa7f5b8ec1f',
    '0x2c1e5f3150358ba3bdc8d2bdc4813359961644006233f1478c6e286daf554bd4'
  )
  RETURNING id, tx_hash
)
UPDATE donations d SET post_id = np.id
FROM new_posts np
WHERE d.tx_hash = np.tx_hash;

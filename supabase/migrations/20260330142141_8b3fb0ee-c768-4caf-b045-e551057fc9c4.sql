
-- Delete notifications linked to posts that will be deleted
DELETE FROM notifications
WHERE post_id IN (
  SELECT po.id FROM posts po
  WHERE po.post_type = 'gift_celebration'
    AND po.tx_hash IN (
      SELECT d.tx_hash FROM donations d
      JOIN profiles p ON p.id = d.recipient_id
      WHERE d.is_external = true AND d.created_at < p.created_at
    )
);

-- Delete wallet_transfers for these transactions
DELETE FROM wallet_transfers
WHERE tx_hash IN (
  SELECT d.tx_hash FROM donations d
  JOIN profiles p ON p.id = d.recipient_id
  WHERE d.is_external = true AND d.created_at < p.created_at
);

-- Delete gift_celebration posts for these transactions
DELETE FROM posts
WHERE post_type = 'gift_celebration'
  AND tx_hash IN (
    SELECT d.tx_hash FROM donations d
    JOIN profiles p ON p.id = d.recipient_id
    WHERE d.is_external = true AND d.created_at < p.created_at
  );

-- Delete the donations themselves
DELETE FROM donations
WHERE id IN (
  SELECT d.id FROM donations d
  JOIN profiles p ON p.id = d.recipient_id
  WHERE d.is_external = true AND d.created_at < p.created_at
);

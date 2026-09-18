
-- Step 1: Update donations to point to the KEPT post (earliest) before deleting duplicates
UPDATE donations d
SET post_id = keeper.id
FROM (
  SELECT DISTINCT ON (tx_hash, gift_recipient_id) id, tx_hash, gift_recipient_id
  FROM posts
  WHERE post_type = 'gift_celebration'
  ORDER BY tx_hash, gift_recipient_id, created_at ASC
) keeper
WHERE d.tx_hash = keeper.tx_hash
  AND d.post_id IS NOT NULL
  AND d.post_id != keeper.id;

-- Step 2: Delete duplicate gift_celebration posts (keep earliest per tx_hash + recipient)
DELETE FROM posts
WHERE id IN (
  SELECT id FROM (
    SELECT id, ROW_NUMBER() OVER (
      PARTITION BY tx_hash, gift_recipient_id 
      ORDER BY created_at ASC
    ) AS rn
    FROM posts
    WHERE post_type = 'gift_celebration'
  ) dupes
  WHERE rn > 1
);

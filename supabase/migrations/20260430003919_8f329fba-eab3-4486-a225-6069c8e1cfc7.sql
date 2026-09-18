-- Xác định post_id của các gift_celebration tạo từ donation ví ngoài
WITH external_gift_posts AS (
  SELECT p.id
  FROM public.posts p
  WHERE p.post_type = 'gift_celebration'
    AND p.tx_hash IS NOT NULL
    AND p.tx_hash IN (
      SELECT d.tx_hash FROM public.donations d
      WHERE d.is_external IS TRUE AND d.tx_hash IS NOT NULL
    )
)
DELETE FROM public.posts WHERE id IN (SELECT id FROM external_gift_posts);

-- Bỏ liên kết donation -> post (post đã bị xoá)
UPDATE public.donations
SET post_id = NULL
WHERE is_external IS TRUE AND post_id IS NOT NULL;
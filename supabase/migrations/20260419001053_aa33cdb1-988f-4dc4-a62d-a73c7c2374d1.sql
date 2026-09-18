
UPDATE public.donations d
SET post_id = p.id
FROM public.posts p
WHERE p.post_type = 'gift_celebration'
  AND p.tx_hash = d.tx_hash
  AND d.post_id IS NULL
  AND d.created_at >= now() - interval '7 days';

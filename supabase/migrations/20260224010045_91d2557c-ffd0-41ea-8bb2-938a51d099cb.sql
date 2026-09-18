
-- Backfill remaining posts in larger batches
DO $$
DECLARE
  rec RECORD;
  batch_count INTEGER := 0;
BEGIN
  FOR rec IN 
    SELECT id, content, user_id 
    FROM posts 
    WHERE slug IS NULL 
    ORDER BY created_at ASC
    LIMIT 15000
  LOOP
    UPDATE posts 
    SET slug = public.generate_post_slug(rec.content, rec.user_id)
    WHERE id = rec.id;
    batch_count := batch_count + 1;
  END LOOP;
  RAISE NOTICE 'Backfilled % posts', batch_count;
END;
$$;

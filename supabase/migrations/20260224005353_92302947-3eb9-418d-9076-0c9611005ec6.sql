
-- Backfill slugs for existing posts that don't have one
-- Use a DO block to process in batches
DO $$
DECLARE
  rec RECORD;
BEGIN
  FOR rec IN 
    SELECT id, content, user_id 
    FROM posts 
    WHERE slug IS NULL 
    ORDER BY created_at ASC
    LIMIT 5000
  LOOP
    UPDATE posts 
    SET slug = public.generate_post_slug(rec.content, rec.user_id)
    WHERE id = rec.id;
  END LOOP;
END;
$$;

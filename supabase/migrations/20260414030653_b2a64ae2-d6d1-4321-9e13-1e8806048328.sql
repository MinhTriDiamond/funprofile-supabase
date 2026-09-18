
-- Clean stale avatarUrl from social_links entries that have generic placeholder images
-- This strips avatarUrl from any social_link item containing 'storage.googleapis.com/gpt-engineer-file-uploads'
-- so the frontend will automatically refetch the correct avatar for each link.

UPDATE profiles
SET social_links = (
  SELECT jsonb_agg(
    CASE
      WHEN (elem ->> 'avatarUrl') LIKE '%storage.googleapis.com/gpt-engineer-file-uploads%'
      THEN elem - 'avatarUrl' - 'avatarSourceUrl'
      ELSE elem
    END
  )
  FROM jsonb_array_elements(social_links::jsonb) AS elem
)
WHERE social_links IS NOT NULL
  AND social_links::text LIKE '%storage.googleapis.com/gpt-engineer-file-uploads%';

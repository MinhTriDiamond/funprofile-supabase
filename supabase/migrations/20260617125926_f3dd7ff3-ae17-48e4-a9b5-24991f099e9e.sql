
ALTER TABLE public.posts
  ALTER COLUMN public_id SET NOT NULL,
  ALTER COLUMN share_code SET NOT NULL;

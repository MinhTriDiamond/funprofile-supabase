
ALTER TABLE public.posts
  ALTER COLUMN public_id SET DEFAULT ('post_' || nextval('public.posts_public_seq')::text),
  ALTER COLUMN share_code SET DEFAULT public.gen_post_share_code();

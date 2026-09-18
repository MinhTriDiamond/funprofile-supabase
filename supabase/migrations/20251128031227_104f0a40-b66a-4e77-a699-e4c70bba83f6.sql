-- Add foreign key from reactions.post_id to posts.id
ALTER TABLE public.reactions
ADD CONSTRAINT reactions_post_id_fkey
FOREIGN KEY (post_id)
REFERENCES public.posts(id)
ON DELETE CASCADE;
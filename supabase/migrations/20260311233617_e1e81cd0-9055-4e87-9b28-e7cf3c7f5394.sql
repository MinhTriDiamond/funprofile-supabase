
-- Table: post_attachments
CREATE TABLE IF NOT EXISTS public.post_attachments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  post_id uuid NOT NULL REFERENCES public.posts(id) ON DELETE CASCADE,
  file_url text NOT NULL,
  storage_key text,
  file_type text NOT NULL DEFAULT 'image',
  mime_type text,
  width integer,
  height integer,
  size_bytes bigint,
  sort_order integer NOT NULL DEFAULT 0,
  alt_text text,
  transform_meta jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Index for fast lookups by post
CREATE INDEX idx_post_attachments_post_id ON public.post_attachments(post_id);

-- RLS
ALTER TABLE public.post_attachments ENABLE ROW LEVEL SECURITY;

-- Anyone can read attachments (posts are public)
CREATE POLICY "Anyone can read post attachments"
  ON public.post_attachments FOR SELECT
  USING (true);

-- Only the post owner can insert attachments
CREATE POLICY "Post owner can insert attachments"
  ON public.post_attachments FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.posts
      WHERE posts.id = post_attachments.post_id
        AND posts.user_id = auth.uid()
    )
  );

-- Only the post owner can update attachments
CREATE POLICY "Post owner can update attachments"
  ON public.post_attachments FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM public.posts
      WHERE posts.id = post_attachments.post_id
        AND posts.user_id = auth.uid()
    )
  );

-- Only the post owner can delete attachments
CREATE POLICY "Post owner can delete attachments"
  ON public.post_attachments FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM public.posts
      WHERE posts.id = post_attachments.post_id
        AND posts.user_id = auth.uid()
    )
  );

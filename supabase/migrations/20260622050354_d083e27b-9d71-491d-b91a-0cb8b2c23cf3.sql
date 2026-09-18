
CREATE TABLE public.video_downloads (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  post_id uuid NOT NULL REFERENCES public.posts(id) ON DELETE CASCADE,
  video_url text NOT NULL,
  video_provider text,
  user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  user_agent text,
  downloaded_at timestamptz NOT NULL DEFAULT now()
);
GRANT INSERT ON public.video_downloads TO authenticated, anon;
GRANT ALL ON public.video_downloads TO service_role;
ALTER TABLE public.video_downloads ENABLE ROW LEVEL SECURITY;

CREATE POLICY "log own download" ON public.video_downloads
  FOR INSERT TO authenticated, anon
  WITH CHECK (user_id IS NULL OR user_id = auth.uid());

CREATE POLICY "admins read downloads" ON public.video_downloads
  FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

CREATE INDEX idx_video_downloads_post_time ON public.video_downloads(post_id, downloaded_at DESC);
CREATE INDEX idx_video_downloads_user_time ON public.video_downloads(user_id, downloaded_at DESC);

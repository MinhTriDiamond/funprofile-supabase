
-- Slug history table for 301 redirects when slugs change
CREATE TABLE public.slug_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  content_type TEXT NOT NULL,  -- 'post', 'reel', 'live'
  content_id UUID NOT NULL,
  old_slug TEXT NOT NULL,
  user_id UUID NOT NULL,
  new_slug TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_slug_history_lookup ON public.slug_history (content_type, user_id, old_slug);

ALTER TABLE public.slug_history ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Anyone can read slug history" ON public.slug_history FOR SELECT USING (true);

-- Trigger: when slug changes on posts, save old slug
CREATE OR REPLACE FUNCTION public.track_slug_change()
RETURNS TRIGGER AS $$
BEGIN
  IF OLD.slug IS NOT NULL AND OLD.slug != '' AND NEW.slug IS DISTINCT FROM OLD.slug THEN
    INSERT INTO public.slug_history (content_type, content_id, old_slug, user_id, new_slug)
    VALUES (TG_ARGV[0], NEW.id, OLD.slug, 
      COALESCE(NEW.user_id, NEW.owner_id),
      NEW.slug);
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER track_post_slug_change
  BEFORE UPDATE OF slug ON public.posts
  FOR EACH ROW EXECUTE FUNCTION public.track_slug_change('post');

CREATE TRIGGER track_reel_slug_change
  BEFORE UPDATE OF slug ON public.reels
  FOR EACH ROW EXECUTE FUNCTION public.track_slug_change('reel');

CREATE TRIGGER track_live_slug_change
  BEFORE UPDATE OF slug ON public.live_sessions
  FOR EACH ROW EXECUTE FUNCTION public.track_slug_change('live');

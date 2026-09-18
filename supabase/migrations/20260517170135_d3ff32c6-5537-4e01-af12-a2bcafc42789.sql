ALTER TABLE public.posts ADD COLUMN IF NOT EXISTS pplp_pillar text;
CREATE INDEX IF NOT EXISTS idx_posts_pplp_pillar ON public.posts(pplp_pillar) WHERE pplp_pillar IS NOT NULL;
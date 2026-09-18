
-- Create link_preview_cache table for caching scraped link previews
CREATE TABLE public.link_preview_cache (
  url TEXT PRIMARY KEY,
  data JSONB NOT NULL DEFAULT '{}',
  fetched_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.link_preview_cache ENABLE ROW LEVEL SECURITY;

-- Public read access (anyone can read cached previews)
CREATE POLICY "Anyone can read link preview cache"
  ON public.link_preview_cache
  FOR SELECT
  USING (true);

-- Index on fetched_at for cleanup queries
CREATE INDEX idx_link_preview_cache_fetched_at ON public.link_preview_cache (fetched_at);

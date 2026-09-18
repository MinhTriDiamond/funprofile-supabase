ALTER TABLE public.pplp_mint_requests
  ADD COLUMN IF NOT EXISTS source_project text NOT NULL DEFAULT 'funprofile',
  ADD COLUMN IF NOT EXISTS external_ref  text;

CREATE UNIQUE INDEX IF NOT EXISTS uq_pplp_mint_requests_source_external
  ON public.pplp_mint_requests (source_project, external_ref)
  WHERE external_ref IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_pplp_mint_requests_source_project
  ON public.pplp_mint_requests (source_project)
  WHERE source_project <> 'funprofile';
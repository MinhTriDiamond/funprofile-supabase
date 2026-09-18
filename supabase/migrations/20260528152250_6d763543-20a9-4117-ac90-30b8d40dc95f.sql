-- Idempotent re-apply of safe browser recording fallback schema, with missing GRANTs.

ALTER TABLE public.live_sessions
  ADD COLUMN IF NOT EXISTS recording_provider text DEFAULT 'agora',
  ADD COLUMN IF NOT EXISTS recording_started_at timestamptz,
  ADD COLUMN IF NOT EXISTS recording_stopped_at timestamptz,
  ADD COLUMN IF NOT EXISTS recording_error_code text,
  ADD COLUMN IF NOT EXISTS recording_error_message text,
  ADD COLUMN IF NOT EXISTS browser_recording_status text DEFAULT 'idle',
  ADD COLUMN IF NOT EXISTS browser_recording_warning text,
  ADD COLUMN IF NOT EXISTS browser_recording_chunk_count integer DEFAULT 0,
  ADD COLUMN IF NOT EXISTS browser_recording_total_bytes bigint DEFAULT 0;

ALTER TABLE public.live_sessions
  DROP CONSTRAINT IF EXISTS live_sessions_recording_provider_check;
ALTER TABLE public.live_sessions
  ADD CONSTRAINT live_sessions_recording_provider_check
  CHECK (recording_provider IS NULL OR recording_provider = ANY (ARRAY['agora','browser','none']));

ALTER TABLE public.live_sessions
  DROP CONSTRAINT IF EXISTS live_sessions_browser_recording_status_check;
ALTER TABLE public.live_sessions
  ADD CONSTRAINT live_sessions_browser_recording_status_check
  CHECK (browser_recording_status IS NULL OR browser_recording_status = ANY (ARRAY['idle','recording','uploading','uploaded','failed']));

CREATE TABLE IF NOT EXISTS public.live_recording_chunks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  live_session_id uuid NOT NULL REFERENCES public.live_sessions(id) ON DELETE CASCADE,
  post_id uuid NULL REFERENCES public.posts(id) ON DELETE SET NULL,
  provider text NOT NULL DEFAULT 'browser',
  chunk_index integer NOT NULL,
  r2_bucket text NOT NULL,
  r2_key text NOT NULL,
  mime_type text,
  size_bytes bigint,
  duration_ms integer,
  uploaded_at timestamptz DEFAULT now(),
  status text DEFAULT 'uploaded',
  error_message text,
  created_at timestamptz DEFAULT now(),
  UNIQUE (live_session_id, provider, chunk_index)
);

-- Required GRANTs (PostgREST does not grant default privileges on public schema).
GRANT SELECT, INSERT ON public.live_recording_chunks TO authenticated;
GRANT ALL ON public.live_recording_chunks TO service_role;

CREATE INDEX IF NOT EXISTS idx_live_recording_chunks_session
  ON public.live_recording_chunks(live_session_id);
CREATE INDEX IF NOT EXISTS idx_live_recording_chunks_post
  ON public.live_recording_chunks(post_id);
CREATE INDEX IF NOT EXISTS idx_live_recording_chunks_session_index
  ON public.live_recording_chunks(live_session_id, chunk_index);

ALTER TABLE public.live_recording_chunks ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Hosts can view own live recording chunks" ON public.live_recording_chunks;
CREATE POLICY "Hosts can view own live recording chunks"
  ON public.live_recording_chunks FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.live_sessions ls
      WHERE ls.id = live_recording_chunks.live_session_id
        AND (ls.host_user_id = auth.uid() OR ls.user_id = auth.uid() OR ls.owner_id = auth.uid())
    )
  );

DROP POLICY IF EXISTS "Hosts can insert own live recording chunks" ON public.live_recording_chunks;
CREATE POLICY "Hosts can insert own live recording chunks"
  ON public.live_recording_chunks FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.live_sessions ls
      WHERE ls.id = live_recording_chunks.live_session_id
        AND (ls.host_user_id = auth.uid() OR ls.user_id = auth.uid() OR ls.owner_id = auth.uid())
    )
  );

NOTIFY pgrst, 'reload schema';
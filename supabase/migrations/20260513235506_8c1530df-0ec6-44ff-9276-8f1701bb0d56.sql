
-- Bảng phiên upload video resumable
CREATE TABLE IF NOT EXISTS public.video_upload_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  r2_key TEXT NOT NULL,
  multipart_upload_id TEXT NOT NULL,
  file_hash TEXT NOT NULL,
  file_size BIGINT NOT NULL,
  chunk_size INTEGER NOT NULL,
  total_parts INTEGER NOT NULL,
  parts_done JSONB NOT NULL DEFAULT '[]'::jsonb,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','completed','aborted','failed','needs_review')),
  failed_reason TEXT,
  duration_seconds INTEGER,
  content_type TEXT NOT NULL,
  public_url TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at TIMESTAMPTZ NOT NULL DEFAULT (now() + interval '24 hours')
);

CREATE INDEX IF NOT EXISTS idx_vus_user_hash
  ON public.video_upload_sessions (user_id, file_hash, file_size, status);
CREATE INDEX IF NOT EXISTS idx_vus_status_expires
  ON public.video_upload_sessions (status, expires_at);

ALTER TABLE public.video_upload_sessions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "vus_select_own" ON public.video_upload_sessions
  FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "vus_insert_own" ON public.video_upload_sessions
  FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "vus_update_own" ON public.video_upload_sessions
  FOR UPDATE TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "vus_delete_own" ON public.video_upload_sessions
  FOR DELETE TO authenticated USING (auth.uid() = user_id);

CREATE TRIGGER trg_vus_updated_at
  BEFORE UPDATE ON public.video_upload_sessions
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- RPC append part atomically
CREATE OR REPLACE FUNCTION public.vus_append_part(
  _session_id UUID,
  _part_number INTEGER,
  _etag TEXT,
  _size BIGINT
) RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.video_upload_sessions
  SET parts_done = (
        SELECT COALESCE(jsonb_agg(elem), '[]'::jsonb)
        FROM (
          SELECT elem FROM jsonb_array_elements(parts_done) elem
          WHERE (elem->>'partNumber')::int <> _part_number
          UNION ALL
          SELECT jsonb_build_object('partNumber', _part_number, 'etag', _etag, 'size', _size)
        ) sub
      ),
      updated_at = now()
  WHERE id = _session_id AND user_id = auth.uid() AND status = 'pending';
END;
$$;

-- Cột bổ sung cho posts (nếu chưa có)
ALTER TABLE public.posts
  ADD COLUMN IF NOT EXISTS video_duration_seconds INTEGER,
  ADD COLUMN IF NOT EXISTS video_size_bytes BIGINT,
  ADD COLUMN IF NOT EXISTS video_processing_status TEXT;


-- Phase 1: Chunked Recording tables

-- 1. chunked_recordings - main recording session table
CREATE TABLE public.chunked_recordings (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  live_session_id UUID REFERENCES public.live_sessions(id) ON DELETE SET NULL,
  channel_name TEXT,
  status TEXT NOT NULL DEFAULT 'recording',
  codec TEXT,
  mime_type TEXT DEFAULT 'video/webm',
  width INT,
  height INT,
  total_chunks INT DEFAULT 0,
  last_seq_uploaded INT DEFAULT -1,
  output_object_key TEXT,
  output_url TEXT,
  error_message TEXT,
  started_at TIMESTAMPTZ DEFAULT now(),
  ended_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 2. chunked_recording_chunks - individual chunk tracking
CREATE TABLE public.chunked_recording_chunks (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  recording_id UUID NOT NULL REFERENCES public.chunked_recordings(id) ON DELETE CASCADE,
  seq INT NOT NULL,
  object_key TEXT,
  bytes INT DEFAULT 0,
  duration_ms INT DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'pending',
  uploaded_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (recording_id, seq)
);

-- 3. Indexes
CREATE INDEX idx_chunked_recordings_user_id ON public.chunked_recordings(user_id);
CREATE INDEX idx_chunked_recordings_live_session ON public.chunked_recordings(live_session_id);
CREATE INDEX idx_chunked_recordings_status ON public.chunked_recordings(status);
CREATE INDEX idx_chunked_recording_chunks_recording ON public.chunked_recording_chunks(recording_id);

-- 4. RLS for chunked_recordings
ALTER TABLE public.chunked_recordings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own recordings"
  ON public.chunked_recordings FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own recordings"
  ON public.chunked_recordings FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own recordings"
  ON public.chunked_recordings FOR UPDATE
  USING (auth.uid() = user_id);

-- 5. RLS for chunked_recording_chunks
ALTER TABLE public.chunked_recording_chunks ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own chunks"
  ON public.chunked_recording_chunks FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM public.chunked_recordings cr
    WHERE cr.id = recording_id AND cr.user_id = auth.uid()
  ));

CREATE POLICY "Users can insert own chunks"
  ON public.chunked_recording_chunks FOR INSERT
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.chunked_recordings cr
    WHERE cr.id = recording_id AND cr.user_id = auth.uid()
  ));

CREATE POLICY "Users can update own chunks"
  ON public.chunked_recording_chunks FOR UPDATE
  USING (EXISTS (
    SELECT 1 FROM public.chunked_recordings cr
    WHERE cr.id = recording_id AND cr.user_id = auth.uid()
  ));

-- 6. Enable realtime for chunked_recordings
ALTER PUBLICATION supabase_realtime ADD TABLE public.chunked_recordings;

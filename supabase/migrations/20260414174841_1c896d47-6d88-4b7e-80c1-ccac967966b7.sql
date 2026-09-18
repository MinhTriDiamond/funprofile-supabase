-- Bước 1: Thêm cột livestream_urls vào pplp_v2_events
ALTER TABLE public.pplp_v2_events
ADD COLUMN IF NOT EXISTS livestream_urls JSONB DEFAULT '[]'::jsonb;

-- Bước 2: Thêm cột attendance_confidence vào pplp_v2_attendance
ALTER TABLE public.pplp_v2_attendance
ADD COLUMN IF NOT EXISTS attendance_confidence NUMERIC(4,2);

-- Bước 3: Tạo bảng pplp_v2_event_log cho audit trail / observability
CREATE TABLE IF NOT EXISTS public.pplp_v2_event_log (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  event_type TEXT NOT NULL,
  actor_id UUID,
  reference_table TEXT,
  reference_id UUID,
  payload JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Index cho query theo event_type và thời gian
CREATE INDEX IF NOT EXISTS idx_pplp_v2_event_log_type_created
ON public.pplp_v2_event_log (event_type, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_pplp_v2_event_log_reference
ON public.pplp_v2_event_log (reference_table, reference_id);

-- RLS cho pplp_v2_event_log (append-only, chỉ service role ghi)
ALTER TABLE public.pplp_v2_event_log ENABLE ROW LEVEL SECURITY;

-- Chỉ authenticated users được đọc log của chính mình
CREATE POLICY "Users can view their own event logs"
ON public.pplp_v2_event_log
FOR SELECT
TO authenticated
USING (actor_id = auth.uid());

-- Service role có full access (edge functions dùng service role key để ghi)

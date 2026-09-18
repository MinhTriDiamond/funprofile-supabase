-- Add source_platform to pplp_v2_user_actions
ALTER TABLE public.pplp_v2_user_actions
ADD COLUMN IF NOT EXISTS source_platform text DEFAULT NULL;

-- Add attendance_mode to pplp_v2_attendance
ALTER TABLE public.pplp_v2_attendance
ADD COLUMN IF NOT EXISTS attendance_mode text NOT NULL DEFAULT 'direct_checkin';

-- Add index on source_platform for filtering
CREATE INDEX IF NOT EXISTS idx_pplp_v2_user_actions_source_platform
ON public.pplp_v2_user_actions(source_platform)
WHERE source_platform IS NOT NULL;
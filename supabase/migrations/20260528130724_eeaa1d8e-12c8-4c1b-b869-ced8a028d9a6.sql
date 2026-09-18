-- Backfill recording layout cho các phiên webcam đã tạo trước khi schema cache PostgREST
-- kịp nhận 5 cột mới (live_sessions.recording_layout/width/height/aspect_ratio/source_device_type).
-- Mặc định landscape 16:9 720p / desktop vì phần lớn webcam live là từ máy tính; replay mobile
-- portrait nếu có sẽ được edge function ghi đúng từ bây giờ.

UPDATE public.live_sessions
SET
  recording_layout = 'landscape_16_9',
  recording_width = 1280,
  recording_height = 720,
  recording_aspect_ratio = '16:9',
  source_device_type = COALESCE(source_device_type, 'desktop')
WHERE mode = 'agora_webcam'
  AND recording_layout IS NULL;

-- Merge metadata cho post live / live_replay đã tạo nhưng thiếu recording_layout
UPDATE public.posts p
SET metadata = COALESCE(p.metadata, '{}'::jsonb) || jsonb_build_object(
  'recording_layout', 'landscape_16_9',
  'recording_width', 1280,
  'recording_height', 720,
  'recording_aspect_ratio', '16:9',
  'source_device_type', COALESCE(p.metadata->>'source_device_type', 'desktop')
)
WHERE p.post_type IN ('live', 'live_replay')
  AND (p.metadata->>'live_mode') = 'agora_webcam'
  AND (p.metadata->>'recording_layout') IS NULL;

-- Reload PostgREST schema cache để các INSERT tới đây thấy đủ 5 cột mới.
NOTIFY pgrst, 'reload schema';
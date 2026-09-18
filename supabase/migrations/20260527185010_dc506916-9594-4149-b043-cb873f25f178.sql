UPDATE public.live_sessions
SET status='failed', recording_status='failed', archive_status='failed',
    recording_error='r2_token_missing_write_permission',
    error_message='R2 access token chỉ có quyền Read, Agora không upload được vào R2 → file kẹt trong Agora backup nội bộ, không recover được.',
    updated_at=now()
WHERE id IN ('93a1f4c0-064b-4857-baad-f32595f44e8e','e8f13a52-d1b3-4689-8c7f-42bf2d6b9964');

UPDATE public.posts
SET replay_status='failed',
    processing_message='Phiên live không lưu được do thiếu quyền R2. Bé sẽ cập nhật và thử lại phiên sau.',
    updated_at=now()
WHERE id IN (
  SELECT post_id FROM public.live_sessions
  WHERE id IN ('93a1f4c0-064b-4857-baad-f32595f44e8e','e8f13a52-d1b3-4689-8c7f-42bf2d6b9964')
    AND post_id IS NOT NULL
);
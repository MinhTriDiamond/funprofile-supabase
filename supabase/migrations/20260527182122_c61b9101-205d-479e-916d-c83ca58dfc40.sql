UPDATE public.live_sessions
SET status = 'failed',
    recording_status = 'failed',
    archive_status = 'failed',
    recording_error = COALESCE(recording_error, 'agora_backup_fallback_legacy_config'),
    error_message = COALESCE(error_message, 'Agora vendor=1 không upload được vào R2, file kẹt trong backup nội bộ Agora (legacy config, không recover được)'),
    updated_at = now()
WHERE id IN (
  'fbf957f5-97b8-49bc-a36c-8492d86ad427',
  'f35a9022-4458-4326-8246-3939ae1646ef',
  '9c0d9fbd-3823-4660-ab71-c00e21dc724e',
  '54d06194-5ce5-4ef8-a849-e2df08b6bd79'
)
AND replay_url IS NULL;
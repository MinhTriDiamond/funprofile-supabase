-- Read-only candidate inventory. No UPDATE/DELETE/INSERT statements.
-- Provider identifiers and object keys are reported as presence booleans only;
-- this query cannot confirm Agora/R2/Cloudflare object existence.

SELECT
  s.id AS live_session_id,
  s.mode,
  s.status,
  s.recording_status,
  s.archive_status,
  round(extract(epoch FROM (now() - s.created_at)) / 3600)::bigint AS age_hours,
  (s.recording_sid IS NOT NULL OR s.cloudflare_live_input_id IS NOT NULL OR s.cloudflare_video_uid IS NOT NULL) AS has_provider_handle,
  (s.post_id IS NOT NULL OR s.live_post_id IS NOT NULL OR s.replay_post_id IS NOT NULL) AS has_linked_post,
  CASE
    WHEN s.r2_archived_at IS NOT NULL AND s.r2_video_url IS NOT NULL THEN 'recoverable_candidate_needs_current_public_check'
    WHEN s.archive_status = 'unrecoverable' THEN 'terminal_label_unverified'
    WHEN s.archive_status IN ('pending', 'failed', 'archiving', 'uploading_r2', 'verifying_r2')
      AND (s.recording_sid IS NOT NULL OR s.cloudflare_live_input_id IS NOT NULL OR s.cloudflare_video_uid IS NOT NULL)
      THEN 'retryable_candidate_needs_provider_check'
    ELSE 'ambiguous'
  END AS dry_run_class
FROM public.live_sessions s
WHERE s.deleted_at IS NULL
  AND s.updated_at < now() - interval '30 days'
  AND (
    s.archive_status IN ('pending', 'failed', 'unrecoverable', 'archiving', 'uploading_r2', 'verifying_r2')
    OR s.status IN ('live', 'disconnect_grace', 'reconnecting', 'waiting_for_obs', 'processing', 'processing_replay')
  )
ORDER BY s.updated_at ASC, s.id;

SELECT
  r.id AS replay_id,
  r.live_session_id,
  s.mode,
  r.status,
  r.replay_status,
  r.archive_status,
  round(extract(epoch FROM (now() - r.created_at)) / 3600)::bigint AS age_hours,
  (r.stream_uid IS NOT NULL OR r.temp_mp4_key IS NOT NULL OR r.archive_mp4_key IS NOT NULL OR r.r2_object_key IS NOT NULL) AS has_provider_or_object_handle,
  (r.replay_post_id IS NOT NULL) AS has_linked_post,
  CASE
    WHEN r.r2_verified_at IS NOT NULL AND COALESCE(r.r2_video_url, r.playback_mp4, r.archive_mp4_url) IS NOT NULL THEN 'recoverable_candidate_needs_current_public_check'
    WHEN r.archive_status = 'unrecoverable' THEN 'terminal_label_unverified'
    WHEN r.archive_status IN ('pending', 'failed', 'archiving', 'uploading_r2', 'verifying_r2')
      AND (r.stream_uid IS NOT NULL OR r.temp_mp4_key IS NOT NULL OR r.archive_mp4_key IS NOT NULL OR r.r2_object_key IS NOT NULL OR s.recording_sid IS NOT NULL OR s.cloudflare_video_uid IS NOT NULL)
      THEN 'retryable_candidate_needs_provider_check'
    ELSE 'ambiguous'
  END AS dry_run_class
FROM public.live_replays r
LEFT JOIN public.live_sessions s ON s.id = r.live_session_id
WHERE r.updated_at < now() - interval '30 days'
  AND r.archive_status IN ('pending', 'failed', 'unrecoverable', 'archiving', 'uploading_r2', 'verifying_r2')
ORDER BY r.updated_at ASC, r.id;

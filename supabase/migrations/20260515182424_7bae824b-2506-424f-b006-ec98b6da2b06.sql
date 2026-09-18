-- Backfill posts live_replay đang trỏ Cloudflare Stream temp URL nhưng replay đã archive xong sang R2.
-- Áp dụng cho 2 phiên của angelquangvu và mọi user khác bị tương tự.
WITH candidates AS (
  SELECT
    p.id AS post_id,
    lr.r2_video_url,
    lr.r2_object_key,
    lr.r2_bucket,
    lr.thumbnail_url,
    COALESCE(p.metadata, '{}'::jsonb) AS old_meta
  FROM posts p
  JOIN live_replays lr ON lr.replay_post_id = p.id
  WHERE p.post_type = 'live_replay'
    AND p.playback_provider = 'cloudflare_temp'
    AND lr.r2_video_url IS NOT NULL
    AND lr.archive_status IN ('archived','replay_posted','stream_deleted')
)
UPDATE posts p
SET
  video_url = c.r2_video_url,
  playback_provider = 'r2',
  replay_status = 'ready',
  replay_ready = true,
  processing_message = NULL,
  thumbnail_url = COALESCE(p.thumbnail_url, c.thumbnail_url),
  metadata = c.old_meta
    || jsonb_build_object(
      'playback_url', c.r2_video_url,
      'playback_type', 'r2',
      'playback_provider', 'r2',
      'storage_provider', 'r2',
      'r2_video_url', c.r2_video_url,
      'r2_object_key', c.r2_object_key,
      'r2_bucket', c.r2_bucket,
      'replay_status', 'ready',
      'replay_ready', true,
      'processing_message', NULL,
      'archive_status', 'archived'
    )
FROM candidates c
WHERE p.id = c.post_id;
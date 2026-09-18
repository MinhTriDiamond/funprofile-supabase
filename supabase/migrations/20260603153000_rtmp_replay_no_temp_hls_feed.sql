-- Keep RTMP replay feed playback gated on verified R2 MP4.
-- Cloudflare Stream HLS is an internal temporary source for archive processing only.

WITH ready_rtmp_replays AS (
  SELECT
    p.id AS post_id,
    COALESCE(lr.archive_mp4_url, lr.r2_video_url, lr.playback_mp4, ls.r2_video_url, ls.cloudflare_mp4_download_url, ls.replay_url) AS final_url,
    COALESCE(lr.thumbnail_url, p.thumbnail_url) AS final_thumbnail_url,
    lr.id AS replay_id,
    COALESCE(lr.stream_uid, lr.cloudflare_video_uid, ls.cloudflare_video_uid) AS stream_uid
  FROM public.posts p
  LEFT JOIN public.live_sessions ls
    ON ls.post_id = p.id
    OR ls.live_post_id = p.id
    OR ls.replay_post_id = p.id
  LEFT JOIN public.live_replays lr
    ON lr.live_session_id = ls.id
    OR lr.replay_post_id = p.id
  WHERE (p.post_type IN ('live', 'live_replay') OR p.metadata->>'live_mode' = 'rtmp_obs')
    AND (
      p.playback_provider = 'cloudflare_temp'
      OR p.video_url ILIKE '%.m3u8%'
      OR p.metadata->>'playback_provider' = 'cloudflare_temp'
      OR p.metadata->>'storage_provider' = 'cloudflare_stream'
      OR p.metadata->>'live_mode' = 'rtmp_obs'
    )
)
UPDATE public.posts p
SET
  video_url = r.final_url,
  post_type = 'live_replay',
  replay_status = 'ready_mp4',
  playback_provider = 'r2',
  replay_ready = true,
  thumbnail_url = r.final_thumbnail_url,
  processing_message = NULL,
  metadata = COALESCE(p.metadata, '{}'::jsonb) || jsonb_build_object(
    'live_status', 'ended',
    'live_mode', 'rtmp_obs',
    'post_type', 'live_replay',
    'replay_id', r.replay_id,
    'playback_url', r.final_url,
    'playback_type', 'mp4',
    'playback_provider', 'r2',
    'provider', 'r2',
    'storage_provider', 'r2',
    'archive_status', 'r2_ready',
    'replay_status', 'ready_mp4',
    'replay_ready', true,
    'r2_video_url', r.final_url,
    'archive_mp4_url', r.final_url,
    'stream_uid', r.stream_uid,
    'cloudflare_video_uid', r.stream_uid,
    'processing_message', NULL
  ),
  updated_at = now()
FROM ready_rtmp_replays r
WHERE p.id = r.post_id
  AND r.final_url IS NOT NULL;

UPDATE public.posts p
SET
  video_url = NULL,
  post_type = 'live_replay',
  replay_status = 'processing',
  playback_provider = 'r2',
  replay_ready = false,
  processing_message = COALESCE(p.processing_message, 'Video đang được xử lý'),
  metadata = COALESCE(p.metadata, '{}'::jsonb)
    - 'playback_url'
    - 'playback_hls'
    - 'cloudflare_playback_url'
    || jsonb_build_object(
      'live_status', 'ended',
      'live_mode', 'rtmp_obs',
      'post_type', 'live_replay',
      'playback_url', NULL,
      'playback_hls', NULL,
      'cloudflare_playback_url', NULL,
      'playback_type', 'r2_pending',
      'playback_provider', 'r2',
      'storage_provider', 'r2',
      'archive_status', COALESCE(p.metadata->>'archive_status', 'pending'),
      'replay_status', 'processing',
      'replay_ready', false,
      'replay_source', 'r2_pending',
      'processing_message', COALESCE(p.processing_message, 'Video đang được xử lý')
    ),
  updated_at = now()
WHERE (p.post_type IN ('live', 'live_replay') OR p.metadata->>'live_mode' = 'rtmp_obs')
  AND (
    p.playback_provider = 'cloudflare_temp'
    OR p.video_url ILIKE '%.m3u8%'
    OR p.metadata->>'playback_provider' = 'cloudflare_temp'
    OR p.metadata->>'storage_provider' = 'cloudflare_stream'
  )
  AND NOT EXISTS (
    SELECT 1
    FROM public.live_sessions ls
    LEFT JOIN public.live_replays lr
      ON lr.live_session_id = ls.id
      OR lr.replay_post_id = p.id
    WHERE (ls.post_id = p.id OR ls.live_post_id = p.id OR ls.replay_post_id = p.id)
      AND COALESCE(lr.archive_mp4_url, lr.r2_video_url, lr.playback_mp4, ls.r2_video_url, ls.cloudflare_mp4_download_url, ls.replay_url) IS NOT NULL
  );

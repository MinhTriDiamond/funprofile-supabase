-- Stop spending Cloudflare Stream ingest work on old unfinished livestream replays.
-- Their posts keep using the chunked manifest fallback. New livestreams created after
-- this deployment remain cloudflare_vod_enabled=true and continue through Stream VOD.

WITH legacy AS (
  SELECT
    lr.id AS replay_id,
    lr.live_session_id,
    cr.id AS recording_id,
    cr.output_url AS chunked_url
  FROM public.live_replays lr
  LEFT JOIN public.chunked_recordings cr ON cr.id = lr.chunked_recording_id
  WHERE lr.status IN ('queued', 'uploading', 'processing', 'failed')
    AND lr.playback_hls IS NULL
)
UPDATE public.live_replays lr
SET
  status = 'skipped_legacy',
  cloudflare_vod_enabled = false,
  error_message = NULL,
  last_error_at = NULL,
  last_cf_status = 'skipped_legacy_chunk_fallback',
  last_cf_response = jsonb_build_object(
    'reason', 'legacy replay intentionally kept on chunked playback',
    'skipped_at', now()
  ),
  updated_at = now()
FROM legacy
WHERE lr.id = legacy.replay_id;

WITH legacy_posts AS (
  SELECT
    ls.post_id,
    lr.live_session_id,
    lr.chunked_recording_id,
    cr.output_url AS chunked_url
  FROM public.live_replays lr
  JOIN public.live_sessions ls ON ls.id = lr.live_session_id
  LEFT JOIN public.chunked_recordings cr ON cr.id = lr.chunked_recording_id
  WHERE lr.status = 'skipped_legacy'
    AND lr.cloudflare_vod_enabled = false
    AND ls.post_id IS NOT NULL
    AND cr.output_url IS NOT NULL
)
UPDATE public.posts p
SET
  video_url = COALESCE(legacy_posts.chunked_url, p.video_url),
  metadata = COALESCE(p.metadata, '{}'::jsonb) || jsonb_build_object(
    'live_status', 'ended',
    'live_session_id', legacy_posts.live_session_id,
    'playback_url', legacy_posts.chunked_url,
    'playback_type', 'chunked',
    'fallback_playback_url', legacy_posts.chunked_url,
    'allow_chunked_fallback', true,
    'chunked_recording_id', legacy_posts.chunked_recording_id,
    'cloudflare_stream_skipped', true,
    'cloudflare_stream_skip_reason', 'legacy replay kept on chunked playback'
  )
FROM legacy_posts
WHERE p.id = legacy_posts.post_id;

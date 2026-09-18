DROP POLICY IF EXISTS "live_replays_public_read_playable_archive" ON public.live_replays;
CREATE POLICY "live_replays_public_read_playable_archive"
  ON public.live_replays
  FOR SELECT
  TO anon, authenticated
  USING (
    status::text IN ('ready', 'archived', 'posted')
    OR replay_status IN ('ready', 'ready_mp4')
    OR archive_status IN ('archived', 'replay_posted', 'stream_deleted', 'r2_ready')
    OR r2_video_url IS NOT NULL
    OR archive_mp4_url IS NOT NULL
    OR playback_mp4 IS NOT NULL
  );

CREATE INDEX IF NOT EXISTS idx_live_replays_replay_post_id_updated
  ON public.live_replays(replay_post_id, updated_at DESC)
  WHERE replay_post_id IS NOT NULL;

WITH latest_replay AS (
  SELECT DISTINCT ON (lr.live_session_id)
    lr.*
  FROM public.live_replays lr
  ORDER BY lr.live_session_id, lr.updated_at DESC NULLS LAST, lr.created_at DESC
),
linked_posts AS (
  SELECT
    ls.id AS live_session_id,
    ls.mode,
    ls.status,
    ls.recording_status,
    ls.archive_status AS session_archive_status,
    ls.post_id,
    ls.live_post_id,
    ls.replay_post_id,
    lr.id AS replay_id,
    lr.replay_status,
    lr.archive_status AS replay_archive_status,
    lr.thumbnail_url,
    COALESCE(
      CASE WHEN lr.playback_mp4 IS NOT NULL AND lr.playback_mp4 !~* '\.m3u8(\?|$)' THEN lr.playback_mp4 END,
      CASE WHEN lr.r2_video_url IS NOT NULL AND lr.r2_video_url !~* '\.m3u8(\?|$)' THEN lr.r2_video_url END,
      CASE WHEN lr.archive_mp4_url IS NOT NULL AND lr.archive_mp4_url !~* '\.m3u8(\?|$)' THEN lr.archive_mp4_url END,
      CASE WHEN ls.archive_url IS NOT NULL AND ls.archive_url !~* '\.m3u8(\?|$)' THEN ls.archive_url END,
      CASE WHEN ls.r2_video_url IS NOT NULL AND ls.r2_video_url !~* '\.m3u8(\?|$)' THEN ls.r2_video_url END,
      CASE WHEN ls.replay_url IS NOT NULL AND ls.replay_url !~* '\.m3u8(\?|$)' THEN ls.replay_url END,
      CASE WHEN ls.playback_url IS NOT NULL AND ls.playback_url !~* '\.m3u8(\?|$)' THEN ls.playback_url END
    ) AS final_url
  FROM public.live_sessions ls
  LEFT JOIN latest_replay lr ON lr.live_session_id = ls.id
  WHERE ls.post_id IS NOT NULL OR ls.live_post_id IS NOT NULL OR ls.replay_post_id IS NOT NULL
),
targets AS (
  SELECT DISTINCT
    lp.*,
    unnest(array_remove(ARRAY[lp.post_id, lp.live_post_id, lp.replay_post_id], NULL)) AS target_post_id
  FROM linked_posts lp
)
UPDATE public.posts p
SET metadata = COALESCE(p.metadata, '{}'::jsonb)
  || jsonb_strip_nulls(jsonb_build_object(
    'live_session_id', t.live_session_id,
    'live_status', CASE
      WHEN t.status IN ('live', 'reconnecting', 'disconnect_grace') THEN 'live'
      ELSE 'ended'
    END,
    'live_mode', COALESCE(t.mode, 'agora_webcam'),
    'replay_id', t.replay_id,
    'replay_status', CASE
      WHEN t.final_url IS NOT NULL THEN 'ready_mp4'
      WHEN t.recording_status = 'failed' OR t.status = 'recording_failed' THEN 'failed'
      ELSE 'processing'
    END,
    'replay_ready', t.final_url IS NOT NULL,
    'archive_status', COALESCE(t.replay_archive_status, t.session_archive_status),
    'archive_url', t.final_url,
    'archive_mp4_url', t.final_url,
    'r2_video_url', t.final_url,
    'playback_url', t.final_url,
    'playback_mp4', t.final_url,
    'playback_provider', CASE WHEN t.final_url IS NOT NULL THEN 'r2' ELSE NULL END,
    'playback_type', CASE WHEN t.final_url IS NOT NULL THEN 'mp4' ELSE 'processing' END,
    'thumbnail_url', t.thumbnail_url,
    'processing_message', CASE
      WHEN t.final_url IS NOT NULL THEN NULL
      WHEN t.recording_status = 'failed' OR t.status = 'recording_failed' THEN 'Video dang xu ly loi, vui long thu lai sau'
      ELSE 'Video dang duoc xu ly'
    END
  )),
  video_url = CASE WHEN t.final_url IS NOT NULL THEN t.final_url ELSE p.video_url END,
  post_type = CASE WHEN t.final_url IS NOT NULL THEN 'live_replay' ELSE p.post_type END,
  replay_status = CASE
    WHEN t.final_url IS NOT NULL THEN 'ready_mp4'
    WHEN t.recording_status = 'failed' OR t.status = 'recording_failed' THEN 'failed'
    ELSE COALESCE(p.replay_status, 'processing')
  END,
  replay_ready = t.final_url IS NOT NULL,
  playback_provider = CASE WHEN t.final_url IS NOT NULL THEN 'r2' ELSE p.playback_provider END,
  processing_message = CASE
    WHEN t.final_url IS NOT NULL THEN NULL
    WHEN t.recording_status = 'failed' OR t.status = 'recording_failed' THEN 'Video dang xu ly loi, vui long thu lai sau'
    ELSE COALESCE(p.processing_message, 'Video dang duoc xu ly')
  END,
  updated_at = now()
FROM targets t
WHERE p.id = t.target_post_id
  AND p.post_type IN ('live', 'live_replay')
  AND (
    COALESCE(p.metadata->>'live_session_id', '') <> t.live_session_id::text
    OR (t.final_url IS NOT NULL AND COALESCE(p.video_url, '') <> t.final_url)
    OR (t.final_url IS NULL AND p.video_url IS NULL AND p.processing_message IS NULL)
  );

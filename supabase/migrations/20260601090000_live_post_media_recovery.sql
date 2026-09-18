CREATE OR REPLACE FUNCTION public.resolve_live_session_route_id(p_id uuid)
RETURNS TABLE (
  live_session_id uuid,
  status text,
  post_id uuid,
  live_post_id uuid,
  replay_post_id uuid,
  playback_url text,
  r2_video_url text,
  archive_url text,
  replay_url text,
  recording_status text,
  archive_status text
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  WITH input_posts AS (
    SELECT p_id AS id
    UNION
    SELECT sp.original_post_id
    FROM public.shared_posts sp
    WHERE sp.id = p_id
  ),
  post_metadata_sessions AS (
    SELECT
      CASE
        WHEN p.metadata ? 'live_session_id'
          AND (p.metadata->>'live_session_id') ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
        THEN (p.metadata->>'live_session_id')::uuid
        ELSE NULL
      END AS id
    FROM public.posts p
    WHERE p.id IN (SELECT id FROM input_posts)
  ),
  candidates AS (
    SELECT ls.*
    FROM public.live_sessions ls
    WHERE ls.id = p_id

    UNION

    SELECT ls.*
    FROM public.live_sessions ls
    WHERE ls.id IN (SELECT id FROM post_metadata_sessions WHERE id IS NOT NULL)

    UNION

    SELECT ls.*
    FROM public.live_sessions ls
    WHERE ls.post_id IN (SELECT id FROM input_posts)
       OR ls.live_post_id IN (SELECT id FROM input_posts)
       OR ls.replay_post_id IN (SELECT id FROM input_posts)

    UNION

    SELECT ls.*
    FROM public.live_sessions ls
    JOIN public.live_replays lr ON lr.live_session_id = ls.id
    WHERE lr.replay_post_id IN (SELECT id FROM input_posts)
  )
  SELECT
    c.id AS live_session_id,
    c.status::text,
    c.post_id,
    c.live_post_id,
    c.replay_post_id,
    c.playback_url,
    c.r2_video_url,
    c.archive_url,
    c.replay_url,
    c.recording_status::text,
    c.archive_status::text
  FROM candidates c
  WHERE c.status IN (
      'live',
      'reconnecting',
      'ending',
      'recording_processing',
      'recording_failed',
      'disconnect_grace',
      'ended',
      'processing',
      'processing_replay',
      'archiving',
      'posted',
      'processing_stream',
      'stream_ready',
      'exporting_mp4',
      'uploading_r2',
      'verifying_r2',
      'archived',
      'replay_posted',
      'stream_deleted',
      'failed'
    )
    AND (
      c.privacy = 'public'
      OR auth.uid() IN (c.host_user_id, c.owner_id, c.user_id)
      OR EXISTS (
        SELECT 1
        FROM public.posts p
        WHERE p.id IN (c.post_id, c.live_post_id, c.replay_post_id)
          AND COALESCE(p.visibility, 'public') <> 'private'
      )
    )
  ORDER BY
    CASE c.status
      WHEN 'live' THEN 0
      WHEN 'reconnecting' THEN 1
      WHEN 'disconnect_grace' THEN 2
      WHEN 'ending' THEN 3
      WHEN 'recording_processing' THEN 4
      WHEN 'ended' THEN 5
      ELSE 6
    END,
    c.updated_at DESC
  LIMIT 1;
END;
$$;

GRANT EXECUTE ON FUNCTION public.resolve_live_session_route_id(uuid) TO anon, authenticated;

DROP POLICY IF EXISTS "public can read live sessions" ON public.live_sessions;
CREATE POLICY "public can read live sessions"
  ON public.live_sessions FOR SELECT
  TO anon, authenticated
  USING (status IN (
    'live',
    'reconnecting',
    'ending',
    'recording_processing',
    'recording_failed',
    'disconnect_grace',
    'ended',
    'processing',
    'processing_replay',
    'archiving',
    'posted',
    'processing_stream',
    'stream_ready',
    'exporting_mp4',
    'uploading_r2',
    'verifying_r2',
    'archived',
    'replay_posted',
    'stream_deleted',
    'failed'
  ));

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
    COALESCE(lr.playback_mp4, lr.r2_video_url, lr.archive_mp4_url, ls.archive_url, ls.r2_video_url, ls.replay_url, ls.playback_url) AS final_url,
    lr.id AS replay_id,
    lr.replay_status,
    lr.archive_status AS replay_archive_status,
    lr.thumbnail_url
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
    'r2_video_url', t.final_url,
    'playback_url', t.final_url,
    'playback_mp4', t.final_url,
    'playback_provider', CASE WHEN t.final_url IS NOT NULL THEN 'r2' ELSE NULL END,
    'playback_type', CASE WHEN t.final_url IS NOT NULL THEN 'mp4' ELSE 'processing' END,
    'thumbnail_url', t.thumbnail_url,
    'processing_message', CASE
      WHEN t.final_url IS NOT NULL THEN NULL
      WHEN t.recording_status = 'failed' OR t.status = 'recording_failed' THEN 'Video đang xử lý lỗi, vui lòng thử lại sau'
      ELSE 'Video đang được xử lý'
    END
  )),
  video_url = CASE WHEN t.final_url IS NOT NULL THEN t.final_url ELSE p.video_url END,
  post_type = CASE WHEN t.final_url IS NOT NULL THEN 'live_replay' ELSE p.post_type END,
  replay_status = CASE
    WHEN t.final_url IS NOT NULL THEN 'ready_mp4'
    WHEN t.recording_status = 'failed' OR t.status = 'recording_failed' THEN 'failed'
    ELSE COALESCE(p.replay_status, 'processing')
  END,
  replay_ready = COALESCE(t.final_url IS NOT NULL, false),
  playback_provider = CASE WHEN t.final_url IS NOT NULL THEN 'r2' ELSE p.playback_provider END,
  processing_message = CASE
    WHEN t.final_url IS NOT NULL THEN NULL
    WHEN t.recording_status = 'failed' OR t.status = 'recording_failed' THEN 'Video đang xử lý lỗi, vui lòng thử lại sau'
    ELSE COALESCE(p.processing_message, 'Video đang được xử lý')
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

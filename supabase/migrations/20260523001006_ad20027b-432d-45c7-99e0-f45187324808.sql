CREATE OR REPLACE FUNCTION public.resolve_live_session_route_id(p_id uuid)
RETURNS TABLE (
  live_session_id uuid,
  status text,
  post_id uuid,
  live_post_id uuid,
  replay_post_id uuid,
  playback_url text,
  r2_video_url text
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
    WHERE lr.replay_post_id = p_id
  )
  SELECT
    c.id AS live_session_id,
    c.status::text,
    c.post_id,
    c.live_post_id,
    c.replay_post_id,
    c.playback_url,
    c.r2_video_url
  FROM candidates c
  WHERE c.status IN (
      'live',
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
      'stream_deleted'
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
      WHEN 'disconnect_grace' THEN 1
      WHEN 'ended' THEN 2
      ELSE 3
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
    'stream_deleted'
  ));

UPDATE public.posts p
SET metadata = COALESCE(p.metadata, '{}'::jsonb)
  || jsonb_build_object(
    'live_session_id', ls.id,
    'live_status', CASE
      WHEN ls.status = 'disconnect_grace' THEN 'disconnect_grace'
      WHEN ls.status = 'live' THEN 'live'
      ELSE 'ended'
    END,
    'live_mode', COALESCE(ls.mode, 'agora_webcam'),
    'post_id', p.id
  )
FROM public.live_sessions ls
WHERE p.id IN (ls.post_id, ls.live_post_id)
  AND p.post_type = 'live'
  AND COALESCE(p.metadata->>'live_session_id', '') <> ls.id::text;
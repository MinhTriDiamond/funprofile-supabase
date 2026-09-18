-- 1. Extend posts table
ALTER TABLE public.posts
ADD COLUMN IF NOT EXISTS post_type text NOT NULL DEFAULT 'text',
ADD COLUMN IF NOT EXISTS metadata jsonb NOT NULL DEFAULT '{}'::jsonb;

-- 2. Create live_sessions table
CREATE TABLE IF NOT EXISTS public.live_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  host_user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  owner_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  channel_name text NOT NULL UNIQUE,
  agora_channel text,
  agora_uid_host integer,
  recording_uid integer,
  resource_id text,
  sid text,
  recording_resource_id text,
  recording_sid text,
  recording_files jsonb DEFAULT '[]'::jsonb,
  recording_status text NOT NULL DEFAULT 'idle',
  recording_started_at timestamptz,
  recording_stopped_at timestamptz,
  recording_ready_at timestamptz,
  recording_error text,
  last_worker_response jsonb DEFAULT '{}'::jsonb,
  recording_acquired_at timestamptz,
  title text,
  privacy text NOT NULL DEFAULT 'public',
  status text NOT NULL DEFAULT 'live',
  viewer_count integer NOT NULL DEFAULT 0 CHECK (viewer_count >= 0),
  started_at timestamptz NOT NULL DEFAULT now(),
  ended_at timestamptz,
  post_id uuid REFERENCES public.posts(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT live_sessions_privacy_check CHECK (privacy IN ('public', 'friends')),
  CONSTRAINT live_sessions_status_check CHECK (status IN ('live', 'ended')),
  CONSTRAINT live_sessions_recording_status_check CHECK (recording_status IN ('idle', 'acquired', 'acquiring', 'starting', 'recording', 'stopping', 'processing', 'ready', 'stopped', 'failed'))
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_live_sessions_channel_name_unique ON public.live_sessions(channel_name);
CREATE UNIQUE INDEX IF NOT EXISTS idx_live_sessions_agora_channel_unique ON public.live_sessions(agora_channel) WHERE agora_channel IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_live_sessions_status_started_at ON public.live_sessions(status, started_at DESC);
CREATE INDEX IF NOT EXISTS idx_live_sessions_host_status ON public.live_sessions(host_user_id, status, started_at DESC);
CREATE INDEX IF NOT EXISTS idx_live_sessions_owner_status ON public.live_sessions(owner_id, status, started_at DESC);
CREATE INDEX IF NOT EXISTS idx_live_sessions_recording_status ON public.live_sessions(recording_status, created_at DESC);

-- Trigger for updated_at
CREATE TRIGGER update_live_sessions_updated_at
BEFORE UPDATE ON public.live_sessions
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

-- 3. Create live_recordings table
CREATE TABLE IF NOT EXISTS public.live_recordings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  live_id uuid NOT NULL REFERENCES public.live_sessions(id) ON DELETE CASCADE,
  resource_id text,
  sid text,
  recorder_uid text,
  mode text DEFAULT 'composite',
  status text NOT NULL DEFAULT 'recording',
  storage_vendor integer,
  storage_region integer,
  file_list_json jsonb NOT NULL DEFAULT '[]'::jsonb,
  media_url text,
  error_message text,
  raw_response jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  stopped_at timestamptz,
  duration_seconds integer,
  thumbnail_url text
);

CREATE INDEX IF NOT EXISTS idx_live_recordings_live_created ON public.live_recordings(live_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_live_recordings_status ON public.live_recordings(status, created_at DESC);

-- 4. Create live_messages table
CREATE TABLE IF NOT EXISTS public.live_messages (
  id bigserial PRIMARY KEY,
  session_id uuid NOT NULL REFERENCES public.live_sessions(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  content text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_live_messages_session_created_at ON public.live_messages(session_id, created_at);

-- 5. Create live_reactions table
CREATE TABLE IF NOT EXISTS public.live_reactions (
  id bigserial PRIMARY KEY,
  session_id uuid NOT NULL REFERENCES public.live_sessions(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  emoji text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_live_reactions_session_created_at ON public.live_reactions(session_id, created_at);

-- 6. Create live_comments table
CREATE TABLE IF NOT EXISTS public.live_comments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  live_session_id uuid NOT NULL REFERENCES public.live_sessions(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  message text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_live_comments_session_created_at ON public.live_comments(live_session_id, created_at);

-- 7. Create streams table
CREATE TABLE IF NOT EXISTS public.streams (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  title text NOT NULL,
  video_path text NOT NULL,
  duration integer NOT NULL,
  status text NOT NULL DEFAULT 'completed',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- 8. Enable RLS
ALTER TABLE public.live_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.live_recordings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.live_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.live_reactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.live_comments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.streams ENABLE ROW LEVEL SECURITY;

-- 9. Policies

-- live_sessions
CREATE POLICY "public can read live sessions" ON public.live_sessions FOR SELECT TO anon, authenticated USING (status IN ('live', 'ended'));
CREATE POLICY "host can insert own live session" ON public.live_sessions FOR INSERT TO authenticated WITH CHECK (auth.uid() = host_user_id OR auth.uid() = owner_id);
CREATE POLICY "host can update own live session" ON public.live_sessions FOR UPDATE TO authenticated USING (auth.uid() = host_user_id OR auth.uid() = owner_id) WITH CHECK (auth.uid() = host_user_id OR auth.uid() = owner_id);

-- live_messages
CREATE POLICY "Anyone can view live messages" ON public.live_messages FOR SELECT USING (true);
CREATE POLICY "Authenticated users can insert live messages" ON public.live_messages FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);

-- live_reactions
CREATE POLICY "Anyone can view live reactions" ON public.live_reactions FOR SELECT USING (true);
CREATE POLICY "Authenticated users can insert live reactions" ON public.live_reactions FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);

-- live_comments
CREATE POLICY "Anyone can view live comments" ON public.live_comments FOR SELECT USING (true);
CREATE POLICY "Authenticated users can insert live comments" ON public.live_comments FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);

-- streams
CREATE POLICY "Anyone can view streams" ON public.streams FOR SELECT USING (true);
CREATE POLICY "Authenticated users can insert streams" ON public.streams FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);

-- 10. RPC Functions

-- increment_live_viewer_count
CREATE OR REPLACE FUNCTION public.increment_live_viewer_count(session_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.live_sessions
  SET viewer_count = viewer_count + 1
  WHERE id = session_id;
END;
$$;

-- decrement_live_viewer_count
CREATE OR REPLACE FUNCTION public.decrement_live_viewer_count(session_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.live_sessions
  SET viewer_count = GREATEST(0, viewer_count - 1)
  WHERE id = session_id;
END;
$$;

-- get_live_recording_context
CREATE OR REPLACE FUNCTION public.get_live_recording_context(_session_id uuid)
RETURNS TABLE (
  id uuid,
  host_user_id uuid,
  channel_name text,
  agora_channel text,
  resource_id text,
  sid text,
  recording_uid integer,
  recording_status text,
  recording_started_at timestamptz,
  recording_stopped_at timestamptz,
  recording_ready_at timestamptz,
  recording_error text,
  last_worker_response jsonb,
  post_id uuid
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  SELECT
    ls.id,
    ls.host_user_id,
    ls.channel_name,
    ls.agora_channel,
    ls.resource_id,
    ls.sid,
    ls.recording_uid,
    ls.recording_status,
    ls.recording_started_at,
    ls.recording_stopped_at,
    ls.recording_ready_at,
    ls.recording_error,
    COALESCE(ls.last_worker_response, '{}'::jsonb),
    ls.post_id
  FROM public.live_sessions ls
  WHERE ls.id = _session_id
    AND (
      ls.host_user_id = auth.uid()
      OR public.has_role(auth.uid(), 'admin')
    );
END;
$$;

-- set_live_recording_state
CREATE OR REPLACE FUNCTION public.set_live_recording_state(
  _session_id uuid,
  _recording_status text DEFAULT NULL,
  _resource_id text DEFAULT NULL,
  _sid text DEFAULT NULL,
  _recording_uid integer DEFAULT NULL,
  _recording_started_at timestamptz DEFAULT NULL,
  _recording_stopped_at timestamptz DEFAULT NULL,
  _recording_ready_at timestamptz DEFAULT NULL,
  _recording_error text DEFAULT NULL,
  _last_worker_response jsonb DEFAULT NULL
)
RETURNS public.live_sessions
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _row public.live_sessions;
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM public.live_sessions ls
    WHERE ls.id = _session_id
      AND (
        ls.host_user_id = auth.uid()
        OR public.has_role(auth.uid(), 'admin')
      )
  ) THEN
    RAISE EXCEPTION 'forbidden';
  END IF;

  UPDATE public.live_sessions ls
  SET
    recording_status = COALESCE(_recording_status, ls.recording_status),
    resource_id = COALESCE(_resource_id, ls.resource_id),
    sid = COALESCE(_sid, ls.sid),
    recording_uid = COALESCE(_recording_uid, ls.recording_uid),
    recording_started_at = COALESCE(_recording_started_at, ls.recording_started_at),
    recording_stopped_at = COALESCE(_recording_stopped_at, ls.recording_stopped_at),
    recording_ready_at = COALESCE(_recording_ready_at, ls.recording_ready_at),
    recording_error = COALESCE(_recording_error, ls.recording_error),
    last_worker_response = COALESCE(_last_worker_response, ls.last_worker_response),
    updated_at = now()
  WHERE ls.id = _session_id
  RETURNING ls.* INTO _row;

  RETURN _row;
END;
$$;

-- upsert_live_recording_row
CREATE OR REPLACE FUNCTION public.upsert_live_recording_row(
  _session_id uuid,
  _resource_id text DEFAULT NULL,
  _sid text DEFAULT NULL,
  _recorder_uid text DEFAULT NULL,
  _status text DEFAULT NULL,
  _file_list_json jsonb DEFAULT NULL,
  _media_url text DEFAULT NULL,
  _raw_response jsonb DEFAULT NULL,
  _stopped_at timestamptz DEFAULT NULL,
  _duration_seconds integer DEFAULT NULL,
  _thumbnail_url text DEFAULT NULL
)
RETURNS public.live_recordings
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _live public.live_sessions;
  _latest_id uuid;
  _row public.live_recordings;
BEGIN
  SELECT * INTO _live
  FROM public.live_sessions ls
  WHERE ls.id = _session_id
    AND (
      ls.host_user_id = auth.uid()
      OR public.has_role(auth.uid(), 'admin')
    );

  IF _live.id IS NULL THEN
    RAISE EXCEPTION 'forbidden';
  END IF;

  SELECT lr.id INTO _latest_id
  FROM public.live_recordings lr
  WHERE lr.live_id = _session_id
  ORDER BY lr.created_at DESC
  LIMIT 1;

  IF _latest_id IS NULL THEN
    INSERT INTO public.live_recordings (
      live_id,
      resource_id,
      sid,
      recorder_uid,
      status,
      file_list_json,
      media_url,
      raw_response,
      stopped_at,
      duration_seconds,
      thumbnail_url
    ) VALUES (
      _session_id,
      _resource_id,
      _sid,
      _recorder_uid,
      COALESCE(_status, 'recording'),
      COALESCE(_file_list_json, '[]'::jsonb),
      _media_url,
      _raw_response,
      _stopped_at,
      _duration_seconds,
      _thumbnail_url
    ) RETURNING * INTO _row;
  ELSE
    UPDATE public.live_recordings lr
    SET
      resource_id = COALESCE(_resource_id, lr.resource_id),
      sid = COALESCE(_sid, lr.sid),
      recorder_uid = COALESCE(_recorder_uid, lr.recorder_uid),
      status = COALESCE(_status, lr.status),
      file_list_json = COALESCE(_file_list_json, lr.file_list_json),
      media_url = COALESCE(_media_url, lr.media_url),
      raw_response = COALESCE(_raw_response, lr.raw_response),
      stopped_at = COALESCE(_stopped_at, lr.stopped_at),
      duration_seconds = COALESCE(_duration_seconds, lr.duration_seconds),
      thumbnail_url = COALESCE(_thumbnail_url, lr.thumbnail_url)
    WHERE lr.id = _latest_id
    RETURNING lr.* INTO _row;
  END IF;

  RETURN _row;
END;
$$;

-- attach_live_replay_to_post
CREATE OR REPLACE FUNCTION public.attach_live_replay_to_post(
  _session_id uuid,
  _playback_url text,
  _duration_seconds integer DEFAULT NULL,
  _thumbnail_url text DEFAULT NULL
)
RETURNS public.live_sessions
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _live public.live_sessions;
  _metadata jsonb;
BEGIN
  SELECT * INTO _live
  FROM public.live_sessions ls
  WHERE ls.id = _session_id
    AND (
      ls.host_user_id = auth.uid()
      OR public.has_role(auth.uid(), 'admin')
    );

  IF _live.id IS NULL THEN
    RAISE EXCEPTION 'forbidden';
  END IF;

  IF _live.post_id IS NOT NULL THEN
    SELECT COALESCE(p.metadata::jsonb, '{}'::jsonb)
    INTO _metadata
    FROM public.posts p
    WHERE p.id = _live.post_id;

    _metadata := _metadata
      || jsonb_build_object('playback_url', _playback_url)
      || jsonb_build_object('live_status', 'ended')
      || jsonb_build_object('replay_ready_at', now());

    IF _duration_seconds IS NOT NULL THEN
      _metadata := _metadata || jsonb_build_object('duration_seconds', _duration_seconds);
    END IF;

    IF _thumbnail_url IS NOT NULL THEN
      _metadata := _metadata || jsonb_build_object('thumbnail_url', _thumbnail_url);
    END IF;

    UPDATE public.posts p
    SET
      metadata = _metadata,
      video_url = COALESCE(_playback_url, p.video_url)
    WHERE p.id = _live.post_id;
  END IF;

  UPDATE public.live_sessions ls
  SET
    recording_status = CASE WHEN _playback_url IS NULL OR _playback_url = '' THEN 'failed' ELSE 'ready' END,
    recording_ready_at = CASE WHEN _playback_url IS NULL OR _playback_url = '' THEN ls.recording_ready_at ELSE now() END,
    recording_error = CASE WHEN _playback_url IS NULL OR _playback_url = '' THEN COALESCE(ls.recording_error, 'Playback URL missing') ELSE NULL END,
    updated_at = now()
  WHERE ls.id = _session_id
  RETURNING ls.* INTO _live;

  RETURN _live;
END;
$$;

-- 11. Realtime
ALTER PUBLICATION supabase_realtime ADD TABLE public.live_sessions;
ALTER PUBLICATION supabase_realtime ADD TABLE public.live_messages;
ALTER PUBLICATION supabase_realtime ADD TABLE public.live_reactions;
ALTER PUBLICATION supabase_realtime ADD TABLE public.live_comments;
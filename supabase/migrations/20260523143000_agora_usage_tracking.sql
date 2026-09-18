CREATE TABLE IF NOT EXISTS public.agora_usage_config (
  key text PRIMARY KEY,
  value_numeric numeric NOT NULL DEFAULT 0,
  updated_at timestamptz NOT NULL DEFAULT now()
);

INSERT INTO public.agora_usage_config (key, value_numeric)
VALUES ('monthly_quota_minutes', 0)
ON CONFLICT (key) DO NOTHING;

ALTER TABLE public.agora_usage_config ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS agora_usage_config_admin_read ON public.agora_usage_config;
CREATE POLICY agora_usage_config_admin_read
  ON public.agora_usage_config FOR SELECT
  USING (public.has_role(auth.uid(), 'admin'::app_role));

DROP POLICY IF EXISTS agora_usage_config_admin_write ON public.agora_usage_config;
CREATE POLICY agora_usage_config_admin_write
  ON public.agora_usage_config FOR ALL
  USING (public.has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role));

CREATE TABLE IF NOT EXISTS public.agora_usage_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  live_session_id uuid NOT NULL REFERENCES public.live_sessions(id) ON DELETE CASCADE,
  channel_name text,
  agora_uid integer,
  stream_type text NOT NULL DEFAULT 'webcam',
  started_at timestamptz NOT NULL DEFAULT now(),
  ended_at timestamptz,
  status text NOT NULL DEFAULT 'connecting',
  error_code text,
  error_message_internal text,
  end_reason text,
  total_duration_seconds integer,
  total_duration_minutes numeric,
  peak_viewers integer DEFAULT 0,
  total_viewer_minutes numeric,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT agora_usage_status_check CHECK (status IN ('connecting','live','failed','ended')),
  CONSTRAINT agora_usage_stream_type_check CHECK (stream_type IN ('webcam','mobile','obs')),
  CONSTRAINT agora_usage_end_reason_check CHECK (
    end_reason IS NULL OR end_reason IN ('user_ended','agora_failed','quota_limit','network_error','system_timeout')
  )
);

CREATE INDEX IF NOT EXISTS idx_agora_usage_started_at ON public.agora_usage_sessions(started_at DESC);
CREATE INDEX IF NOT EXISTS idx_agora_usage_user_started ON public.agora_usage_sessions(user_id, started_at DESC);
CREATE INDEX IF NOT EXISTS idx_agora_usage_live_session ON public.agora_usage_sessions(live_session_id);
CREATE INDEX IF NOT EXISTS idx_agora_usage_status ON public.agora_usage_sessions(status);

ALTER TABLE public.agora_usage_sessions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS agora_usage_owner_read ON public.agora_usage_sessions;
CREATE POLICY agora_usage_owner_read
  ON public.agora_usage_sessions FOR SELECT
  USING (auth.uid() = user_id OR public.has_role(auth.uid(), 'admin'::app_role));

DROP POLICY IF EXISTS agora_usage_owner_insert ON public.agora_usage_sessions;
CREATE POLICY agora_usage_owner_insert
  ON public.agora_usage_sessions FOR INSERT
  WITH CHECK (
    auth.uid() = user_id
    AND EXISTS (
      SELECT 1 FROM public.live_sessions ls
      WHERE ls.id = agora_usage_sessions.live_session_id
        AND (ls.host_user_id = auth.uid() OR ls.owner_id = auth.uid())
    )
  );

DROP POLICY IF EXISTS agora_usage_owner_update ON public.agora_usage_sessions;
CREATE POLICY agora_usage_owner_update
  ON public.agora_usage_sessions FOR UPDATE
  USING (auth.uid() = user_id OR public.has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (auth.uid() = user_id OR public.has_role(auth.uid(), 'admin'::app_role));

CREATE OR REPLACE FUNCTION public.start_agora_usage_session(
  p_live_session_id uuid,
  p_channel_name text,
  p_agora_uid integer,
  p_stream_type text DEFAULT 'webcam'
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_usage_id uuid;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'not_authenticated';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.live_sessions ls
    WHERE ls.id = p_live_session_id
      AND (ls.host_user_id = v_user_id OR ls.owner_id = v_user_id)
  ) THEN
    RAISE EXCEPTION 'not_live_host';
  END IF;

  INSERT INTO public.agora_usage_sessions (
    user_id, live_session_id, channel_name, agora_uid, stream_type,
    started_at, status
  )
  VALUES (
    v_user_id, p_live_session_id, p_channel_name, p_agora_uid,
    COALESCE(NULLIF(p_stream_type, ''), 'webcam'), now(), 'live'
  )
  ON CONFLICT (id) DO NOTHING
  RETURNING id INTO v_usage_id;

  IF v_usage_id IS NULL THEN
    SELECT id INTO v_usage_id
    FROM public.agora_usage_sessions
    WHERE live_session_id = p_live_session_id
      AND user_id = v_user_id
    ORDER BY started_at DESC
    LIMIT 1;
  END IF;

  RETURN v_usage_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.finish_agora_usage_session(
  p_live_session_id uuid,
  p_status text DEFAULT 'ended',
  p_end_reason text DEFAULT 'user_ended',
  p_peak_viewers integer DEFAULT NULL,
  p_total_viewer_minutes numeric DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_now timestamptz := now();
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'not_authenticated';
  END IF;

  UPDATE public.agora_usage_sessions aus
  SET
    ended_at = COALESCE(aus.ended_at, v_now),
    status = CASE WHEN p_status IN ('failed','ended') THEN p_status ELSE 'ended' END,
    end_reason = p_end_reason,
    peak_viewers = GREATEST(COALESCE(aus.peak_viewers, 0), COALESCE(p_peak_viewers, 0)),
    total_viewer_minutes = COALESCE(p_total_viewer_minutes, aus.total_viewer_minutes),
    total_duration_seconds = GREATEST(0, FLOOR(EXTRACT(EPOCH FROM (COALESCE(aus.ended_at, v_now) - aus.started_at)))::integer),
    total_duration_minutes = ROUND((GREATEST(0, EXTRACT(EPOCH FROM (COALESCE(aus.ended_at, v_now) - aus.started_at))) / 60)::numeric, 2),
    updated_at = v_now
  WHERE aus.id = (
    SELECT id FROM public.agora_usage_sessions
    WHERE live_session_id = p_live_session_id
      AND (user_id = v_user_id OR public.has_role(v_user_id, 'admin'::app_role))
    ORDER BY started_at DESC
    LIMIT 1
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.record_agora_usage_error(
  p_live_session_id uuid,
  p_error_code text,
  p_error_message_internal text DEFAULT NULL,
  p_end_reason text DEFAULT 'agora_failed'
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid := auth.uid();
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'not_authenticated';
  END IF;

  UPDATE public.agora_usage_sessions
  SET
    status = 'failed',
    error_code = p_error_code,
    error_message_internal = p_error_message_internal,
    end_reason = p_end_reason,
    updated_at = now()
  WHERE id = (
    SELECT id FROM public.agora_usage_sessions
    WHERE live_session_id = p_live_session_id
      AND (user_id = v_user_id OR public.has_role(v_user_id, 'admin'::app_role))
    ORDER BY started_at DESC
    LIMIT 1
  );

  IF NOT FOUND THEN
    INSERT INTO public.agora_usage_sessions (
      user_id, live_session_id, status, error_code, error_message_internal,
      end_reason, started_at, ended_at
    )
    SELECT
      v_user_id, p_live_session_id, 'failed', p_error_code,
      p_error_message_internal, p_end_reason, now(), now()
    WHERE EXISTS (
      SELECT 1 FROM public.live_sessions ls
      WHERE ls.id = p_live_session_id
        AND (ls.host_user_id = v_user_id OR ls.owner_id = v_user_id)
    );
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.get_agora_usage_admin_stats(
  p_month_start timestamptz DEFAULT date_trunc('month', now()),
  p_month_end timestamptz DEFAULT date_trunc('month', now()) + interval '1 month'
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_quota numeric := 0;
  v_today_start timestamptz := date_trunc('day', now());
  v_today_minutes numeric := 0;
  v_month_minutes numeric := 0;
  v_live_sessions integer := 0;
  v_failed_sessions integer := 0;
  v_active_sessions integer := 0;
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin'::app_role) THEN
    RAISE EXCEPTION 'admin_required';
  END IF;

  SELECT COALESCE(value_numeric, 0)
    INTO v_quota
  FROM public.agora_usage_config
  WHERE key = 'monthly_quota_minutes';

  SELECT
    COALESCE(SUM(CASE WHEN started_at >= v_today_start THEN COALESCE(total_duration_minutes, EXTRACT(EPOCH FROM (COALESCE(ended_at, now()) - started_at)) / 60) ELSE 0 END), 0),
    COALESCE(SUM(COALESCE(total_duration_minutes, EXTRACT(EPOCH FROM (COALESCE(ended_at, now()) - started_at)) / 60)), 0),
    COUNT(*)::integer,
    COUNT(*) FILTER (WHERE status = 'failed')::integer,
    COUNT(*) FILTER (WHERE status IN ('connecting','live'))::integer
  INTO v_today_minutes, v_month_minutes, v_live_sessions, v_failed_sessions, v_active_sessions
  FROM public.agora_usage_sessions
  WHERE started_at >= p_month_start
    AND started_at < p_month_end;

  RETURN jsonb_build_object(
    'today_minutes', ROUND(v_today_minutes, 2),
    'month_minutes', ROUND(v_month_minutes, 2),
    'quota_minutes', v_quota,
    'quota_percent', CASE WHEN v_quota > 0 THEN ROUND((v_month_minutes / v_quota) * 100, 1) ELSE 0 END,
    'live_sessions', v_live_sessions,
    'failed_sessions', v_failed_sessions,
    'active_sessions', v_active_sessions,
    'top_users', COALESCE((
      SELECT jsonb_agg(row_to_json(t))
      FROM (
        SELECT
          aus.user_id,
          p.username,
          p.full_name,
          p.avatar_url,
          COUNT(*)::integer AS live_sessions,
          ROUND(COALESCE(SUM(COALESCE(aus.total_duration_minutes, EXTRACT(EPOCH FROM (COALESCE(aus.ended_at, now()) - aus.started_at)) / 60)), 0), 2) AS total_minutes,
          ROUND(COALESCE(SUM(aus.total_viewer_minutes), 0), 2) AS viewer_minutes,
          (ARRAY_AGG(aus.status ORDER BY aus.started_at DESC))[1] AS latest_status,
          (ARRAY_AGG(aus.error_code ORDER BY aus.started_at DESC))[1] AS latest_error
        FROM public.agora_usage_sessions aus
        LEFT JOIN public.profiles p ON p.id = aus.user_id
        WHERE aus.started_at >= p_month_start
          AND aus.started_at < p_month_end
        GROUP BY aus.user_id, p.username, p.full_name, p.avatar_url
        ORDER BY total_minutes DESC
        LIMIT 10
      ) t
    ), '[]'::jsonb),
    'recent_sessions', COALESCE((
      SELECT jsonb_agg(row_to_json(r))
      FROM (
        SELECT
          aus.id,
          aus.user_id,
          p.username,
          p.full_name,
          aus.live_session_id,
          aus.channel_name,
          aus.stream_type,
          aus.status,
          aus.started_at,
          aus.ended_at,
          ROUND(COALESCE(aus.total_duration_minutes, EXTRACT(EPOCH FROM (COALESCE(aus.ended_at, now()) - aus.started_at)) / 60), 2) AS total_duration_minutes,
          COALESCE(aus.peak_viewers, 0) AS peak_viewers,
          COALESCE(aus.total_viewer_minutes, 0) AS total_viewer_minutes,
          aus.error_code,
          aus.error_message_internal,
          aus.end_reason
        FROM public.agora_usage_sessions aus
        LEFT JOIN public.profiles p ON p.id = aus.user_id
        ORDER BY aus.started_at DESC
        LIMIT 30
      ) r
    ), '[]'::jsonb)
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.start_agora_usage_session(uuid, text, integer, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.finish_agora_usage_session(uuid, text, text, integer, numeric) TO authenticated;
GRANT EXECUTE ON FUNCTION public.record_agora_usage_error(uuid, text, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_agora_usage_admin_stats(timestamptz, timestamptz) TO authenticated;

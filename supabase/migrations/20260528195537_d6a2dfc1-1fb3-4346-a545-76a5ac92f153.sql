CREATE OR REPLACE FUNCTION public.admin_fix_live_replay_orientation(
  p_session_id uuid,
  p_layout text
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_session record;
  v_width int;
  v_height int;
  v_aspect text;
  v_post_ids uuid[];
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'FORBIDDEN: admin only';
  END IF;

  IF p_layout NOT IN ('landscape_16_9', 'portrait_9_16') THEN
    RAISE EXCEPTION 'INVALID_LAYOUT: must be landscape_16_9 or portrait_9_16';
  END IF;

  SELECT id, post_id, live_post_id, recording_layout, mode
    INTO v_session
    FROM public.live_sessions
   WHERE id = p_session_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'SESSION_NOT_FOUND';
  END IF;

  IF p_layout = 'portrait_9_16' THEN
    v_width := 720; v_height := 1280; v_aspect := '9:16';
  ELSE
    v_width := 1280; v_height := 720; v_aspect := '16:9';
  END IF;

  UPDATE public.live_sessions
     SET recording_layout = p_layout,
         recording_width = v_width,
         recording_height = v_height,
         recording_aspect_ratio = v_aspect,
         updated_at = now()
   WHERE id = p_session_id;

  v_post_ids := ARRAY(
    SELECT DISTINCT pid FROM unnest(ARRAY[v_session.post_id, v_session.live_post_id]) AS pid WHERE pid IS NOT NULL
  );

  IF array_length(v_post_ids, 1) IS NOT NULL THEN
    UPDATE public.posts
       SET metadata = COALESCE(metadata, '{}'::jsonb)
                    || jsonb_build_object(
                         'recording_layout', p_layout,
                         'recording_width', v_width,
                         'recording_height', v_height,
                         'recording_aspect_ratio', v_aspect
                       ),
           updated_at = now()
     WHERE id = ANY(v_post_ids);
  END IF;

  BEGIN
    INSERT INTO public.admin_audit_log(admin_id, action, target_type, target_id, details)
    VALUES (
      auth.uid(),
      'fix_live_replay_orientation',
      'live_session',
      p_session_id::text,
      jsonb_build_object(
        'from_layout', v_session.recording_layout,
        'to_layout', p_layout,
        'post_ids', to_jsonb(v_post_ids)
      )
    );
  EXCEPTION WHEN undefined_table THEN
    NULL;
  END;

  RETURN jsonb_build_object(
    'ok', true,
    'session_id', p_session_id,
    'from_layout', v_session.recording_layout,
    'to_layout', p_layout,
    'updated_posts', v_post_ids
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.admin_fix_live_replay_orientation(uuid, text) TO authenticated;
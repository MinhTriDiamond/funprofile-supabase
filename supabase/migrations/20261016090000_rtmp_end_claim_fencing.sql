-- Fence RTMP end workers and make the final session/post/replay writes atomic.
-- Do not apply in production without the project's migration approval process.

ALTER TABLE public.live_sessions
  ADD COLUMN IF NOT EXISTS end_claim_token uuid;

CREATE OR REPLACE FUNCTION public.finalize_rtmp_live_session_end(
  p_live_session_id uuid,
  p_claim_token uuid,
  p_session_patch jsonb,
  p_post_id uuid DEFAULT NULL,
  p_post_patch jsonb DEFAULT NULL,
  p_replay_patch jsonb DEFAULT NULL
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_session public.live_sessions%ROWTYPE;
  v_affected integer;
BEGIN
  SELECT * INTO v_session
  FROM public.live_sessions
  WHERE id = p_live_session_id
    AND mode = 'rtmp_obs'
    AND status = 'ending'
    AND ended_at IS NULL
    AND end_claim_token = p_claim_token
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN false;
  END IF;

  IF p_post_id IS NOT NULL AND p_post_id IS DISTINCT FROM COALESCE(v_session.post_id, v_session.live_post_id) THEN
    RAISE EXCEPTION 'RTMP post does not belong to the claimed session';
  END IF;

  IF p_post_id IS NOT NULL THEN
    UPDATE public.posts
    SET post_type = COALESCE(p_post_patch->>'post_type', post_type),
        video_url = CASE WHEN p_post_patch ? 'video_url' THEN p_post_patch->>'video_url' ELSE video_url END,
        replay_status = CASE WHEN p_post_patch ? 'replay_status' THEN p_post_patch->>'replay_status' ELSE replay_status END,
        playback_provider = CASE WHEN p_post_patch ? 'playback_provider' THEN p_post_patch->>'playback_provider' ELSE playback_provider END,
        replay_ready = CASE WHEN p_post_patch ? 'replay_ready' THEN (p_post_patch->>'replay_ready')::boolean ELSE replay_ready END,
        processing_message = CASE WHEN p_post_patch ? 'processing_message' THEN p_post_patch->>'processing_message' ELSE processing_message END,
        metadata = COALESCE(metadata, '{}'::jsonb) || COALESCE(p_post_patch->'metadata', '{}'::jsonb),
        updated_at = COALESCE(NULLIF(p_post_patch->>'updated_at', '')::timestamptz, now())
    WHERE id = p_post_id;
    GET DIAGNOSTICS v_affected = ROW_COUNT;
    IF v_affected = 0 THEN
      RAISE EXCEPTION 'Linked RTMP live post was not found';
    END IF;
  END IF;

  IF p_replay_patch IS NOT NULL THEN
    INSERT INTO public.live_replays (
      user_id, live_session_id, chunked_recording_id, stream_uid,
      cloudflare_video_uid, playback_hls, playback_dash, playback_mp4,
      cloudflare_playback_url, status, processing_started_at,
      storage_provider, playback_provider, archive_status, archive_error,
      cloudflare_vod_enabled, last_cf_response
    ) VALUES (
      (p_replay_patch->>'user_id')::uuid,
      p_live_session_id,
      p_live_session_id,
      p_replay_patch->>'stream_uid',
      p_replay_patch->>'cloudflare_video_uid',
      p_replay_patch->>'playback_hls',
      p_replay_patch->>'playback_dash',
      p_replay_patch->>'playback_mp4',
      p_replay_patch->>'cloudflare_playback_url',
      COALESCE(p_replay_patch->>'status', 'ready')::public.live_replay_status,
      COALESCE(NULLIF(p_replay_patch->>'processing_started_at', '')::timestamptz, now()),
      p_replay_patch->>'storage_provider',
      p_replay_patch->>'playback_provider',
      p_replay_patch->>'archive_status',
      p_replay_patch->>'archive_error',
      COALESCE((p_replay_patch->>'cloudflare_vod_enabled')::boolean, true),
      p_replay_patch->'last_cf_response'
    )
    ON CONFLICT (chunked_recording_id) DO UPDATE SET
      user_id = EXCLUDED.user_id,
      live_session_id = EXCLUDED.live_session_id,
      stream_uid = EXCLUDED.stream_uid,
      cloudflare_video_uid = EXCLUDED.cloudflare_video_uid,
      playback_hls = EXCLUDED.playback_hls,
      playback_dash = EXCLUDED.playback_dash,
      playback_mp4 = EXCLUDED.playback_mp4,
      cloudflare_playback_url = EXCLUDED.cloudflare_playback_url,
      status = EXCLUDED.status,
      processing_started_at = EXCLUDED.processing_started_at,
      storage_provider = EXCLUDED.storage_provider,
      playback_provider = EXCLUDED.playback_provider,
      archive_status = EXCLUDED.archive_status,
      archive_error = EXCLUDED.archive_error,
      cloudflare_vod_enabled = EXCLUDED.cloudflare_vod_enabled,
      last_cf_response = EXCLUDED.last_cf_response,
      updated_at = now();
  END IF;

  UPDATE public.live_sessions
  SET status = p_session_patch->>'status',
      connection_status = p_session_patch->>'connection_status',
      ended_at = NULLIF(p_session_patch->>'ended_at', '')::timestamptz,
      end_reason = p_session_patch->>'end_reason',
      auto_end_reason = p_session_patch->>'auto_end_reason',
      source_connected = (p_session_patch->>'source_connected')::boolean,
      last_disconnected_at = NULLIF(p_session_patch->>'last_disconnected_at', '')::timestamptz,
      signal_status = p_session_patch->>'signal_status',
      signal_lost_at = NULLIF(p_session_patch->>'signal_lost_at', '')::timestamptz,
      reconnect_deadline_at = NULLIF(p_session_patch->>'reconnect_deadline_at', '')::timestamptz,
      recording_status = p_session_patch->>'recording_status',
      processing_started_at = NULLIF(p_session_patch->>'processing_started_at', '')::timestamptz,
      archive_status = p_session_patch->>'archive_status',
      archive_error = p_session_patch->>'archive_error',
      playback_provider = p_session_patch->>'playback_provider',
      storage_provider = p_session_patch->>'storage_provider',
      playback_url = p_session_patch->>'playback_url',
      hls_url = p_session_patch->>'hls_url',
      cloudflare_video_uid = p_session_patch->>'cloudflare_video_uid',
      live_input_disabled_at = NULLIF(p_session_patch->>'live_input_disabled_at', '')::timestamptz,
      live_input_disable_error = p_session_patch->>'live_input_disable_error',
      is_input_armed = (p_session_patch->>'is_input_armed')::boolean,
      armed_session_token = p_session_patch->>'armed_session_token',
      last_armed_heartbeat_at = NULLIF(p_session_patch->>'last_armed_heartbeat_at', '')::timestamptz,
      updated_at = COALESCE(NULLIF(p_session_patch->>'updated_at', '')::timestamptz, now()),
      end_claim_token = NULL
  WHERE id = p_live_session_id
    AND status = 'ending'
    AND ended_at IS NULL
    AND end_claim_token = p_claim_token;

  GET DIAGNOSTICS v_affected = ROW_COUNT;
  IF v_affected = 0 THEN
    RAISE EXCEPTION 'RTMP end claim was lost before finalization';
  END IF;

  RETURN true;
END;
$$;

REVOKE ALL ON FUNCTION public.finalize_rtmp_live_session_end(uuid, uuid, jsonb, uuid, jsonb, jsonb)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.finalize_rtmp_live_session_end(uuid, uuid, jsonb, uuid, jsonb, jsonb)
  TO service_role;

-- Rollback after reverting the Edge Function code:
-- DROP FUNCTION public.finalize_rtmp_live_session_end(uuid, uuid, jsonb, uuid, jsonb, jsonb);
-- ALTER TABLE public.live_sessions DROP COLUMN end_claim_token;

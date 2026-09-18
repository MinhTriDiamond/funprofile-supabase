-- Atomic CAS lease acquire
CREATE OR REPLACE FUNCTION public.archive_acquire_lease(p_id uuid, p_minutes int DEFAULT 10)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  affected int;
BEGIN
  UPDATE live_replays
  SET archive_lease_until = now() + make_interval(mins => p_minutes)
  WHERE id = p_id
    AND (archive_lease_until IS NULL OR archive_lease_until < now());
  GET DIAGNOSTICS affected = ROW_COUNT;
  RETURN affected > 0;
END;
$$;

-- Generic jsonb patch (uses jsonb_populate_record so NULL JSON values set NULL)
CREATE OR REPLACE FUNCTION public.live_replays_patch(p_id uuid, p_patch jsonb)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  r live_replays%ROWTYPE;
  merged live_replays%ROWTYPE;
BEGIN
  SELECT * INTO r FROM live_replays WHERE id = p_id FOR UPDATE;
  IF NOT FOUND THEN RETURN; END IF;
  merged := jsonb_populate_record(r, p_patch);
  UPDATE live_replays SET
    archive_phase           = merged.archive_phase,
    archive_status          = merged.archive_status,
    archive_attempts        = merged.archive_attempts,
    archive_lease_until     = merged.archive_lease_until,
    archive_next_retry_at   = merged.archive_next_retry_at,
    archive_error           = merged.archive_error,
    archive_started_at      = merged.archive_started_at,
    archived_at             = merged.archived_at,
    last_error_at           = merged.last_error_at,
    error_message           = merged.error_message,
    multipart_upload_id     = merged.multipart_upload_id,
    multipart_parts         = merged.multipart_parts,
    mp4_export_started_at   = merged.mp4_export_started_at,
    cloudflare_mp4_download_url = merged.cloudflare_mp4_download_url,
    stream_deleted_at       = merged.stream_deleted_at,
    cloudflare_deleted_at   = merged.cloudflare_deleted_at,
    delete_stream_error     = merged.delete_stream_error,
    r2_object_key           = merged.r2_object_key,
    r2_video_url            = merged.r2_video_url,
    r2_archived_at          = merged.r2_archived_at,
    r2_verified_at          = merged.r2_verified_at,
    replay_post_id          = merged.replay_post_id,
    replay_ready_at         = merged.replay_ready_at,
    posted_at               = merged.posted_at,
    duration_seconds        = merged.duration_seconds,
    deleted_at              = merged.deleted_at
  WHERE id = p_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.archive_acquire_lease(uuid, int) TO service_role;
GRANT EXECUTE ON FUNCTION public.live_replays_patch(uuid, jsonb) TO service_role;
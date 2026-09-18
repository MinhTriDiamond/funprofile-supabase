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
    archive_phase                = merged.archive_phase,
    archive_status               = merged.archive_status,
    archive_attempts             = merged.archive_attempts,
    archive_lease_until          = merged.archive_lease_until,
    archive_next_retry_at        = merged.archive_next_retry_at,
    archive_error                = merged.archive_error,
    archived_at                  = merged.archived_at,
    last_error_at                = merged.last_error_at,
    error_message                = merged.error_message,
    multipart_upload_id          = merged.multipart_upload_id,
    multipart_parts_done         = merged.multipart_parts_done,
    multipart_bytes_done         = merged.multipart_bytes_done,
    multipart_total_parts        = merged.multipart_total_parts,
    multipart_part_size          = merged.multipart_part_size,
    mp4_export_started_at        = merged.mp4_export_started_at,
    mp4_ready_at                 = merged.mp4_ready_at,
    mp4_total_bytes              = merged.mp4_total_bytes,
    cloudflare_mp4_download_url  = merged.cloudflare_mp4_download_url,
    stream_deleted_at            = merged.stream_deleted_at,
    cloudflare_deleted_at        = merged.cloudflare_deleted_at,
    delete_stream_error          = merged.delete_stream_error,
    r2_object_key                = merged.r2_object_key,
    r2_bucket                    = merged.r2_bucket,
    r2_video_url                 = merged.r2_video_url,
    r2_verified_at               = merged.r2_verified_at,
    replay_post_id               = merged.replay_post_id,
    replay_ready_at              = merged.replay_ready_at,
    posted_at                    = merged.posted_at,
    auto_posted_at               = merged.auto_posted_at,
    duration_seconds             = merged.duration_seconds,
    deleted_at                   = merged.deleted_at,
    filesize_bytes               = merged.filesize_bytes,
    playback_mp4                 = merged.playback_mp4,
    playback_provider            = merged.playback_provider,
    storage_provider             = merged.storage_provider,
    status                       = merged.status,
    expires_at                   = merged.expires_at,
    updated_at                   = now()
  WHERE id = p_id;
END;
$$;
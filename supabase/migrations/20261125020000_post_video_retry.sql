-- Owner retry is limited to resumable operations. It cannot create another Stream import.
CREATE FUNCTION public.request_post_video_retry(p_attachment_id uuid) RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE j post_video_processing_jobs; target text;
BEGIN
 SELECT jobs.* INTO j FROM post_video_processing_jobs jobs
 JOIN post_attachments a ON a.id=jobs.attachment_id AND a.post_id=jobs.post_id
 JOIN posts p ON p.id=jobs.post_id
 WHERE jobs.attachment_id=p_attachment_id AND jobs.user_id=auth.uid() AND p.user_id=auth.uid()
 AND p.deleted_at IS NULL AND NOT jobs.cancelled AND jobs.phase='needs_review'
 AND (jobs.lease_until IS NULL OR jobs.lease_until<clock_timestamp())
 AND a.file_url=coalesce(jobs.gateway_url,jobs.source_url)
 ORDER BY jobs.created_at DESC LIMIT 1 FOR UPDATE OF jobs;
 IF j.id IS NULL THEN RETURN false; END IF;
 target:=j.runtime->>'retryPhase';
 IF target IS NULL OR target NOT IN ('encoding','mp4_wait','r2_upload','r2_verify','publishing','stream_delete_pending')
 OR (j.published_at IS NOT NULL AND target<>'stream_delete_pending') THEN RETURN false; END IF;
 UPDATE post_video_processing_jobs SET phase=target,attempts=0,last_error=NULL,next_attempt_at=clock_timestamp(),lease_until=NULL,updated_at=clock_timestamp() WHERE id=j.id;
 RETURN true;
END $$;
REVOKE ALL ON FUNCTION public.request_post_video_retry(uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.request_post_video_retry(uuid) TO authenticated;

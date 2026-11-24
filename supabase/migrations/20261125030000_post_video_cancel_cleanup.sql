CREATE FUNCTION public.claim_post_video_cleanup(p_job_id uuid,p_lease_token uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE j post_video_processing_jobs;
BEGIN
 IF p_lease_token IS NULL THEN RETURN NULL; END IF;
 UPDATE post_video_processing_jobs SET lease_token=p_lease_token,lease_until=clock_timestamp()+interval '180 seconds'
 WHERE id=p_job_id AND cancelled AND phase='cancelled' AND NOT runtime @> '{"cleanupDone":true}'
 AND next_attempt_at<=clock_timestamp() AND (lease_until IS NULL OR lease_until<clock_timestamp())
 AND (canary OR coalesce((SELECT delete_enabled FROM post_video_processing_control WHERE id),false)) RETURNING * INTO j;
 RETURN CASE WHEN j.id IS NULL THEN NULL ELSE to_jsonb(j) END;
END $$;
CREATE FUNCTION public.advance_post_video_cleanup(p_job_id uuid,p_lease_token uuid,p_patch jsonb) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE j post_video_processing_jobs;
BEGIN
 IF p_patch-ARRAY['runtime','attempts','last_error','next_attempt_at','stream_deleted_at','release_lease']<>'{}'::jsonb THEN RAISE EXCEPTION 'Unsupported cleanup patch'; END IF;
 UPDATE post_video_processing_jobs SET
 runtime=CASE WHEN p_patch?'runtime' THEN p_patch->'runtime' ELSE runtime END,
 attempts=CASE WHEN p_patch?'attempts' THEN (p_patch->>'attempts')::integer ELSE attempts END,
 last_error=CASE WHEN p_patch?'last_error' THEN p_patch->>'last_error' ELSE last_error END,
 next_attempt_at=CASE WHEN p_patch?'next_attempt_at' THEN (p_patch->>'next_attempt_at')::timestamptz ELSE next_attempt_at END,
 stream_deleted_at=CASE WHEN p_patch?'stream_deleted_at' THEN (p_patch->>'stream_deleted_at')::timestamptz ELSE stream_deleted_at END,
 lease_until=CASE WHEN coalesce((p_patch->>'release_lease')::boolean,false) THEN NULL ELSE lease_until END,updated_at=clock_timestamp()
 WHERE id=p_job_id AND cancelled AND phase='cancelled' AND lease_token=p_lease_token AND lease_until>clock_timestamp() RETURNING * INTO j;
 RETURN CASE WHEN j.id IS NULL THEN NULL ELSE to_jsonb(j) END;
END $$;
REVOKE ALL ON FUNCTION public.claim_post_video_cleanup(uuid,uuid),public.advance_post_video_cleanup(uuid,uuid,jsonb) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.claim_post_video_cleanup(uuid,uuid),public.advance_post_video_cleanup(uuid,uuid,jsonb) TO service_role;

CREATE FUNCTION public.cancel_changed_post_video_job() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
 IF TG_TABLE_NAME='posts' THEN
  IF NEW.deleted_at IS NOT NULL THEN UPDATE post_video_processing_jobs SET cancelled=true,phase='cancelled',next_attempt_at=clock_timestamp(),updated_at=clock_timestamp() WHERE post_id=NEW.id AND NOT cancelled; END IF;
 ELSE
  UPDATE post_video_processing_jobs SET cancelled=true,phase='cancelled',next_attempt_at=clock_timestamp(),updated_at=clock_timestamp()
  WHERE attachment_id=NEW.id AND NOT cancelled AND
   (NEW.file_url IS DISTINCT FROM coalesce(gateway_url,source_url)
    OR NEW.storage_key IS DISTINCT FROM CASE WHEN published_at IS NULL THEN source_key ELSE output_key END
    OR NEW.size_bytes IS DISTINCT FROM CASE WHEN published_at IS NULL THEN source_size ELSE output_size END);
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER post_video_soft_deleted BEFORE UPDATE OF deleted_at ON public.posts FOR EACH ROW EXECUTE FUNCTION public.cancel_changed_post_video_job();
CREATE TRIGGER post_video_source_replaced BEFORE UPDATE OF file_url,storage_key,size_bytes ON public.post_attachments FOR EACH ROW EXECUTE FUNCTION public.cancel_changed_post_video_job();
REVOKE ALL ON FUNCTION public.cancel_changed_post_video_job() FROM PUBLIC,anon,authenticated;

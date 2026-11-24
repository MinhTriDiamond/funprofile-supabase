-- Keep the legacy primary-video edit path atomic with feed media and attachment generations.
CREATE FUNCTION public.sync_post_video_primary_before_edit() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
 IF NEW.video_url IS NOT DISTINCT FROM OLD.video_url THEN RETURN NEW; END IF;
 -- Publication already updated its attachment and explicitly replaces media_urls itself.
 IF EXISTS(SELECT 1 FROM post_video_processing_jobs WHERE post_id=NEW.id AND published_at IS NOT NULL AND gateway_url=NEW.video_url AND source_url=OLD.video_url AND phase='stream_delete_pending') THEN RETURN NEW; END IF;
 UPDATE post_video_processing_jobs SET cancelled=true,phase='cancelled',next_attempt_at=clock_timestamp(),updated_at=clock_timestamp()
 WHERE post_id=NEW.id AND NOT cancelled AND (source_url=OLD.video_url OR gateway_url=OLD.video_url);
 IF jsonb_typeof(NEW.media_urls)='array' THEN
  SELECT coalesce(jsonb_agg(CASE WHEN e=to_jsonb(OLD.video_url) THEN to_jsonb(NEW.video_url)
    WHEN jsonb_typeof(e)='object' AND e->>'url'=OLD.video_url THEN jsonb_set(e,'{url}',to_jsonb(NEW.video_url)) ELSE e END ORDER BY ord),'[]')
   INTO NEW.media_urls FROM jsonb_array_elements(NEW.media_urls) WITH ORDINALITY m(e,ord)
   WHERE NEW.video_url IS NOT NULL OR (e IS DISTINCT FROM to_jsonb(OLD.video_url) AND (e->>'url') IS DISTINCT FROM OLD.video_url);
  IF NEW.video_url IS NOT NULL AND NOT EXISTS(SELECT 1 FROM jsonb_array_elements(NEW.media_urls) e WHERE e=to_jsonb(NEW.video_url) OR e->>'url'=NEW.video_url) THEN
   NEW.media_urls:=NEW.media_urls||jsonb_build_array(jsonb_build_object('url',NEW.video_url,'type','video'));
  END IF;
 END IF;
 NEW.metadata:=jsonb_set(coalesce(NEW.metadata,'{}'),'{video_processing_by_attachment}',coalesce(NEW.metadata->'video_processing_by_attachment','{}')-ARRAY(SELECT id::text FROM post_attachments WHERE post_id=NEW.id AND file_url=OLD.video_url));
 RETURN NEW;
END $$;
CREATE FUNCTION public.sync_post_video_primary_after_edit() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE source_session record; affected integer;
BEGIN
 IF NEW.video_url IS NOT DISTINCT FROM OLD.video_url THEN RETURN NEW; END IF;
 IF EXISTS(SELECT 1 FROM post_video_processing_jobs WHERE post_id=NEW.id AND published_at IS NOT NULL AND gateway_url=NEW.video_url AND source_url=OLD.video_url AND phase='stream_delete_pending') THEN RETURN NEW; END IF;
 IF NEW.video_url IS NULL THEN DELETE FROM post_attachments WHERE post_id=NEW.id AND file_type='video' AND file_url=OLD.video_url; RETURN NEW; END IF;
 SELECT r2_key,file_size INTO source_session FROM video_upload_sessions
 WHERE user_id=NEW.user_id AND status='completed' AND NEW.video_url='https://media.fun.rich/'||r2_key ORDER BY created_at DESC LIMIT 1;
 UPDATE post_attachments SET file_url=NEW.video_url,storage_key=source_session.r2_key,size_bytes=source_session.file_size,mime_type=NULL,transform_meta='{}'
 WHERE post_id=NEW.id AND file_type='video' AND file_url=OLD.video_url;
 GET DIAGNOSTICS affected=ROW_COUNT;
 IF affected=0 AND NOT EXISTS(SELECT 1 FROM post_attachments WHERE post_id=NEW.id AND file_url=NEW.video_url) THEN
  INSERT INTO post_attachments(post_id,file_url,storage_key,file_type,size_bytes,sort_order)
   VALUES(NEW.id,NEW.video_url,source_session.r2_key,'video',source_session.file_size,coalesce((SELECT max(sort_order)+1 FROM post_attachments WHERE post_id=NEW.id),0));
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER post_video_primary_edit_before BEFORE UPDATE OF video_url ON public.posts FOR EACH ROW EXECUTE FUNCTION public.sync_post_video_primary_before_edit();
CREATE TRIGGER post_video_primary_edit_after AFTER UPDATE OF video_url ON public.posts FOR EACH ROW EXECUTE FUNCTION public.sync_post_video_primary_after_edit();
REVOKE ALL ON FUNCTION public.sync_post_video_primary_before_edit(),public.sync_post_video_primary_after_edit() FROM PUBLIC,anon,authenticated;

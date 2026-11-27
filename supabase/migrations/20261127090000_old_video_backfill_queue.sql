-- Explicit, reviewed inventory only; no automatic discovery or user admission.
CREATE TABLE public.post_video_backfill_control (
 id boolean PRIMARY KEY DEFAULT true CHECK(id),
 enabled boolean NOT NULL DEFAULT false,
 updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT,INSERT,UPDATE,DELETE ON public.post_video_backfill_control TO authenticated;
GRANT ALL ON public.post_video_backfill_control TO service_role;
ALTER TABLE public.post_video_backfill_control ENABLE ROW LEVEL SECURITY;
INSERT INTO public.post_video_backfill_control(id) VALUES(true);
CREATE TABLE public.post_video_backfill_items (
 id uuid PRIMARY KEY,
 run_name text NOT NULL,
 post_id uuid NOT NULL,
 user_id uuid NOT NULL,
 source_url text NOT NULL,
 source_key text NOT NULL,
 kind text NOT NULL CHECK(kind IN('feed','webcam')),
 status text NOT NULL DEFAULT 'pending' CHECK(status IN('pending','inspecting','queued','skipped','held')),
 reason text,
 source_size bigint,
 source_etag text,
 probe jsonb,
 snapshot jsonb,
 job_id uuid,
 lease uuid,
 lease_until timestamptz,
 attempts integer NOT NULL DEFAULT 0,
 created_at timestamptz NOT NULL DEFAULT now(),
 updated_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(run_name,post_id,source_url)
);
GRANT SELECT,INSERT,UPDATE,DELETE ON public.post_video_backfill_items TO authenticated;
GRANT ALL ON public.post_video_backfill_items TO service_role;
ALTER TABLE public.post_video_backfill_items ENABLE ROW LEVEL SECURITY;
CREATE INDEX post_video_backfill_due ON public.post_video_backfill_items(created_at,id) WHERE status IN('pending','inspecting');

CREATE FUNCTION public.claim_post_video_backfill(p_lease uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE q post_video_backfill_items;
BEGIN
 PERFORM pg_advisory_xact_lock(hashtextextended('post_video_backfill_admission',0));
 IF p_lease IS NULL OR NOT coalesce((SELECT enabled FROM post_video_backfill_control WHERE id),false) OR NOT coalesce((SELECT enabled AND import_enabled AND publish_enabled AND delete_enabled FROM post_video_processing_control WHERE id),false) THEN RETURN NULL; END IF;
 -- New uploads have priority. Unknown billable VODs require review before more imports.
 IF EXISTS(SELECT 1 FROM post_video_processing_jobs WHERE (NOT cancelled AND phase NOT IN('complete','cancelled','failed','needs_review')) OR (stream_uid IS NOT NULL AND stream_deleted_at IS NULL) OR (runtime->>'createStarted'='true' AND stream_uid IS NULL AND NOT coalesce((runtime->>'cleanupDone')::boolean,false))) THEN RETURN NULL; END IF;
 IF EXISTS(SELECT 1 FROM post_video_backfill_items WHERE status='inspecting' AND lease_until>clock_timestamp()) THEN RETURN NULL; END IF;
 UPDATE post_video_backfill_items SET status='held',reason='inspection_retry_limit',updated_at=clock_timestamp() WHERE status='inspecting' AND lease_until<=clock_timestamp() AND attempts>=3;
 SELECT * INTO q FROM post_video_backfill_items WHERE status='pending' OR status='inspecting' AND lease_until<=clock_timestamp() AND attempts<3 ORDER BY created_at,id FOR UPDATE SKIP LOCKED LIMIT 1;
 IF q.id IS NULL THEN RETURN NULL; END IF;
 UPDATE post_video_backfill_items SET status='inspecting',lease=p_lease,lease_until=clock_timestamp()+interval '180 seconds',attempts=attempts+1,updated_at=clock_timestamp() WHERE id=q.id RETURNING * INTO q;
 RETURN to_jsonb(q);
END $$;

CREATE FUNCTION public.finish_post_video_backfill(p_id uuid,p_lease uuid,p_status text,p_reason text,p_probe jsonb DEFAULT '{}') RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
 IF p_status NOT IN('skipped','held') THEN RAISE EXCEPTION 'Invalid inspection result'; END IF;
 UPDATE post_video_backfill_items SET status=p_status,reason=left(p_reason,120),probe=p_probe,lease=NULL,lease_until=NULL,updated_at=clock_timestamp() WHERE id=p_id AND status='inspecting' AND lease=p_lease AND lease_until>clock_timestamp();
 RETURN FOUND;
END $$;

CREATE FUNCTION public.admit_post_video_backfill(p_id uuid,p_lease uuid,p_size bigint,p_etag text,p_probe jsonb DEFAULT '{}') RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE q post_video_backfill_items; p posts; a post_attachments; j post_video_processing_jobs; sid uuid; legacy boolean; runtime_data jsonb; new_attachment boolean:=false;
BEGIN
 PERFORM pg_advisory_xact_lock(hashtextextended('post_video_backfill_admission',0));
 SELECT * INTO q FROM post_video_backfill_items WHERE id=p_id AND status='inspecting' AND lease=p_lease AND lease_until>clock_timestamp() FOR UPDATE;
 IF q.id IS NULL OR NOT coalesce((SELECT enabled FROM post_video_backfill_control WHERE id),false) OR NOT coalesce((SELECT enabled AND import_enabled AND publish_enabled AND delete_enabled FROM post_video_processing_control WHERE id),false) THEN RETURN NULL; END IF;
 IF p_size IS NULL OR p_size<=0 OR p_size>10737418240 OR p_etag IS NULL OR length(p_etag)<2 OR length(p_etag)>256 THEN RAISE EXCEPTION 'Invalid source proof'; END IF;
 IF EXISTS(SELECT 1 FROM post_video_processing_jobs WHERE (NOT cancelled AND phase NOT IN('complete','cancelled','failed','needs_review')) OR (stream_uid IS NOT NULL AND stream_deleted_at IS NULL) OR (runtime->>'createStarted'='true' AND stream_uid IS NULL AND NOT coalesce((runtime->>'cleanupDone')::boolean,false))) THEN RETURN NULL; END IF;
 SELECT * INTO p FROM posts WHERE id=q.post_id AND user_id=q.user_id AND deleted_at IS NULL AND visibility='public' FOR UPDATE;
 IF p.id IS NULL OR NOT(p.video_url=q.source_url OR coalesce(p.media_urls,'[]') @> jsonb_build_array(jsonb_build_object('type','video','url',q.source_url)) OR EXISTS(SELECT 1 FROM post_attachments WHERE post_id=p.id AND file_type='video' AND file_url=q.source_url)) THEN
  UPDATE post_video_backfill_items SET status='held',reason='post_changed',lease=NULL,lease_until=NULL WHERE id=q.id; RETURN NULL;
 END IF;
 IF coalesce(p.metadata->>'live_mode','') LIKE 'rtmp%' OR EXISTS(SELECT 1 FROM live_sessions WHERE mode='rtmp_obs' AND (p.id IN(post_id,live_post_id,replay_post_id) OR r2_object_key=q.source_key OR r2_video_url=q.source_url)) THEN
  UPDATE post_video_backfill_items SET status='skipped',reason='excluded_rtmp',lease=NULL,lease_until=NULL WHERE id=q.id; RETURN NULL;
 END IF;
 IF q.source_url NOT IN('https://media.fun.rich/'||q.source_key,'https://pub-e83e74b0726742fbb6a60bc08f95624b.r2.dev/'||q.source_key) OR q.source_key ~ '(^|/)\.\.?(/|$)' OR q.source_key ~ '[\\%]' THEN RAISE EXCEPTION 'Invalid source URL'; END IF;
 runtime_data:=jsonb_build_object('sourceEtag',p_etag,'backfillRun',q.run_name,'backfillKind',q.kind);
 IF q.kind='feed' THEN
  IF p.post_type<>'normal' OR p.metadata ? 'live_session_id' OR EXISTS(SELECT 1 FROM live_sessions WHERE p.id IN(post_id,live_post_id,replay_post_id)) THEN
   UPDATE post_video_backfill_items SET status='held',reason='live_provenance',lease=NULL,lease_until=NULL WHERE id=q.id; RETURN NULL;
  END IF;
  legacy:=q.source_key NOT LIKE 'videos/'||q.user_id::text||'/%';
  IF legacy THEN
   IF q.source_key !~* '^videos/[A-Za-z0-9_.-]+\.(mov|mp4|webm|mkv)$' OR strpos(q.source_key,'..')>0 THEN RAISE EXCEPTION 'Invalid legacy source'; END IF;
   runtime_data:=runtime_data||jsonb_build_object('legacySourceKey',q.source_key,'legacySourceOwner',q.user_id::text);
  ELSIF q.source_key !~* '^videos/[a-f0-9-]{36}/[A-Za-z0-9_.-]+\.(mov|mp4|webm|mkv)$' THEN RAISE EXCEPTION 'Invalid owned source'; END IF;
 ELSE
  SELECT id INTO sid FROM live_sessions WHERE mode='agora_webcam' AND ended_at IS NOT NULL AND status IN('ended','archived','offline') AND coalesce(host_user_id,owner_id,user_id)=q.user_id AND p.id IN(post_id,live_post_id,replay_post_id) AND q.source_key='replays/'||q.user_id::text||'/'||id::text||'/replay.mp4' LIMIT 1 FOR SHARE;
  IF sid IS NULL OR p.post_type<>'live_replay' THEN
   UPDATE post_video_backfill_items SET status='held',reason='webcam_provenance',lease=NULL,lease_until=NULL WHERE id=q.id; RETURN NULL;
  END IF;
  legacy:=true;
  runtime_data:=runtime_data||jsonb_build_object('legacySourceOwner',q.user_id::text,'legacyWebcamSession',sid::text);
 END IF;
 IF EXISTS(SELECT 1 FROM post_video_processing_jobs WHERE source_key=q.source_key OR source_url=q.source_url) THEN
  UPDATE post_video_backfill_items SET status='skipped',reason='source_already_registered',lease=NULL,lease_until=NULL WHERE id=q.id; RETURN NULL;
 END IF;
 SELECT * INTO a FROM post_attachments WHERE post_id=p.id AND file_type='video' AND file_url=q.source_url ORDER BY sort_order,id LIMIT 1 FOR UPDATE;
 UPDATE post_video_backfill_items SET snapshot=jsonb_build_object('post',to_jsonb(p),'attachment',CASE WHEN a.id IS NOT NULL THEN to_jsonb(a) ELSE NULL END) WHERE id=q.id;
 IF a.id IS NULL THEN
  INSERT INTO post_attachments(post_id,file_url,storage_key,file_type,mime_type,size_bytes,sort_order) VALUES(p.id,q.source_url,q.source_key,'video','video/mp4',p_size,coalesce((SELECT ord-1 FROM jsonb_array_elements(coalesce(p.media_urls,'[]')) WITH ORDINALITY AS m(e,ord) WHERE e->>'url'=q.source_url LIMIT 1),0)) RETURNING * INTO a;
  new_attachment:=true;
 ELSIF a.storage_key IS DISTINCT FROM q.source_key OR a.size_bytes IS NOT NULL AND a.size_bytes<>p_size THEN
  UPDATE post_video_backfill_items SET status='held',reason='attachment_changed',lease=NULL,lease_until=NULL WHERE id=q.id; RETURN NULL;
 ELSIF a.size_bytes IS NULL THEN
  UPDATE post_attachments SET size_bytes=p_size WHERE id=a.id RETURNING * INTO a;
 END IF;
 -- The normal enqueue trigger may have admitted an attested newer source already.
 SELECT * INTO j FROM post_video_processing_jobs WHERE attachment_id=a.id AND source_key=q.source_key ORDER BY created_at LIMIT 1;
 IF j.id IS NULL THEN
  INSERT INTO post_video_processing_jobs(user_id,post_id,attachment_id,source_key,source_url,source_size,source_hash,canary,delete_approved,runtime)
  VALUES(q.user_id,p.id,a.id,q.source_key,q.source_url,p_size,'backfill-etag:'||p_etag,legacy,legacy,runtime_data) RETURNING * INTO j;
 END IF;
 UPDATE post_video_backfill_items SET status='queued',job_id=j.id,source_size=p_size,source_etag=p_etag,probe=p_probe,reason=NULL,lease=NULL,lease_until=NULL,updated_at=clock_timestamp() WHERE id=q.id;
 RETURN jsonb_build_object('id',q.id,'jobId',j.id,'attachmentId',a.id,'newAttachment',new_attachment,'kind',q.kind);
END $$;
REVOKE ALL ON FUNCTION public.claim_post_video_backfill(uuid),public.finish_post_video_backfill(uuid,uuid,text,text,jsonb),public.admit_post_video_backfill(uuid,uuid,bigint,text,jsonb) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.claim_post_video_backfill(uuid),public.finish_post_video_backfill(uuid,uuid,text,text,jsonb),public.admit_post_video_backfill(uuid,uuid,bigint,text,jsonb) TO service_role;

-- Keep the feed replay resolver on the verified output; other replay references remain protected.
CREATE OR REPLACE FUNCTION public.publish_post_video_output(p_job_id uuid,p_lease_token uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE j post_video_processing_jobs; a post_attachments; p posts; base text; new_url text; published_meta jsonb; meta_key text;
BEGIN
  SELECT * INTO j FROM post_video_processing_jobs WHERE id=p_job_id FOR UPDATE;
  IF j.id IS NULL OR j.cancelled OR j.lease_token IS DISTINCT FROM p_lease_token OR j.lease_until IS NULL OR j.lease_until<=clock_timestamp() THEN RETURN NULL; END IF;
  SELECT * INTO p FROM posts WHERE id=j.post_id FOR UPDATE;
  SELECT * INTO a FROM post_attachments WHERE id=j.attachment_id AND post_id=j.post_id FOR UPDATE;
  IF p.id IS NULL OR p.deleted_at IS NOT NULL OR a.id IS NULL OR p.user_id<>j.user_id THEN RETURN NULL; END IF;
  IF j.runtime ? 'backfillRun' AND (coalesce(p.metadata->>'live_mode','') LIKE 'rtmp%' OR EXISTS(SELECT 1 FROM live_sessions WHERE mode='rtmp_obs' AND (p.id IN(post_id,live_post_id,replay_post_id) OR r2_object_key=j.source_key OR r2_video_url=j.source_url))) THEN RETURN NULL; END IF;
  IF j.published_at IS NOT NULL THEN
    RETURN CASE WHEN a.file_url=j.gateway_url THEN to_jsonb(j) ELSE NULL END;
  END IF;
  IF p.visibility IS DISTINCT FROM 'public' OR j.phase<>'publishing' OR a.file_url<>j.source_url OR a.storage_key IS DISTINCT FROM j.source_key OR a.size_bytes IS DISTINCT FROM j.source_size
     OR j.output_bucket IS DISTINCT FROM (SELECT output_bucket FROM post_video_processing_control WHERE id)
     OR j.output_verified_at IS NULL OR j.output_key IS NULL OR j.output_size IS NULL OR j.output_size>=j.source_size THEN RETURN NULL; END IF;
  IF NOT (coalesce((SELECT publish_enabled FROM post_video_processing_control WHERE id),false) OR j.canary) THEN RETURN NULL; END IF;
  SELECT media_base_url INTO base FROM post_video_processing_control WHERE id;
  IF base NOT LIKE 'https://%' THEN RAISE EXCEPTION 'Invalid media gateway'; END IF;
  new_url := rtrim(base,'/')||'/'||j.attachment_id::text||'/'||j.source_generation::text||'.mp4';
  published_meta:=coalesce(p.metadata,'{}');
  IF j.runtime->>'backfillKind'='webcam' THEN
    FOREACH meta_key IN ARRAY ARRAY['playback_url','archive_url','archive_mp4_url','replay_url','video_url','r2_video_url','playback_mp4','media_url','fallback_playback_url','download_url'] LOOP
      IF published_meta->>meta_key=j.source_url THEN published_meta:=jsonb_set(published_meta,ARRAY[meta_key],to_jsonb(new_url)); END IF;
    END LOOP;
  END IF;
  UPDATE post_video_processing_jobs SET snapshot=jsonb_build_object('attachment',to_jsonb(a),'post_media',jsonb_build_object('video_url',p.video_url,'media_urls',p.media_urls,'metadata',p.metadata)),gateway_url=new_url,published_at=clock_timestamp(),phase='stream_delete_pending',updated_at=clock_timestamp() WHERE id=j.id;
  UPDATE post_attachments SET file_url=new_url,storage_key=j.output_key,size_bytes=j.output_size,mime_type='video/mp4',transform_meta=coalesce(transform_meta,'{}')||jsonb_build_object('post_video_job_id',j.id,'source_generation',j.source_generation) WHERE id=a.id;
  UPDATE posts SET video_url=CASE WHEN video_url=j.source_url THEN new_url ELSE video_url END,
    media_urls=CASE WHEN jsonb_typeof(media_urls)='array' THEN (SELECT jsonb_agg(CASE WHEN e=to_jsonb(j.source_url) THEN to_jsonb(new_url) WHEN jsonb_typeof(e)='object' AND e->>'url'=j.source_url THEN jsonb_set(e,'{url}',to_jsonb(new_url)) ELSE e END ORDER BY ord) FROM jsonb_array_elements(media_urls) WITH ORDINALITY AS m(e,ord)) ELSE media_urls END,
    metadata=jsonb_set(published_meta,'{video_processing_by_attachment}',coalesce(metadata->'video_processing_by_attachment','{}')||jsonb_build_object(a.id::text,jsonb_build_object('phase','ready','jobId',j.id,'sourceGeneration',j.source_generation))),updated_at=clock_timestamp()
    WHERE id=p.id;
  SELECT * INTO j FROM post_video_processing_jobs WHERE id=j.id;
  RETURN to_jsonb(j);
END $$;


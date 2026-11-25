-- Explicit opt-in; no source can be deleted before24h after verified publication.
ALTER TABLE public.post_video_processing_control ADD COLUMN original_delete_enabled boolean NOT NULL DEFAULT false;
ALTER TABLE public.post_video_processing_jobs
 ADD COLUMN source_delete_started_at timestamptz,
 ADD COLUMN source_deleted_at timestamptz,
 ADD COLUMN source_delete_receipt jsonb,
 ADD COLUMN source_cleanup_lease uuid,
 ADD COLUMN source_cleanup_until timestamptz,
 ADD COLUMN source_cleanup_next_at timestamptz NOT NULL DEFAULT now(),
 ADD COLUMN source_cleanup_attempts integer NOT NULL DEFAULT 0,
 ADD COLUMN source_cleanup_error text;
CREATE INDEX post_video_retired_sources ON public.post_video_processing_jobs(source_key) WHERE source_delete_started_at IS NOT NULL;
CREATE INDEX post_video_source_cleanup_due ON public.post_video_processing_jobs(source_cleanup_next_at,published_at) WHERE source_deleted_at IS NULL AND phase='complete' AND NOT cancelled AND outcome='optimized';

CREATE FUNCTION public.has_post_video_source_references(p_job_id uuid) RETURNS boolean
LANGUAGE plpgsql STABLE SECURITY INVOKER SET search_path=public SET statement_timeout='55s' AS $$
DECLARE j post_video_processing_jobs; t text; found boolean; patterns text[];
BEGIN
 SELECT * INTO j FROM public.post_video_processing_jobs WHERE id=p_job_id;
 IF j.id IS NULL OR length(j.source_key)<10 OR length(j.source_url)<10 THEN RAISE EXCEPTION 'Missing source identity'; END IF;
 patterns:=ARRAY['%'||replace(replace(replace(j.source_key,chr(92),chr(92)||chr(92)),'%',chr(92)||'%'),'_',chr(92)||'_')||'%', '%'||replace(replace(replace(j.source_url,chr(92),chr(92)||chr(92)),'%',chr(92)||'%'),'_',chr(92)||'_')||'%'];
 FOREACH t IN ARRAY ARRAY['posts','post_attachments','comments','profiles','live_sessions','live_replays'] LOOP
  EXECUTE format('SELECT EXISTS(SELECT 1 FROM public.%I r WHERE to_jsonb(r)::text LIKE ANY($1))',t) INTO found USING patterns;
  IF found THEN RETURN true; END IF;
 END LOOP;
 RETURN EXISTS(SELECT 1 FROM public.post_video_processing_jobs WHERE id<>j.id AND (source_key=j.source_key OR output_key=j.source_key OR source_url=j.source_url OR gateway_url=j.source_url));
END $$;

-- Serialize the final reference check against reference writes, then keep a durable tombstone.
CREATE FUNCTION public.guard_retired_post_video_source() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE payload text; candidate record;
BEGIN
 IF TG_TABLE_NAME='post_video_processing_jobs' THEN
  FOR candidate IN SELECT DISTINCT source_key FROM public.post_video_processing_jobs j WHERE j.id<>NEW.id AND (j.source_key=NEW.source_key OR j.source_key=NEW.output_key OR j.source_url=NEW.source_url OR j.source_url=NEW.gateway_url) ORDER BY source_key LOOP
   PERFORM pg_advisory_xact_lock_shared(hashtextextended('post_video_source_retirement:'||candidate.source_key,0));
   IF EXISTS(SELECT 1 FROM public.post_video_processing_jobs WHERE source_key=candidate.source_key AND source_delete_started_at IS NOT NULL) THEN RAISE EXCEPTION 'Video source retired; use a new upload' USING ERRCODE='23514'; END IF;
  END LOOP;
 ELSE
  payload:=to_jsonb(NEW)::text;
  FOR candidate IN SELECT DISTINCT source_key FROM public.post_video_processing_jobs WHERE strpos(payload,source_key)>0 OR strpos(payload,source_url)>0 ORDER BY source_key LOOP
   PERFORM pg_advisory_xact_lock_shared(hashtextextended('post_video_source_retirement:'||candidate.source_key,0));
   IF EXISTS(SELECT 1 FROM public.post_video_processing_jobs WHERE source_key=candidate.source_key AND source_delete_started_at IS NOT NULL) THEN RAISE EXCEPTION 'Video source retired; use optimized media' USING ERRCODE='23514'; END IF;
  END LOOP;
 END IF;
 RETURN NEW;
END $$;
DO $$ DECLARE t text; BEGIN
 FOREACH t IN ARRAY ARRAY['posts','post_attachments','comments','profiles','live_sessions','live_replays','post_video_processing_jobs'] LOOP
  EXECUTE format('CREATE TRIGGER post_video_retired_source_guard BEFORE INSERT OR UPDATE ON public.%I FOR EACH ROW EXECUTE FUNCTION public.guard_retired_post_video_source()',t);
 END LOOP;
END $$;

CREATE FUNCTION public.claim_post_video_source_cleanup(p_job_id uuid,p_lease uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE j post_video_processing_jobs;
BEGIN
 IF p_lease IS NULL OR NOT coalesce((SELECT original_delete_enabled FROM public.post_video_processing_control WHERE id),false) THEN RETURN NULL; END IF;
 UPDATE public.post_video_processing_jobs SET source_cleanup_lease=p_lease,source_cleanup_until=clock_timestamp()+interval '180 seconds'
 WHERE id=p_job_id AND phase='complete' AND outcome='optimized' AND NOT cancelled AND source_deleted_at IS NULL
 AND published_at<=clock_timestamp()-interval '24 hours' AND output_verified_at IS NOT NULL AND stream_deleted_at IS NOT NULL
 AND source_cleanup_attempts<5 AND source_cleanup_next_at<=clock_timestamp() AND (source_cleanup_until IS NULL OR source_cleanup_until<clock_timestamp())
 RETURNING * INTO j;
 RETURN CASE WHEN j.id IS NULL THEN NULL ELSE to_jsonb(j) END;
END $$;

CREATE FUNCTION public.arm_post_video_source_cleanup(p_job_id uuid,p_lease uuid,p_etag text,p_bucket text) RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public SET statement_timeout='55s' AS $$
DECLARE j post_video_processing_jobs; locked_key text;
BEGIN
 SELECT source_key INTO locked_key FROM public.post_video_processing_jobs WHERE id=p_job_id;
 IF locked_key IS NULL THEN RETURN false; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended('post_video_source_retirement:'||locked_key,0));
 SELECT * INTO j FROM public.post_video_processing_jobs WHERE id=p_job_id FOR UPDATE;
 IF j.id IS NULL OR j.source_key IS DISTINCT FROM locked_key OR j.source_cleanup_lease IS DISTINCT FROM p_lease OR j.source_cleanup_until IS NULL OR j.source_cleanup_until<=clock_timestamp()
 OR NOT coalesce((SELECT original_delete_enabled FROM public.post_video_processing_control WHERE id),false)
 OR j.source_deleted_at IS NOT NULL OR j.cancelled OR j.phase<>'complete' OR j.outcome IS DISTINCT FROM 'optimized'
 OR j.published_at IS NULL OR j.published_at>clock_timestamp()-interval '24 hours' OR j.output_verified_at IS NULL OR j.stream_deleted_at IS NULL
 OR p_bucket IS NULL OR p_bucket !~ '^[a-z0-9][a-z0-9.-]{1,61}[a-z0-9]$' OR p_bucket='fun-rich-video-optimized'
 OR j.source_delete_receipt IS NOT NULL AND j.source_delete_receipt->>'source_bucket' IS DISTINCT FROM p_bucket
 OR p_etag IS NULL OR p_etag IS DISTINCT FROM j.runtime->>'sourceEtag' OR j.output_bucket IS DISTINCT FROM 'fun-rich-video-optimized' OR j.output_size IS NULL OR j.output_size>=j.source_size
 OR NOT EXISTS(SELECT 1 FROM public.post_attachments a JOIN public.posts p ON p.id=a.post_id WHERE a.id=j.attachment_id AND a.post_id=j.post_id AND p.user_id=j.user_id AND p.deleted_at IS NULL AND a.file_url=j.gateway_url AND a.storage_key=j.output_key AND a.size_bytes=j.output_size)
 THEN RETURN false; END IF;
 IF public.has_post_video_source_references(j.id) THEN RETURN false; END IF;
 UPDATE public.post_video_processing_jobs SET source_delete_started_at=coalesce(source_delete_started_at,clock_timestamp()),
 source_delete_receipt=coalesce(source_delete_receipt,jsonb_build_object('source_bucket',p_bucket,'source_key',source_key,'source_url',source_url,'size',source_size,'etag',p_etag,'output_key',output_key,'output_size',output_size,'gateway_url',gateway_url,'published_at',published_at,'eligible_at',published_at+interval '24 hours')) WHERE id=j.id;
 UPDATE public.video_upload_sessions SET status='aborted',failed_reason='Original retired after verified optimization',updated_at=clock_timestamp() WHERE r2_key=j.source_key;
 RETURN true;
END $$;

CREATE FUNCTION public.finish_post_video_source_cleanup(p_job_id uuid,p_lease uuid,p_deleted boolean) RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE changed integer;
BEGIN
 UPDATE public.post_video_processing_jobs SET source_deleted_at=CASE WHEN p_deleted THEN clock_timestamp() ELSE source_deleted_at END,
 source_cleanup_attempts=CASE WHEN p_deleted THEN source_cleanup_attempts ELSE source_cleanup_attempts+1 END,
 source_cleanup_error=CASE WHEN p_deleted THEN NULL ELSE 'Source cleanup held; inspect before retry' END,
 source_cleanup_next_at=clock_timestamp()+interval '6 hours',source_cleanup_until=NULL
 WHERE id=p_job_id AND source_cleanup_lease=p_lease AND source_cleanup_until>clock_timestamp() AND source_deleted_at IS NULL
 AND (NOT p_deleted OR source_delete_started_at IS NOT NULL AND source_delete_receipt IS NOT NULL);
 GET DIAGNOSTICS changed=ROW_COUNT;RETURN changed=1;
END $$;
REVOKE ALL ON FUNCTION public.has_post_video_source_references(uuid),public.guard_retired_post_video_source(),public.claim_post_video_source_cleanup(uuid,uuid),public.arm_post_video_source_cleanup(uuid,uuid,text,text),public.finish_post_video_source_cleanup(uuid,uuid,boolean) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.has_post_video_source_references(uuid),public.claim_post_video_source_cleanup(uuid,uuid),public.arm_post_video_source_cleanup(uuid,uuid,text,text),public.finish_post_video_source_cleanup(uuid,uuid,boolean) TO service_role;

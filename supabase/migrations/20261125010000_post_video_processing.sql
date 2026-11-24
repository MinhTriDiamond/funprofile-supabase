-- Post videos: durable outbox, fenced processing, private R2 output. Disabled until canary.
CREATE TABLE public.post_video_processing_control (
  id boolean PRIMARY KEY DEFAULT true CHECK (id),
  enabled boolean NOT NULL DEFAULT false,
  import_enabled boolean NOT NULL DEFAULT false,
  publish_enabled boolean NOT NULL DEFAULT false,
  delete_enabled boolean NOT NULL DEFAULT false,
  live_reserve_minutes integer NOT NULL DEFAULT 240 CHECK (live_reserve_minutes>=0),
  output_bucket text NOT NULL DEFAULT 'fun-rich-video-optimized',
  media_base_url text NOT NULL DEFAULT 'https://fun.rich/media-optimized',
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT,INSERT,UPDATE,DELETE ON public.post_video_processing_control TO authenticated;
GRANT ALL ON public.post_video_processing_control TO service_role;
ALTER TABLE public.post_video_processing_control ENABLE ROW LEVEL SECURITY;
INSERT INTO public.post_video_processing_control(id) VALUES(true);

CREATE TABLE public.post_video_processing_jobs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  post_id uuid NOT NULL,
  attachment_id uuid NOT NULL,
  source_generation uuid NOT NULL DEFAULT gen_random_uuid(),
  source_key text NOT NULL,
  source_url text NOT NULL,
  source_size bigint NOT NULL CHECK (source_size>0 AND source_size<=10737418240),
  source_hash text NOT NULL,
  phase text NOT NULL DEFAULT 'queued' CHECK (phase IN ('queued','waiting_capacity','importing','encoding','mp4_wait','r2_init','r2_upload','r2_verify','publishing','stream_delete_pending','complete','failed','cancelled','needs_review','not_beneficial')),
  canary boolean NOT NULL DEFAULT false,
  cancelled boolean NOT NULL DEFAULT false,
  stream_account_id text,
  stream_uid text,
  reserved_minutes numeric NOT NULL DEFAULT 0 CHECK (reserved_minutes>=0),
  reserved_until timestamptz,
  output_bucket text,
  output_key text,
  output_size bigint CHECK (output_size>0),
  output_verified_at timestamptz,
  published_at timestamptz,
  stream_deleted_at timestamptz,
  gateway_url text,
  outcome text,
  runtime jsonb NOT NULL DEFAULT '{}'::jsonb,
  snapshot jsonb,
  attempts integer NOT NULL DEFAULT 0 CHECK (attempts>=0),
  last_error text,
  next_attempt_at timestamptz NOT NULL DEFAULT now(),
  lease_token uuid,
  lease_until timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(attachment_id,source_key,source_size,source_hash)
);
GRANT SELECT,INSERT,UPDATE,DELETE ON public.post_video_processing_jobs TO authenticated;
GRANT ALL ON public.post_video_processing_jobs TO service_role;
ALTER TABLE public.post_video_processing_jobs ENABLE ROW LEVEL SECURITY;
CREATE POLICY post_video_owner_status ON public.post_video_processing_jobs FOR SELECT TO authenticated USING(user_id=auth.uid());
CREATE INDEX post_video_jobs_due ON public.post_video_processing_jobs(next_attempt_at) WHERE phase NOT IN ('complete','failed','cancelled','needs_review');
CREATE UNIQUE INDEX post_video_jobs_stream_uid ON public.post_video_processing_jobs(stream_account_id,stream_uid) WHERE stream_uid IS NOT NULL;
CREATE INDEX post_video_jobs_post ON public.post_video_processing_jobs(post_id);

CREATE FUNCTION public.enqueue_post_video_job() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE owner_id uuid; post_visibility text; source_session record;
BEGIN
  IF NEW.file_type<>'video' OR NOT coalesce((SELECT enabled FROM post_video_processing_control WHERE id),false) THEN RETURN NEW; END IF;
  SELECT user_id,visibility INTO owner_id,post_visibility FROM posts WHERE id=NEW.post_id AND deleted_at IS NULL;
  IF owner_id IS NULL OR post_visibility IS DISTINCT FROM 'public' OR NEW.size_bytes IS NULL OR NEW.size_bytes<=0 OR NEW.size_bytes>10737418240 THEN RETURN NEW; END IF;
  -- New eligible uploads use an owner-scoped key; legacy files require an explicit admin canary.
  IF NEW.storage_key NOT LIKE 'videos/'||owner_id::text||'/%' OR NEW.storage_key ~ '(^|/)\.\.?(/|$)' OR NEW.storage_key ~ '[\\%]' THEN RETURN NEW; END IF;
  SELECT file_hash INTO source_session FROM video_upload_sessions
    WHERE user_id=owner_id AND r2_key=NEW.storage_key AND file_size=NEW.size_bytes AND status='completed'
    ORDER BY created_at DESC LIMIT 1;
  IF NOT FOUND OR source_session.file_hash IS NULL THEN RETURN NEW; END IF;
  INSERT INTO post_video_processing_jobs(user_id,post_id,attachment_id,source_key,source_url,source_size,source_hash)
    VALUES(owner_id,NEW.post_id,NEW.id,NEW.storage_key,NEW.file_url,NEW.size_bytes,source_session.file_hash)
    ON CONFLICT(attachment_id,source_key,source_size,source_hash) DO NOTHING;
  RETURN NEW;
END $$;
CREATE TRIGGER post_video_enqueue AFTER INSERT OR UPDATE OF file_url,storage_key,size_bytes ON public.post_attachments FOR EACH ROW EXECUTE FUNCTION public.enqueue_post_video_job();

CREATE FUNCTION public.tombstone_post_video_job() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
  IF TG_TABLE_NAME='posts' THEN
    UPDATE post_video_processing_jobs SET cancelled=true,phase='cancelled',updated_at=now() WHERE post_id=OLD.id;
  ELSE
    UPDATE post_video_processing_jobs SET cancelled=true,phase='cancelled',updated_at=now() WHERE attachment_id=OLD.id;
  END IF;
  RETURN OLD;
END $$;
CREATE TRIGGER post_video_post_deleted BEFORE DELETE ON public.posts FOR EACH ROW EXECUTE FUNCTION public.tombstone_post_video_job();
CREATE TRIGGER post_video_attachment_deleted BEFORE DELETE ON public.post_attachments FOR EACH ROW EXECUTE FUNCTION public.tombstone_post_video_job();

CREATE FUNCTION public.claim_post_video_job(p_job_id uuid,p_lease_token uuid,p_lease_seconds integer DEFAULT 180) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE j post_video_processing_jobs;
BEGIN
  IF p_lease_token IS NULL THEN RETURN NULL; END IF;
  UPDATE post_video_processing_jobs SET lease_token=p_lease_token,
    lease_until=clock_timestamp()+make_interval(secs=>greatest(30,least(p_lease_seconds,300))),updated_at=clock_timestamp()
  WHERE id=p_job_id AND NOT cancelled AND phase NOT IN ('complete','failed','cancelled','needs_review')
    AND next_attempt_at<=clock_timestamp() AND (lease_until IS NULL OR lease_until<clock_timestamp())
    AND (canary OR (SELECT enabled FROM post_video_processing_control WHERE id))
  RETURNING * INTO j;
  RETURN CASE WHEN j.id IS NULL THEN NULL ELSE to_jsonb(j) END;
END $$;

CREATE FUNCTION public.advance_post_video_job(p_job_id uuid,p_lease_token uuid,p_expected_phase text,p_patch jsonb) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE j post_video_processing_jobs;
BEGIN
  IF p_patch-ARRAY['phase','runtime','next_attempt_at','attempts','stream_uid','stream_account_id','output_bucket','output_key','output_size','output_verified_at','published_at','stream_deleted_at','last_error','outcome','release_lease'] <> '{}'::jsonb THEN RAISE EXCEPTION 'Unsupported job patch'; END IF;
  UPDATE post_video_processing_jobs SET
    phase=CASE WHEN p_patch ? 'phase' THEN p_patch->>'phase' ELSE phase END,
    runtime=CASE WHEN p_patch ? 'runtime' THEN p_patch->'runtime' ELSE runtime END,
    next_attempt_at=CASE WHEN p_patch ? 'next_attempt_at' THEN (p_patch->>'next_attempt_at')::timestamptz ELSE next_attempt_at END,
    attempts=CASE WHEN p_patch ? 'attempts' THEN (p_patch->>'attempts')::integer ELSE attempts END,
    stream_uid=CASE WHEN p_patch ? 'stream_uid' THEN p_patch->>'stream_uid' ELSE stream_uid END,
    stream_account_id=CASE WHEN p_patch ? 'stream_account_id' THEN p_patch->>'stream_account_id' ELSE stream_account_id END,
    output_bucket=CASE WHEN p_patch ? 'output_bucket' THEN p_patch->>'output_bucket' ELSE output_bucket END,
    output_key=CASE WHEN p_patch ? 'output_key' THEN p_patch->>'output_key' ELSE output_key END,
    output_size=CASE WHEN p_patch ? 'output_size' THEN (p_patch->>'output_size')::bigint ELSE output_size END,
    output_verified_at=CASE WHEN p_patch ? 'output_verified_at' THEN (p_patch->>'output_verified_at')::timestamptz ELSE output_verified_at END,
    published_at=CASE WHEN p_patch ? 'published_at' THEN (p_patch->>'published_at')::timestamptz ELSE published_at END,
    stream_deleted_at=CASE WHEN p_patch ? 'stream_deleted_at' THEN (p_patch->>'stream_deleted_at')::timestamptz ELSE stream_deleted_at END,
    last_error=CASE WHEN p_patch ? 'last_error' THEN p_patch->>'last_error' ELSE last_error END,
    outcome=CASE WHEN p_patch ? 'outcome' THEN p_patch->>'outcome' ELSE outcome END,
    lease_until=CASE WHEN coalesce((p_patch->>'release_lease')::boolean,false) THEN NULL ELSE lease_until END,
    updated_at=clock_timestamp()
  WHERE id=p_job_id AND lease_token=p_lease_token AND lease_until>clock_timestamp() AND phase=p_expected_phase AND NOT cancelled
  RETURNING * INTO j;
  IF j.id IS NULL THEN RETURN NULL; END IF;
  UPDATE posts SET metadata=jsonb_set(coalesce(metadata,'{}'),'{video_processing_by_attachment}',
    coalesce(metadata->'video_processing_by_attachment','{}')||jsonb_build_object(j.attachment_id::text,jsonb_build_object('phase',CASE WHEN j.published_at IS NOT NULL THEN 'ready' ELSE j.phase END,'outcome',j.outcome))),updated_at=clock_timestamp()
    WHERE id=j.post_id AND EXISTS(SELECT 1 FROM post_attachments WHERE id=j.attachment_id AND post_id=j.post_id AND (file_url=j.source_url OR file_url=j.gateway_url));
  RETURN to_jsonb(j);
END $$;

CREATE FUNCTION public.reserve_post_video_capacity(p_job_id uuid,p_lease_token uuid,p_account_id text,p_used_minutes numeric,p_limit_minutes numeric) RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE j post_video_processing_jobs; reserved numeric; reserve_for_live integer;
BEGIN
  IF p_account_id IS NULL OR p_used_minutes::text IN ('NaN','Infinity','-Infinity') OR p_limit_minutes::text IN ('NaN','Infinity','-Infinity') OR p_used_minutes IS NULL OR p_limit_minutes IS NULL OR p_used_minutes<0 OR p_limit_minutes<=0 THEN RETURN false; END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended('post_video_capacity:'||p_account_id,0));
  SELECT * INTO j FROM post_video_processing_jobs WHERE id=p_job_id AND lease_token=p_lease_token AND lease_until>clock_timestamp() AND NOT cancelled FOR UPDATE;
  IF j.id IS NULL THEN RETURN false; END IF;
  SELECT coalesce(sum(reserved_minutes),0) INTO reserved FROM post_video_processing_jobs WHERE id<>j.id AND stream_account_id=p_account_id AND reserved_until>clock_timestamp() AND stream_deleted_at IS NULL;
  SELECT live_reserve_minutes INTO reserve_for_live FROM post_video_processing_control WHERE id;
  IF floor(p_limit_minutes*60)-ceil(p_used_minutes*60)-ceil(reserved*60)-coalesce(reserve_for_live,240)*60<14400 THEN RETURN false; END IF;
  UPDATE post_video_processing_jobs SET stream_account_id=p_account_id,reserved_minutes=240,reserved_until=clock_timestamp()+interval '1 hour' WHERE id=j.id;
  RETURN true;
END $$;

CREATE FUNCTION public.publish_post_video_output(p_job_id uuid,p_lease_token uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE j post_video_processing_jobs; a post_attachments; p posts; base text; new_url text;
BEGIN
  SELECT * INTO j FROM post_video_processing_jobs WHERE id=p_job_id FOR UPDATE;
  IF j.id IS NULL OR j.cancelled OR j.lease_token IS DISTINCT FROM p_lease_token OR j.lease_until<=clock_timestamp() THEN RETURN NULL; END IF;
  SELECT * INTO p FROM posts WHERE id=j.post_id FOR UPDATE;
  SELECT * INTO a FROM post_attachments WHERE id=j.attachment_id AND post_id=j.post_id FOR UPDATE;
  IF p.id IS NULL OR p.deleted_at IS NOT NULL OR a.id IS NULL OR p.user_id<>j.user_id THEN RETURN NULL; END IF;
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
  UPDATE post_video_processing_jobs SET snapshot=jsonb_build_object('attachment',to_jsonb(a),'post_media',jsonb_build_object('video_url',p.video_url,'media_urls',p.media_urls,'metadata',p.metadata)),gateway_url=new_url,published_at=clock_timestamp(),phase='stream_delete_pending',updated_at=clock_timestamp() WHERE id=j.id;
  UPDATE post_attachments SET file_url=new_url,storage_key=j.output_key,size_bytes=j.output_size,mime_type='video/mp4',transform_meta=coalesce(transform_meta,'{}')||jsonb_build_object('post_video_job_id',j.id,'source_generation',j.source_generation) WHERE id=a.id;
  UPDATE posts SET video_url=CASE WHEN video_url=j.source_url THEN new_url ELSE video_url END,
    media_urls=CASE WHEN jsonb_typeof(media_urls)='array' THEN (SELECT jsonb_agg(CASE WHEN e=to_jsonb(j.source_url) THEN to_jsonb(new_url) WHEN jsonb_typeof(e)='object' AND e->>'url'=j.source_url THEN jsonb_set(e,'{url}',to_jsonb(new_url)) ELSE e END ORDER BY ord) FROM jsonb_array_elements(media_urls) WITH ORDINALITY AS m(e,ord)) ELSE media_urls END,
    metadata=jsonb_set(coalesce(metadata,'{}'),'{video_processing_by_attachment}',coalesce(metadata->'video_processing_by_attachment','{}')||jsonb_build_object(a.id::text,jsonb_build_object('phase','ready','jobId',j.id,'sourceGeneration',j.source_generation))),updated_at=clock_timestamp()
    WHERE id=p.id;
  SELECT * INTO j FROM post_video_processing_jobs WHERE id=j.id;
  RETURN to_jsonb(j);
END $$;

REVOKE ALL ON FUNCTION public.claim_post_video_job(uuid,uuid,integer),public.advance_post_video_job(uuid,uuid,text,jsonb),public.reserve_post_video_capacity(uuid,uuid,text,numeric,numeric),public.publish_post_video_output(uuid,uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.claim_post_video_job(uuid,uuid,integer),public.advance_post_video_job(uuid,uuid,text,jsonb),public.reserve_post_video_capacity(uuid,uuid,text,numeric,numeric),public.publish_post_video_output(uuid,uuid) TO service_role;
REVOKE ALL ON FUNCTION public.enqueue_post_video_job(),public.tombstone_post_video_job() FROM PUBLIC,anon,authenticated;

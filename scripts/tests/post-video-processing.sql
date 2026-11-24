\set ON_ERROR_STOP on
BEGIN;
DO $$ BEGIN
  IF NOT EXISTS(SELECT 1 FROM pg_roles WHERE rolname='authenticated') THEN CREATE ROLE authenticated; END IF;
  IF NOT EXISTS(SELECT 1 FROM pg_roles WHERE rolname='service_role') THEN CREATE ROLE service_role BYPASSRLS; END IF;
  IF NOT EXISTS(SELECT 1 FROM pg_roles WHERE rolname='anon') THEN CREATE ROLE anon; END IF;
END $$;
CREATE SCHEMA auth;
CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$ SELECT nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
GRANT USAGE ON SCHEMA public,auth TO authenticated,service_role,anon;
CREATE TABLE public.posts(id uuid PRIMARY KEY,user_id uuid NOT NULL,visibility text DEFAULT 'public',deleted_at timestamptz,moderation_status text DEFAULT 'approved',video_url text,media_urls jsonb,metadata jsonb DEFAULT '{}',updated_at timestamptz DEFAULT now());
CREATE TABLE public.post_attachments(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),post_id uuid REFERENCES posts(id) ON DELETE CASCADE,file_url text NOT NULL,storage_key text,file_type text,mime_type text,size_bytes bigint,width int,height int,transform_meta jsonb,sort_order int DEFAULT 0);
CREATE TABLE public.video_upload_sessions(id uuid DEFAULT gen_random_uuid(),user_id uuid,r2_key text,status text,file_size bigint,file_hash text,created_at timestamptz DEFAULT now());
\ir ../../supabase/migrations/20261125010000_post_video_processing.sql
\ir ../../supabase/migrations/20261125020000_post_video_retry.sql
UPDATE public.post_video_processing_control SET enabled=true,publish_enabled=true;
INSERT INTO posts(id,user_id,video_url,media_urls) VALUES('10000000-0000-0000-0000-000000000001','20000000-0000-0000-0000-000000000001','https://media.fun.rich/videos/source.mov','[{"url":"https://media.fun.rich/videos/source.mov","type":"video"},{"url":"other.jpg","type":"image"}]');
INSERT INTO video_upload_sessions(user_id,r2_key,status,file_size,file_hash) VALUES('20000000-0000-0000-0000-000000000001','videos/20000000-0000-0000-0000-000000000001/source.mov','completed',3399337725,'abc');
INSERT INTO post_attachments(id,post_id,file_url,storage_key,file_type,size_bytes) VALUES('30000000-0000-0000-0000-000000000001','10000000-0000-0000-0000-000000000001','https://media.fun.rich/videos/source.mov','videos/20000000-0000-0000-0000-000000000001/source.mov','video',3399337725);
DO $$ DECLARE j uuid; claimed jsonb; lease uuid := gen_random_uuid(); bad uuid := gen_random_uuid(); result jsonb; BEGIN
 SELECT id INTO j FROM post_video_processing_jobs;
 IF j IS NULL OR (SELECT count(*) FROM post_video_processing_jobs)<>1 THEN RAISE EXCEPTION 'expected one persistent job'; END IF;
 UPDATE post_attachments SET mime_type='video/quicktime';
 IF (SELECT count(*) FROM post_video_processing_jobs)<>1 THEN RAISE EXCEPTION 'duplicate job'; END IF;
 claimed := claim_post_video_job(j,lease,180);
 IF claimed IS NULL THEN RAISE EXCEPTION 'first claim failed'; END IF;
 IF claim_post_video_job(j,bad,180) IS NOT NULL THEN RAISE EXCEPTION 'double claim'; END IF;
 IF advance_post_video_job(j,bad,'queued','{"phase":"encoding"}') IS NOT NULL THEN RAISE EXCEPTION 'stale fence advanced'; END IF;
 IF reserve_post_video_capacity(j,lease,'test-account',NULL,1000) THEN RAISE EXCEPTION 'reserved unknown usage'; END IF;
 IF reserve_post_video_capacity(j,lease,'test-account',600,1000) THEN RAISE EXCEPTION 'consumed live reserve'; END IF;
 IF NOT reserve_post_video_capacity(j,lease,'test-account',0,1000) THEN RAISE EXCEPTION 'available quota rejected'; END IF;
 result := advance_post_video_job(j,lease,'queued','{"phase":"publishing","output_key":"optimized/test.mp4","output_bucket":"fun-rich-video-optimized","output_size":100000,"output_verified_at":"2026-11-25T00:00:00Z"}');
 IF result IS NULL THEN RAISE EXCEPTION 'advance failed'; END IF;
 UPDATE post_video_processing_jobs SET output_bucket='public-bucket' WHERE id=j;
 IF publish_post_video_output(j,lease) IS NOT NULL THEN RAISE EXCEPTION 'published to a public output bucket'; END IF;
 UPDATE post_video_processing_jobs SET output_bucket='fun-rich-video-optimized' WHERE id=j;
 UPDATE posts SET visibility='friends';
 IF publish_post_video_output(j,lease) IS NOT NULL THEN RAISE EXCEPTION 'published private post'; END IF;
 UPDATE posts SET visibility='public';
 UPDATE post_attachments SET size_bytes=NULL;
 IF publish_post_video_output(j,lease) IS NOT NULL THEN RAISE EXCEPTION 'published source with missing size'; END IF;
 UPDATE post_attachments SET size_bytes=3399337725;
 UPDATE post_attachments SET file_url='changed';
 IF publish_post_video_output(j,lease) IS NOT NULL THEN RAISE EXCEPTION 'published stale source'; END IF;
 UPDATE post_attachments SET file_url='https://media.fun.rich/videos/source.mov';
 IF publish_post_video_output(j,lease) IS NULL THEN RAISE EXCEPTION 'publish failed'; END IF;
 IF (SELECT file_url FROM post_attachments LIMIT 1) NOT LIKE '%/media-optimized/%' THEN RAISE EXCEPTION 'missing gateway locator'; END IF;
 IF (SELECT media_urls->1->>'url' FROM posts LIMIT 1)<>'other.jpg' THEN RAISE EXCEPTION 'other attachment changed'; END IF;
 IF publish_post_video_output(j,lease) IS NULL THEN RAISE EXCEPTION 'publish not idempotent'; END IF;
END $$;
-- Eligibility: private, image, legacy unowned prefix or unmatched session must not enqueue.
UPDATE posts SET visibility='friends';
INSERT INTO post_attachments(post_id,file_url,storage_key,file_type,size_bytes) VALUES('10000000-0000-0000-0000-000000000001','private','videos/20000000-0000-0000-0000-000000000001/private.mov','video',20);
UPDATE posts SET visibility='public';
INSERT INTO post_attachments(post_id,file_url,storage_key,file_type,size_bytes) VALUES('10000000-0000-0000-0000-000000000001','image','posts/photo.jpg','image',20),('10000000-0000-0000-0000-000000000001','legacy','videos/legacy.mov','video',20),('10000000-0000-0000-0000-000000000001','forged','videos/20000000-0000-0000-0000-000000000001/forged.mov','video',20);
DO $$ BEGIN IF (SELECT count(*) FROM post_video_processing_jobs)<>1 THEN RAISE EXCEPTION 'ineligible job created'; END IF; END $$;
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','20000000-0000-0000-0000-000000000002',true);
DO $$ BEGIN
 IF (SELECT count(*) FROM post_video_processing_jobs)<>0 THEN RAISE EXCEPTION 'RLS disclosed another owner'; END IF;
 IF has_function_privilege(current_user,'public.claim_post_video_job(uuid,uuid,integer)','EXECUTE') THEN RAISE EXCEPTION 'client can claim jobs'; END IF;
 BEGIN INSERT INTO post_video_processing_jobs(user_id,post_id,attachment_id,source_key,source_url,source_size,source_hash) VALUES(auth.uid(),gen_random_uuid(),gen_random_uuid(),'x','x',1,'x'); RAISE EXCEPTION 'client inserted job'; EXCEPTION WHEN insufficient_privilege THEN NULL; END;
END $$;
SELECT set_config('request.jwt.claim.sub','20000000-0000-0000-0000-000000000001',true);
DO $$ BEGIN IF (SELECT count(*) FROM post_video_processing_jobs)<>1 THEN RAISE EXCEPTION 'owner cannot read status'; END IF; END $$;
RESET ROLE;
UPDATE post_video_processing_jobs SET phase='needs_review',runtime='{"retryPhase":"importing"}',lease_until=NULL;
SET LOCAL ROLE authenticated;
DO $$ BEGIN IF request_post_video_retry('30000000-0000-0000-0000-000000000001') THEN RAISE EXCEPTION 'owner recreated ambiguous import'; END IF; END $$;
RESET ROLE;
UPDATE post_video_processing_jobs SET runtime='{"retryPhase":"stream_delete_pending"}';
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','20000000-0000-0000-0000-000000000002',true);
DO $$ BEGIN IF request_post_video_retry('30000000-0000-0000-0000-000000000001') THEN RAISE EXCEPTION 'foreign owner retried'; END IF; END $$;
SELECT set_config('request.jwt.claim.sub','20000000-0000-0000-0000-000000000001',true);
DO $$ BEGIN IF NOT request_post_video_retry('30000000-0000-0000-0000-000000000001') THEN RAISE EXCEPTION 'owner cannot retry safe operation'; END IF; END $$;
RESET ROLE;
DELETE FROM posts;
DO $$ BEGIN IF NOT (SELECT cancelled FROM post_video_processing_jobs LIMIT 1) THEN RAISE EXCEPTION 'deleted post did not tombstone job'; END IF; END $$;
COMMIT;
\echo 'post-video SQL integration passed'

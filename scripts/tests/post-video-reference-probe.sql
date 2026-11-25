\set ON_ERROR_STOP on
CREATE TABLE public.live_replays(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),stream_uid text,cloudflare_video_uid text,playback_hls text,playback_dash text,playback_mp4 text,cloudflare_playback_url text);
CREATE TABLE public.live_sessions(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),cloudflare_video_uid text,hls_url text,playback_url text);
CREATE TABLE public.comments(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),video_url text);
CREATE TABLE public.profiles(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),cover_url text);
\ir ../../supabase/migrations/20261125050000_post_video_reference_probe.sql
GRANT SELECT ON public.live_replays,public.live_sessions,public.posts,public.post_attachments,public.comments,public.profiles,public.post_video_processing_jobs TO service_role;
DO $$ BEGIN IF NOT EXISTS(SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.proname='has_post_video_stream_references' AND p.proconfig @> ARRAY['statement_timeout=30s']) THEN RAISE EXCEPTION 'reference RPC must have its own bounded30s timeout'; END IF; END $$;
DO $$ DECLARE uid text:=repeat('e',32); excluded uuid:='90000000-0000-0000-0000-000000000001'; table_name text; col text; row_id uuid; old_stream text; job_id uuid; BEGIN
 IF public.has_post_video_stream_references(uid,excluded) THEN RAISE EXCEPTION 'unexpected baseline reference'; END IF;
 FOR table_name,col IN SELECT * FROM (VALUES ('live_replays','stream_uid'),('live_replays','cloudflare_video_uid'),('live_replays','playback_hls'),('live_replays','playback_dash'),('live_replays','playback_mp4'),('live_replays','cloudflare_playback_url'),('live_sessions','cloudflare_video_uid'),('live_sessions','hls_url'),('live_sessions','playback_url'),('comments','video_url'),('profiles','cover_url')) fields(t,c) LOOP
  EXECUTE format('INSERT INTO public.%I(%I) VALUES($1) RETURNING id',table_name,col) INTO row_id USING 'https://videodelivery.net/'||uid||'/manifest/video.m3u8';
  IF NOT public.has_post_video_stream_references(uid,excluded) THEN RAISE EXCEPTION 'missed %.%',table_name,col; END IF;
  EXECUTE format('DELETE FROM public.%I WHERE id=$1',table_name) USING row_id;
 END LOOP;
 INSERT INTO posts(id,user_id,video_url) VALUES(excluded,'20000000-0000-0000-0000-000000000001','https://videodelivery.net/'||uid);
 IF NOT public.has_post_video_stream_references(uid,excluded) THEN RAISE EXCEPTION 'missed posts.video_url'; END IF;
 UPDATE posts SET video_url=NULL WHERE id=excluded;
 UPDATE posts SET media_urls=jsonb_build_array(jsonb_build_object('url','https://videodelivery.net/'||uid)) WHERE id=excluded;
 IF NOT public.has_post_video_stream_references(uid,excluded) THEN RAISE EXCEPTION 'missed posts.media_urls'; END IF;
 UPDATE posts SET media_urls='[]',metadata=jsonb_build_object('nested',jsonb_build_object('reference',uid)) WHERE id=excluded;
 IF NOT public.has_post_video_stream_references(uid,excluded) THEN RAISE EXCEPTION 'missed arbitrary metadata'; END IF;
 UPDATE posts SET metadata='{}' WHERE id=excluded;
 INSERT INTO post_attachments(id,post_id,file_type,file_url) VALUES('90000000-0000-0000-0000-000000000002',excluded,'video','https://videodelivery.net/'||uid);
 IF NOT public.has_post_video_stream_references(uid,excluded) THEN RAISE EXCEPTION 'missed attachment-only URL'; END IF;
 DELETE FROM post_attachments WHERE id='90000000-0000-0000-0000-000000000002';
 SELECT id,stream_uid INTO job_id,old_stream FROM post_video_processing_jobs LIMIT 1;
 UPDATE post_video_processing_jobs SET stream_uid=uid WHERE id=job_id;
 IF public.has_post_video_stream_references(uid,job_id) THEN RAISE EXCEPTION 'own job must not block cleanup'; END IF;
 IF NOT public.has_post_video_stream_references(uid,excluded) THEN RAISE EXCEPTION 'other job reference lost'; END IF;
 UPDATE post_video_processing_jobs SET stream_uid=old_stream WHERE id=job_id;
 DELETE FROM posts WHERE id=excluded;
 IF public.has_post_video_stream_references(uid,excluded) THEN RAISE EXCEPTION 'unexpected final reference'; END IF;
 BEGIN PERFORM public.has_post_video_stream_references('%invalid',excluded);RAISE EXCEPTION 'accepted malformed UID'; EXCEPTION WHEN invalid_parameter_value THEN NULL; END;
END $$;
SET ROLE authenticated;
DO $$ BEGIN
 BEGIN PERFORM public.has_post_video_stream_references(repeat('e',32),'90000000-0000-0000-0000-000000000001');RAISE EXCEPTION 'authenticated can inspect references'; EXCEPTION WHEN insufficient_privilege THEN NULL; END;
END $$;
RESET ROLE;
SET ROLE service_role;
SELECT public.has_post_video_stream_references(repeat('e',32),'90000000-0000-0000-0000-000000000001');
RESET ROLE;
\echo 'post-video database reference fields and service-only ACL passed'

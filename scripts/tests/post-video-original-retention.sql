\set ON_ERROR_STOP on
ALTER TABLE public.video_upload_sessions ADD COLUMN failed_reason text,ADD COLUMN updated_at timestamptz DEFAULT now();
\ir ../../supabase/migrations/20261125060000_post_video_original_retention.sql
DO $$ DECLARE j uuid; owner_id uuid:='20000000-0000-0000-0000-000000000001'; a uuid:='81000000-0000-0000-0000-000000000001'; p uuid:='82000000-0000-0000-0000-000000000001'; lease uuid:=gen_random_uuid(); k text; url text; BEGIN
 k:='videos/'||owner_id::text||'/retention_1.mov';url:='https://media.fun.rich/'||k;
 INSERT INTO posts(id,user_id,video_url,media_urls) VALUES(p,owner_id,'https://fun.rich/media-optimized/test.mp4','[]');
 INSERT INTO post_attachments(id,post_id,file_url,storage_key,size_bytes,file_type) VALUES(a,p,'https://fun.rich/media-optimized/test.mp4','optimized/test.mp4',100,'video');
 INSERT INTO post_video_processing_jobs(user_id,post_id,attachment_id,source_key,source_url,source_size,source_hash,phase,outcome,output_bucket,output_key,output_size,output_verified_at,published_at,stream_deleted_at,gateway_url,runtime)
 VALUES(owner_id,p,a,k,url,1000,'hash','complete','optimized','fun-rich-video-optimized','optimized/test.mp4',100,now(),now()-interval '23 hours',now(),'https://fun.rich/media-optimized/test.mp4','{"sourceEtag":"source-version"}') RETURNING id INTO j;
 IF claim_post_video_source_cleanup(j,lease) IS NOT NULL THEN RAISE EXCEPTION 'flagOFF claimed'; END IF;
 UPDATE post_video_processing_control SET original_delete_enabled=true;
 IF claim_post_video_source_cleanup(j,lease) IS NOT NULL THEN RAISE EXCEPTION 'claimed before24h'; END IF;
 UPDATE post_video_processing_jobs SET published_at=now()-interval '25 hours' WHERE id=j;
 UPDATE post_video_processing_jobs SET outcome='original_retained' WHERE id=j;
 IF claim_post_video_source_cleanup(j,lease) IS NOT NULL THEN RAISE EXCEPTION 'unoptimized claimed'; END IF;
 UPDATE post_video_processing_jobs SET outcome='optimized',cancelled=true WHERE id=j;
 IF claim_post_video_source_cleanup(j,lease) IS NOT NULL THEN RAISE EXCEPTION 'cancelled claimed'; END IF;
 UPDATE post_video_processing_jobs SET cancelled=false WHERE id=j;
 IF claim_post_video_source_cleanup(j,lease) IS NULL THEN RAISE EXCEPTION 'due claim failed'; END IF;
 IF claim_post_video_source_cleanup(j,gen_random_uuid()) IS NOT NULL THEN RAISE EXCEPTION 'duplicate lease'; END IF;
 IF arm_post_video_source_cleanup(j,gen_random_uuid(),'source-version','originals') THEN RAISE EXCEPTION 'stale lease armed'; END IF;
 IF arm_post_video_source_cleanup(j,lease,'other','originals') THEN RAISE EXCEPTION 'wrong etag armed'; END IF;
 INSERT INTO comments(video_url) VALUES(replace(url,'retention_1.mov','retentionX1.mov'));
 IF has_post_video_source_references(j) THEN RAISE EXCEPTION 'literal underscore treated as wildcard'; END IF;
 UPDATE posts SET metadata=jsonb_build_object('nested',jsonb_build_object('source',url)) WHERE id=p;
 IF arm_post_video_source_cleanup(j,lease,'source-version','originals') THEN RAISE EXCEPTION 'referenced source armed'; END IF;
 UPDATE posts SET metadata='{}' WHERE id=p;
 IF NOT arm_post_video_source_cleanup(j,lease,'source-version','originals') THEN RAISE EXCEPTION 'due unreferenced arm failed'; END IF;
 IF NOT EXISTS(SELECT 1 FROM post_video_processing_jobs WHERE id=j AND source_delete_started_at IS NOT NULL AND source_delete_receipt->>'etag'='source-version' AND source_delete_receipt->>'source_bucket'='originals') THEN RAISE EXCEPTION 'no receipt'; END IF;
 BEGIN UPDATE posts SET metadata=jsonb_build_object('new_reference',url) WHERE id=p; RAISE EXCEPTION 'retired source relinked'; EXCEPTION WHEN check_violation THEN NULL; END;
 BEGIN INSERT INTO comments(video_url) VALUES(url);RAISE EXCEPTION 'retired source comment allowed';EXCEPTION WHEN check_violation THEN NULL; END;
 IF finish_post_video_source_cleanup(j,gen_random_uuid(),true) THEN RAISE EXCEPTION 'stale finish'; END IF;
 IF NOT finish_post_video_source_cleanup(j,lease,true) THEN RAISE EXCEPTION 'finish failed'; END IF;
 IF claim_post_video_source_cleanup(j,lease) IS NOT NULL THEN RAISE EXCEPTION 'reclaimed deleted source'; END IF;
 IF NOT EXISTS(SELECT 1 FROM post_attachments WHERE id=a AND size_bytes=100 AND storage_key='optimized/test.mp4') THEN RAISE EXCEPTION 'output changed'; END IF;
END $$;
SET ROLE authenticated;
DO $$ BEGIN BEGIN PERFORM claim_post_video_source_cleanup(gen_random_uuid(),gen_random_uuid());RAISE EXCEPTION 'user claimed source';EXCEPTION WHEN insufficient_privilege THEN NULL;END;END $$;
RESET ROLE;
\echo '24h source retention lease/reference/tombstone/ACL passed'

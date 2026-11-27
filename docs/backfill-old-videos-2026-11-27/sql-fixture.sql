\set ON_ERROR_STOP on
BEGIN;
DO $$
DECLARE owner uuid:='11111111-1111-4111-8111-111111111111'; pid uuid:='22222222-2222-4222-8222-222222222222'; sid uuid:='33333333-3333-4333-8333-333333333333'; item uuid:=gen_random_uuid(); token uuid:=gen_random_uuid(); q jsonb; admitted jsonb; jid uuid; old_url text; key text; pub jsonb; n integer:=0;
BEGIN
 IF has_function_privilege('anon','claim_post_video_backfill(uuid)','EXECUTE') OR has_function_privilege('authenticated','admit_post_video_backfill(uuid,uuid,bigint,text,jsonb)','EXECUTE') THEN RAISE EXCEPTION 'RPC ACL'; END IF;n:=n+1;
 key:='videos/'||owner||'/old.mp4';old_url:='https://media.fun.rich/'||key;
 INSERT INTO posts(id,user_id,video_url) VALUES(pid,owner,old_url);
 INSERT INTO post_video_backfill_items(id,run_name,post_id,user_id,source_url,source_key,kind) VALUES(item,'test',pid,owner,old_url,key,'feed');
 IF claim_post_video_backfill(token) IS NOT NULL THEN RAISE EXCEPTION 'Default OFF'; END IF;n:=n+1;
 UPDATE post_video_processing_control SET enabled=true,import_enabled=true,publish_enabled=true,delete_enabled=true;
 UPDATE post_video_backfill_control SET enabled=true;
 q:=claim_post_video_backfill(token);IF q->>'id'<>item::text THEN RAISE EXCEPTION 'Claim'; END IF;n:=n+1;
 IF claim_post_video_backfill(gen_random_uuid()) IS NOT NULL THEN RAISE EXCEPTION 'Concurrent inspection'; END IF;n:=n+1;
 IF admit_post_video_backfill(item,gen_random_uuid(),1000,'"etag"') IS NOT NULL THEN RAISE EXCEPTION 'Lease fencing'; END IF;n:=n+1;
 admitted:=admit_post_video_backfill(item,token,1000,'"etag"');jid:=(admitted->>'jobId')::uuid;
 IF jid IS NULL OR (SELECT canary FROM post_video_processing_jobs WHERE id=jid) OR (SELECT snapshot->'post'->>'video_url' FROM post_video_backfill_items WHERE id=item)<>old_url THEN RAISE EXCEPTION 'Owned admission/snapshot'; END IF;n:=n+1;
 INSERT INTO post_video_backfill_items(id,run_name,post_id,user_id,source_url,source_key,kind) VALUES(gen_random_uuid(),'test',pid,owner,old_url||'2',key||'2','feed');
 IF claim_post_video_backfill(gen_random_uuid()) IS NOT NULL THEN RAISE EXCEPTION 'Active job admission'; END IF;n:=n+1;
 UPDATE post_video_processing_jobs SET phase='complete',stream_uid=repeat('a',32) WHERE id=jid;
 IF claim_post_video_backfill(gen_random_uuid()) IS NOT NULL THEN RAISE EXCEPTION 'Undeleted VOD admission'; END IF;n:=n+1;
 UPDATE post_video_processing_jobs SET stream_deleted_at=now() WHERE id=jid;
 DELETE FROM post_video_backfill_items WHERE status='pending';
 item:=gen_random_uuid();token:=gen_random_uuid();INSERT INTO post_video_backfill_items(id,run_name,post_id,user_id,source_url,source_key,kind) VALUES(item,'duplicate',pid,owner,old_url,key,'feed');
 PERFORM claim_post_video_backfill(token);PERFORM admit_post_video_backfill(item,token,1000,'"etag"');
 IF (SELECT reason FROM post_video_backfill_items WHERE id=item)<>'source_already_registered' THEN RAISE EXCEPTION 'Duplicate source'; END IF;n:=n+1;
 item:=gen_random_uuid();token:=gen_random_uuid();INSERT INTO post_video_backfill_items(id,run_name,post_id,user_id,source_url,source_key,kind) VALUES(item,'rtmp',pid,owner,old_url,key,'feed');PERFORM claim_post_video_backfill(token);
 INSERT INTO live_sessions(id,post_id,mode,status,ended_at) VALUES(sid,pid,'rtmp_obs','ended',now());PERFORM admit_post_video_backfill(item,token,1000,'"etag"');
 IF (SELECT reason FROM post_video_backfill_items WHERE id=item)<>'excluded_rtmp' THEN RAISE EXCEPTION 'RTMP exclusion'; END IF;n:=n+1;
 DELETE FROM live_sessions;DELETE FROM post_video_backfill_items;DELETE FROM post_video_processing_jobs;DELETE FROM post_attachments;
 -- Privacy changes after inventory must prevent any publication/admission.
 item:=gen_random_uuid();token:=gen_random_uuid();INSERT INTO post_video_backfill_items(id,run_name,post_id,user_id,source_url,source_key,kind) VALUES(item,'private',pid,owner,old_url,key,'feed');PERFORM claim_post_video_backfill(token);UPDATE posts SET visibility='private' WHERE id=pid;PERFORM admit_post_video_backfill(item,token,1000,'"etag"');
 IF (SELECT reason FROM post_video_backfill_items WHERE id=item)<>'post_changed' THEN RAISE EXCEPTION 'Privacy fence'; END IF;n:=n+1;
 UPDATE posts SET visibility='public';DELETE FROM post_video_backfill_items;
 -- Canonical webcam sources require a real ended, same-owner Agora session.
 key:='replays/'||owner||'/'||sid||'/replay.mp4';old_url:='https://media.fun.rich/'||key;
 UPDATE posts SET post_type='live_replay',video_url=old_url,metadata=jsonb_build_object('live_mode','agora_webcam','playback_url',old_url,'archive_mp4_url',old_url);
 INSERT INTO live_sessions(id,post_id,mode,status,ended_at,host_user_id,r2_video_url,r2_object_key) VALUES(sid,pid,'agora_webcam','ended',now(),owner,old_url,key);
 item:=gen_random_uuid();token:=gen_random_uuid();INSERT INTO post_video_backfill_items(id,run_name,post_id,user_id,source_url,source_key,kind) VALUES(item,'webcam',pid,owner,old_url,key,'webcam');PERFORM claim_post_video_backfill(token);
 admitted:=admit_post_video_backfill(item,token,1000,'"etag"');jid:=(admitted->>'jobId')::uuid;
 IF jid IS NULL OR NOT (SELECT canary AND delete_approved AND runtime->>'legacyWebcamSession'=sid::text FROM post_video_processing_jobs WHERE id=jid) THEN RAISE EXCEPTION 'Webcam attestation'; END IF;n:=n+1;
 UPDATE post_video_processing_jobs SET phase='publishing',lease_token=token,lease_until=now()+interval '1 minute',output_size=500,output_bucket='fun-rich-video-optimized',output_key='optimized/'||attachment_id||'/'||source_generation||'.mp4',output_verified_at=now() WHERE id=jid;
 UPDATE posts SET metadata=jsonb_set(metadata,'{live_mode}','"rtmp_obs"');
 IF publish_post_video_output(jid,token) IS NOT NULL OR (SELECT video_url FROM posts WHERE id=pid)<>old_url THEN RAISE EXCEPTION 'RTMP changed before publication'; END IF;n:=n+1;
 UPDATE posts SET metadata=jsonb_set(metadata,'{live_mode}','"agora_webcam"');
 pub:=publish_post_video_output(jid,token);
 IF pub IS NULL OR (SELECT metadata->>'playback_url' FROM posts WHERE id=pid)<>pub->>'gateway_url' OR (SELECT metadata->>'archive_mp4_url' FROM posts WHERE id=pid)<>pub->>'gateway_url' OR pub->'snapshot'->'post_media'->>'video_url'<>old_url THEN RAISE EXCEPTION 'Webcam atomic publication'; END IF;n:=n+1;
 IF (SELECT r2_video_url FROM live_sessions WHERE id=sid)<>old_url THEN RAISE EXCEPTION 'Other playback reference changed'; END IF;n:=n+1;
 IF NOT EXISTS(SELECT 1 FROM pg_class WHERE relname='post_video_backfill_items' AND relrowsecurity) THEN RAISE EXCEPTION 'Queue RLS'; END IF;n:=n+1;
 RAISE NOTICE 'PASS % SQL guards',n;
END $$;
ROLLBACK;

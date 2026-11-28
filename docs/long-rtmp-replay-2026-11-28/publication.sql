BEGIN;
DO $$
DECLARE r record; s record; p record;
BEGIN
 SELECT id,live_session_id,stream_uid,cloudflare_video_uid,replay_post_id,user_id,deleted_at,r2_object_key,r2_video_url,stream_deleted_at,cloudflare_deleted_at,archive_lease_until INTO STRICT r FROM public.live_replays WHERE id='2dcca8db-db44-49b8-97cc-edf261682786' FOR UPDATE;
 SELECT id,deleted_at,ended_at,mode,privacy,cloudflare_video_uid INTO STRICT s FROM public.live_sessions WHERE id=r.live_session_id FOR UPDATE;
 SELECT id,user_id,deleted_at,visibility,metadata,video_url INTO STRICT p FROM public.posts WHERE id='26c9de27-1a4d-4153-b469-f3927fad277f' FOR UPDATE;
 IF r.live_session_id <> '1dbef509-286b-499b-b634-526d1c37d4f5' OR coalesce(r.stream_uid,r.cloudflare_video_uid) IS DISTINCT FROM '4641dfe88bdfaf390fdca77d5707cb26'
 OR r.user_id IS DISTINCT FROM 'e16a7fa8-0c38-41b1-a7a8-fad1269ced78'::uuid OR r.replay_post_id IS DISTINCT FROM p.id OR r.user_id IS DISTINCT FROM p.user_id OR r.deleted_at IS NOT NULL OR s.deleted_at IS NOT NULL OR p.deleted_at IS NOT NULL
 OR s.ended_at IS NULL OR s.mode IS DISTINCT FROM 'rtmp_obs' OR s.privacy IS DISTINCT FROM 'public' OR p.visibility IS DISTINCT FROM 'public'
 OR p.metadata->>'live_session_id' IS DISTINCT FROM s.id::text OR p.metadata->>'cloudflare_video_uid' IS DISTINCT FROM '4641dfe88bdfaf390fdca77d5707cb26'
 OR (p.video_url IS NOT NULL AND p.video_url NOT LIKE '%4641dfe88bdfaf390fdca77d5707cb26%')
 OR s.cloudflare_video_uid IS DISTINCT FROM '4641dfe88bdfaf390fdca77d5707cb26' OR r.r2_object_key IS NOT NULL OR r.r2_video_url IS NOT NULL
 OR r.stream_deleted_at IS NOT NULL OR r.cloudflare_deleted_at IS NOT NULL OR (r.archive_lease_until IS NOT NULL AND r.archive_lease_until>now())
 THEN RAISE EXCEPTION 'Replay recovery preconditions changed'; END IF;
 UPDATE public.live_replays SET r2_object_key='live-replays/e16a7fa8-0c38-41b1-a7a8-fad1269ced78/1dbef509-286b-499b-b634-526d1c37d4f5/4641dfe88bdfaf390fdca77d5707cb26-hls-recovered.mp4',r2_bucket='fun-rich-media',r2_video_url='https://media.fun.rich/live-replays/e16a7fa8-0c38-41b1-a7a8-fad1269ced78/1dbef509-286b-499b-b634-526d1c37d4f5/4641dfe88bdfaf390fdca77d5707cb26-hls-recovered.mp4',
 playback_mp4='https://media.fun.rich/live-replays/e16a7fa8-0c38-41b1-a7a8-fad1269ced78/1dbef509-286b-499b-b634-526d1c37d4f5/4641dfe88bdfaf390fdca77d5707cb26-hls-recovered.mp4',filesize_bytes=2758959012,mp4_total_bytes=2758959012,duration_seconds=14555,
 r2_verified_at=now(),archived_at=now(),archive_status='archived',archive_phase='posting',archive_error=NULL,error_message=NULL,
 archive_next_retry_at=now(),archive_lease_until=NULL,last_cf_status='hls_recovery_verified',last_cf_response='{"recovery":"HLS remux; no reencode","sha256":"8f32c55650b56769d2b7c7ea7c385fbaafbf8f4ce929b526bf2dac90240edb7c","bytes":2758959012,"full_decode":true,"duration_seconds":14554.1005,"verified_at":"2026-11-28T10:11:29.685Z","etag":"\"ec76a15302c3e92603097f571506c7a1-165\"","verification_mode":"ordered complete coverage by byte ranges with fixed ETag","range_requests":329}'::jsonb,expires_at=NULL,updated_at=now()
 WHERE id=r.id;
END $$;
COMMIT;
select id,archive_status,archive_phase,r2_object_key,filesize_bytes,r2_verified_at from public.live_replays where id='2dcca8db-db44-49b8-97cc-edf261682786';

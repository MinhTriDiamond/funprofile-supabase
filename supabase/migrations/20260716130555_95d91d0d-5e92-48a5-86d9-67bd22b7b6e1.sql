
DO $$
DECLARE
  v_session_ids uuid[] := ARRAY[
    '2cce6ccf-ebbe-452f-8441-0c0c617448b0'::uuid,
    'a3c5eda8-f4bf-48fe-803c-16e988287cf3'::uuid,
    'd507eeab-b956-4833-a615-2fa11091c0a6'::uuid
  ];
  v_post_ids uuid[] := ARRAY[
    '7169f90f-ba61-4f01-9fb5-ff38d43db018'::uuid,
    '3a6cc8a9-ac6b-47e2-b192-a53544096785'::uuid,
    'c1cf536a-eb0d-4363-ab3e-b5c18973d6a5'::uuid
  ];
  v_host uuid := '1c98a6eb-b939-43ab-aa6a-96a50b7b559f';
  v_friendly text := 'Phien live khong co video replay vi dich vu ghi hinh dang bao tri. Khong phai loi tu phia ban.';
BEGIN
  UPDATE public.live_sessions
     SET recording_status = 'failed_credentials',
         recording_error_code = COALESCE(recording_error_code, 'AGORA_INVALID_APPID'),
         archive_status = 'failed_no_recording',
         updated_at = now()
   WHERE id = ANY(v_session_ids);

  UPDATE public.posts
     SET processing_message = v_friendly,
         updated_at = now()
   WHERE id = ANY(v_post_ids);

  UPDATE public.live_replays
     SET status = 'failed',
         replay_status = 'failed_no_recording',
         archive_status = 'failed',
         error_message = v_friendly,
         updated_at = now()
   WHERE live_session_id = ANY(v_session_ids);

  INSERT INTO public.notifications (user_id, actor_id, type, metadata, read)
  SELECT v_host, v_host,
         'live_replay_failed',
         jsonb_build_object(
           'kind', 'agora_invalid_appid_backfill_20260716',
           'title', 'Video replay khong luu duoc',
           'message', v_friendly,
           'session_ids', to_jsonb(v_session_ids)
         ),
         false
  WHERE NOT EXISTS (
    SELECT 1 FROM public.notifications
     WHERE user_id = v_host
       AND metadata->>'kind' = 'agora_invalid_appid_backfill_20260716'
  );
END $$;
